const { uploadM3U, getMetadata, saveMetadata } = require('../_lib/storage');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let filename = 'upload.m3u';
        let content = '';

        if (req.body && req.body.file) {
            const fileData = req.body.file;
            filename = req.body.filename || 'upload.m3u';
            content = Buffer.from(fileData, 'base64').toString('utf-8');
        } else if (req.body && req.body.content) {
            filename = req.body.filename || 'upload.m3u';
            content = req.body.content;
        } else {
            return res.status(400).json({ error: 'Aucun fichier reçu' });
        }

        const itemCount = (content.match(/#EXTINF/g) || []).length;
        const blob = await uploadM3U(filename, content);
        const metadata = await getMetadata();
        const newId = Date.now().toString();

        const newFile = {
            id: newId,
            name: filename,
            url: blob.url,
            itemCount,
            is_active: true,
            created_at: new Date().toISOString()
        };

        metadata.files = metadata.files || [];
        metadata.files.unshift(newFile);
        metadata.activeId = newId;

        await saveMetadata(metadata);

        res.status(200).json({
            success: true,
            id: newFile.id,
            name: filename,
            itemCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
