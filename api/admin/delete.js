const { getMetadata, saveMetadata, deleteM3U } = require('../_lib/storage');

module.exports = async function handler(req, res) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { id } = req.query;
        const metadata = await getMetadata();
        
        const file = metadata.files.find(f => f.id === id);
        if (!file) {
            return res.status(404).json({ error: 'Fichier non trouvé' });
        }

        // Supprimer le fichier du storage
        await deleteM3U(file.url);

        // Retirer de la liste
        metadata.files = metadata.files.filter(f => f.id !== id);
        if (metadata.activeId === id) metadata.activeId = null;
        
        await saveMetadata(metadata);

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
