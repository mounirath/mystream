const { getMetadata, readM3U, DEMO_CONTENT } = require('../_lib/storage');

// Vercel Serverless Function Payload Limit est strictement de 4.5 Mo
const MAX_SAFE_PAYLOAD_BYTES = 3.5 * 1024 * 1024; // 3.5 Mo

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        return res.status(200).end();
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    try {
        const metadata = await getMetadata().catch(() => null);
        
        if (metadata && metadata.files && metadata.files.length > 0) {
            const activeId = metadata.activeId || metadata.files[0].id;
            const file = metadata.files.find(f => f.id === activeId) || metadata.files[0];
            
            if (file) {
                let content = await readM3U(file.url).catch(() => DEMO_CONTENT);
                if (!content) content = DEMO_CONTENT;

                const totalItems = (content.match(/#EXTINF/g) || []).length;

                // Protéger contre le crash Vercel 500 (limite 4.5 Mo de payload AWS Lambda)
                if (content.length > MAX_SAFE_PAYLOAD_BYTES) {
                    const cut = content.substring(0, MAX_SAFE_PAYLOAD_BYTES);
                    const lastNl = cut.lastIndexOf('\n');
                    content = cut.substring(0, lastNl > 0 ? lastNl : cut.length);
                }

                return res.status(200).json({
                    name: file.name || 'Catalogue MyStream',
                    content: content,
                    itemCount: totalItems
                });
            }
        }

        // Fallback démo garanti
        return res.status(200).json({
            name: 'Démo Catalogue (Films & Séries)',
            content: DEMO_CONTENT,
            itemCount: 6
        });
    } catch (error) {
        console.warn('Erreur active.js évitée:', error.message);
        return res.status(200).json({
            name: 'Démo Catalogue (Films & Séries)',
            content: DEMO_CONTENT,
            itemCount: 6
        });
    }
};
