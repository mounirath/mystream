const { getMetadata, saveMetadata } = require('../_lib/storage');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { id } = req.query;
        const metadata = await getMetadata();
        
        const exists = metadata.files.some(f => f.id === id);
        if (!exists) {
            return res.status(404).json({ error: 'Fichier non trouvé' });
        }

        metadata.activeId = id;
        await saveMetadata(metadata);

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
