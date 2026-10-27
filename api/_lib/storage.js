const { put, list, del, read } = require('@vercel/blob');

const METADATA_KEY = 'mystream-metadata.json';

// Lire les métadonnées
async function getMetadata() {
    try {
        const blob = await read(METADATA_KEY, { type: 'json' });
        return blob || { files: [], activeId: null };
    } catch {
        return { files: [], activeId: null };
    }
}

// Sauvegarder les métadonnées
async function saveMetadata(metadata) {
    await put(METADATA_KEY, JSON.stringify(metadata), {
        access: 'public',
        contentType: 'application/json'
    });
}

// Upload un fichier M3U
async function uploadM3U(filename, content) {
    const key = `m3u/${Date.now()}-${filename}`;
    const blob = await put(key, content, {
        access: 'public',
        contentType: 'text/plain'
    });
    return blob;
}

// Lire un fichier M3U
async function readM3U(url) {
    const response = await fetch(url);
    return await response.text();
}

// Supprimer un fichier M3U
async function deleteM3U(url) {
    try {
        await del(url);
    } catch (e) {
        console.error('Erreur suppression:', e);
    }
}

module.exports = { getMetadata, saveMetadata, uploadM3U, readM3U, deleteM3U };
