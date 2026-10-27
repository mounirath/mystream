// MOCKED in-memory & file storage for Vercel Blob compatibility
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const METADATA_FILE = path.join(DATA_DIR, 'metadata.json');

if (!fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {}
}

const memoryBlobs = new Map();

async function getMetadata() {
    try {
        if (fs.existsSync(METADATA_FILE)) {
            const data = fs.readFileSync(METADATA_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.warn('Error reading metadata file:', e);
    }
    return { files: [], activeId: null };
}

async function saveMetadata(metadata) {
    try {
        fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (e) {
        console.warn('Error saving metadata file:', e);
    }
}

async function uploadM3U(filename, content) {
    const key = `m3u/${Date.now()}-${filename}`;
    memoryBlobs.set(key, content);
    
    // Also save to disk if possible
    try {
        const uploadDir = path.join(DATA_DIR, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, `${Date.now()}-${filename}`);
        fs.writeFileSync(filePath, content, 'utf-8');
    } catch {}

    return {
        url: key,
        pathname: key,
        contentType: 'text/plain'
    };
}

async function readM3U(url) {
    if (memoryBlobs.has(url)) {
        return memoryBlobs.get(url);
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
        const response = await fetch(url);
        return await response.text();
    }
    return '';
}

async function deleteM3U(url) {
    memoryBlobs.delete(url);
}

module.exports = { getMetadata, saveMetadata, uploadM3U, readM3U, deleteM3U };
