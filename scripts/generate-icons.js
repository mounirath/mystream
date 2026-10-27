const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size, isMaskable = false) {
    const width = size;
    const height = size;
    
    // Scanlines: (1 filter byte + width * 4 bytes RGBA) * height
    const rowSize = 1 + width * 4;
    const rawData = Buffer.alloc(rowSize * height);
    
    const center = size / 2;
    const radius = size * (isMaskable ? 0.38 : 0.44);
    
    for (let y = 0; y < height; y++) {
        const rowStart = y * rowSize;
        rawData[rowStart] = 0; // Filter type None
        
        for (let x = 0; x < width; x++) {
            const pixelStart = rowStart + 1 + x * 4;
            
            // Fond dégradé violet/orange/sombre
            const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
            const normX = x / width;
            const normY = y / height;
            
            let r, g, b, a;
            
            if (dist <= radius) {
                // Dégradé violet (#8b5cf6) à rose (#ec4899) à orange (#f59e0b)
                r = Math.floor(139 + (236 - 139) * normX + (245 - 236) * normY);
                g = Math.floor(92 + (72 - 92) * normX + (158 - 72) * normY);
                b = Math.floor(246 + (153 - 246) * normX);
                a = 255;
                
                // Dessiner un symbole de clapperboard / play triangle au centre
                const relX = (x - center) / (size * 0.22);
                const relY = (y - center) / (size * 0.22);
                
                // Play triangle
                const inTriangle = (relX >= -0.5 && relX <= 0.7 && Math.abs(relY) <= (0.7 - relX * 0.5) * 0.9);
                if (inTriangle) {
                    r = 255;
                    g = 255;
                    b = 255;
                    a = 255;
                }
            } else {
                // Fond sombre (#0f172a)
                if (isMaskable) {
                    r = 15;
                    g = 23;
                    b = 42;
                    a = 255;
                } else {
                    // Transparent ou arrondi doux
                    const edgeDist = dist - radius;
                    if (edgeDist < 2) {
                        r = 139; g = 92; b = 246;
                        a = Math.floor(255 * (1 - edgeDist / 2));
                    } else {
                        r = 0; g = 0; b = 0; a = 0;
                    }
                }
            }
            
            rawData[pixelStart] = r;
            rawData[pixelStart + 1] = g;
            rawData[pixelStart + 2] = b;
            rawData[pixelStart + 3] = a;
        }
    }
    
    // Compress IDAT with zlib
    const deflated = zlib.deflateSync(rawData);
    
    // Calcul CRC32
    function crc32(buf) {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
            c ^= buf[i];
            for (let j = 0; j < 8; j++) {
                c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
            }
        }
        return (c ^ 0xffffffff) >>> 0;
    }
    
    function makeChunk(type, data) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(typeAndData), 0);
        return Buffer.concat([len, typeAndData, crc]);
    }
    
    // IHDR
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace
    
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG Signature
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', deflated),
        makeChunk('IEND', Buffer.alloc(0))
    ]);
}

const publicDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), createPNG(192));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), createPNG(512));
fs.writeFileSync(path.join(publicDir, 'icon-maskable.png'), createPNG(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPNG(180, true));
console.log('Icons generated successfully in public/');
