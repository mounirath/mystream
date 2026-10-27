const { uploadM3U, getMetadata, saveMetadata } = require('../_lib/storage');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Vercel parse automatiquement le body multipart
        let filename, content;

        if (req.body && req.body.file) {
            // Cas où le fichier est envoyé en base64
            const fileData = req.body.file;
            filename = req.body.filename || 'upload.m3u';
            content = Buffer.from(fileData, 'base64').toString('utf-8');
        } else if (req.files && req.files.m3ufile) {
            const file = req.files.m3ufile;
            filename = file.name;
            content = file.toBuffer().toString('utf-8');
        } else {
            return res.status(400).json({ error: 'Aucun fichier reçu' });
        }

        // Vérifier extension
        if (!filename.match(/\.(m3u|m3u8)$/i)) {
            return res.status(400).json({ error: 'Seuls les fichiers M3U sont acceptés' });
        }

        // Compter les éléments
        const itemCount = (content.match(/#EXTINF/g) || []).length;

        // Upload vers Vercel Blob
        const blob = await uploadM3U(filename, content);

        // Mettre à jour métadonnées
        const metadata = await getMetadata();
        const newFile = {
            id: Date.now().toString(),
            name: filename,
            url: blob.url,
            itemCount,
            is_active: false,
            created_at: new Date().toISOString()
        };
        metadata.files.unshift(newFile);
        await saveMetadata(metadata);

        res.status(200).json({
            success: true,
            id: newFile.id,
            name: filename,
            itemCount
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

// Config pour accepter les gros fichiers
module.exports.config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb'
        }
    }
};
