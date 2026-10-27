const { getMetadata, readM3U } = require('../_lib/storage');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const metadata = await getMetadata();
        
        if (!metadata.activeId) {
            return res.status(404).json({ error: 'Aucun fichier actif' });
        }

        const file = metadata.files.find(f => f.id === metadata.activeId);
        if (!file) {
            return res.status(404).json({ error: 'Fichier actif introuvable' });
        }

        // Lire le contenu du M3U
        const content = await readM3U(file.url);

        res.status(200).json({
            name: file.name,
            content,
            itemCount: file.itemCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Cache 60s pour performance
module.exports.config = {
    api: {
        responseLimit: '50mb'
    }
};
