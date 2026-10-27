const { getMetadata, saveMetadata, deleteM3U } = require('../_lib/storage');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const id = (req.query && req.query.id) || (req.body && req.body.id);
        const metadata = await getMetadata();
        
        const file = (metadata.files || []).find(f => f.id === id);
        if (file && file.url) {
            await deleteM3U(file.url).catch(() => {});
        }

        metadata.files = (metadata.files || []).filter(f => f.id !== id);
        if (metadata.activeId === id) {
            metadata.activeId = metadata.files.length > 0 ? metadata.files[0].id : null;
        }
        
        await saveMetadata(metadata);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(200).json({ success: true });
    }
};
