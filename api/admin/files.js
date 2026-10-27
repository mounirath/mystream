const { getMetadata } = require('../_lib/storage');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const metadata = await getMetadata().catch(() => ({ files: [], activeId: null }));
        const files = (metadata.files || []).map(f => ({
            ...f,
            is_active: f.id === metadata.activeId
        }));
        res.status(200).json(files);
    } catch (error) {
        res.status(200).json([]);
    }
};
