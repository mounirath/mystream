const { getMetadata, saveMetadata } = require('../_lib/storage');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const id = (req.query && req.query.id) || (req.body && req.body.id);
        const metadata = await getMetadata();
        
        metadata.activeId = id;
        await saveMetadata(metadata);

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(200).json({ success: true });
    }
};
