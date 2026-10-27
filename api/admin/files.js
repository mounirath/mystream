const { getMetadata } = require('../_lib/storage');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const metadata = await getMetadata();
        const files = metadata.files.map(f => ({
            ...f,
            is_active: f.id === metadata.activeId
        }));
        res.status(200).json(files);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
