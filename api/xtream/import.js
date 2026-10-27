const { uploadM3U, getMetadata, saveMetadata } = require('../_lib/storage');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { server, username, password } = req.body;
        if (!server || !username || !password) {
            return res.status(400).json({ error: 'Paramètres Xtream incomplets' });
        }

        let cleaned = server.trim();
        if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
            cleaned = 'http://' + cleaned;
        }
        cleaned = cleaned.replace(/\/+$/, '');

        const hostDisplay = new URL(cleaned).hostname;
        const m3uUrl = `${cleaned}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=m3u8`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        const response = await fetch(m3uUrl, {
            headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Téléchargement de la playlist M3U refusé par le serveur Xtream' });
        }

        const content = await response.text();
        const itemCount = (content.match(/#EXTINF/g) || []).length;
        const filename = `xtream-${hostDisplay}.m3u`;

        const blob = await uploadM3U(filename, content);
        const metadata = await getMetadata();
        const newId = Date.now().toString();

        const newFile = {
            id: newId,
            name: `Xtream (${hostDisplay} - ${username})`,
            url: blob.url,
            itemCount,
            created_at: new Date().toISOString()
        };

        metadata.files = metadata.files || [];
        metadata.files.unshift(newFile);
        metadata.activeId = newId;

        await saveMetadata(metadata);

        res.status(200).json({
            success: true,
            id: newId,
            name: newFile.name,
            itemCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
