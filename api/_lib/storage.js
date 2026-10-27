const fs = require('fs');
const path = require('path');
const os = require('os');

let vercelBlob = null;
try {
    vercelBlob = require('@vercel/blob');
} catch (e) {}

// Sur Vercel Serverless, seul /tmp est accessible en écriture !
const DATA_DIR = path.join(os.tmpdir(), 'mystream-data');
const METADATA_FILE = path.join(DATA_DIR, 'metadata.json');
const METADATA_KEY = 'mystream-metadata.json';

try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
} catch (e) {
    // Ne jamais crasher au démarrage du module
}

const DEMO_CONTENT = `#EXTM3U
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg" group-title="Films Animation",Big Buck Bunny [1080p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg" group-title="Films Animation",Elephants Dream [720p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg" group-title="Films Animation",Sintel - The Durian Project [1080p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg" group-title="Films Sci-Fi",Tears of Steel [4K]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg" group-title="Films Action",For Bigger Blazes [1080p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4
#EXTINF:-1 tvg-logo="https://test-streams.mux.dev/test_001/stream.png" group-title="Série Stream Test - Saison 1",Big Buck Bunny HLS [1080p]
https://test-streams.mux.dev/test_001/stream.m3u8`;

const defaultMetadata = {
    activeId: 'demo-1',
    files: [
        {
            id: 'demo-1',
            name: 'Démo Catalogue (Films & Séries)',
            url: 'memory:demo-catalogue',
            itemCount: 6,
            is_active: true,
            created_at: new Date().toISOString()
        }
    ]
};

const memoryBlobs = new Map();
memoryBlobs.set('memory:demo-catalogue', DEMO_CONTENT);

function isVercelBlobConfigured() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN && vercelBlob);
}

// Lire les métadonnées avec tolérance totale aux pannes
async function getMetadata() {
    if (isVercelBlobConfigured()) {
        try {
            const blobs = await vercelBlob.list({ prefix: METADATA_KEY });
            const metaBlob = (blobs && blobs.blobs) ? blobs.blobs.find(b => b.pathname === METADATA_KEY) : null;
            if (metaBlob && metaBlob.url) {
                const res = await fetch(metaBlob.url);
                if (res.ok) {
                    const json = await res.json();
                    if (json && json.files) return json;
                }
            }
        } catch (e) {
            console.warn('Vercel Blob read notice:', e.message);
        }
    }

    try {
        if (fs.existsSync(METADATA_FILE)) {
            const data = fs.readFileSync(METADATA_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            if (parsed && parsed.files) return parsed;
        }
    } catch (e) {}

    return defaultMetadata;
}

// Sauvegarder les métadonnées
async function saveMetadata(metadata) {
    if (isVercelBlobConfigured()) {
        try {
            await vercelBlob.put(METADATA_KEY, JSON.stringify(metadata), {
                access: 'public',
                contentType: 'application/json',
                addRandomSuffix: false
            });
            return;
        } catch (e) {
            console.warn('Vercel Blob save notice:', e.message);
        }
    }

    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (e) {}
}

// Upload un fichier M3U
async function uploadM3U(filename, content) {
    const safeName = (filename || 'playlist.m3u').replace(/[^a-zA-Z0-9.-]/g, '_');
    
    if (isVercelBlobConfigured()) {
        try {
            const key = `m3u/${Date.now()}-${safeName}`;
            const blob = await vercelBlob.put(key, content, {
                access: 'public',
                contentType: 'text/plain'
            });
            if (blob && blob.url) return blob;
        } catch (e) {
            console.warn('Vercel Blob upload notice:', e.message);
        }
    }

    const key = `memory:${Date.now()}-${safeName}`;
    memoryBlobs.set(key, content);

    try {
        const uploadDir = path.join(DATA_DIR, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, `${Date.now()}-${safeName}`);
        fs.writeFileSync(filePath, content, 'utf-8');
    } catch (e) {}

    return {
        url: key,
        pathname: key,
        contentType: 'text/plain'
    };
}

// Lire un fichier M3U
async function readM3U(url) {
    if (!url || url === 'memory:demo-catalogue') {
        return DEMO_CONTENT;
    }
    if (memoryBlobs.has(url)) {
        return memoryBlobs.get(url);
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
        try {
            const response = await fetch(url);
            if (response.ok) return await response.text();
        } catch (e) {}
    }
    return DEMO_CONTENT;
}

// Supprimer un fichier M3U
async function deleteM3U(url) {
    if (isVercelBlobConfigured() && (url.startsWith('http://') || url.startsWith('https://'))) {
        try {
            await vercelBlob.del(url);
        } catch (e) {}
    }
    memoryBlobs.delete(url);
}

module.exports = { getMetadata, saveMetadata, uploadM3U, readM3U, deleteM3U, DEMO_CONTENT };
