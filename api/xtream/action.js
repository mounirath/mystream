module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { server, username, password, action, params } = req.body;
        if (!server || !username || !password) {
            return res.status(400).json({ error: 'Serveur, identifiant et mot de passe requis' });
        }

        // Mode démo
        if (server === 'demo' || server.toLowerCase().includes('demo')) {
            if (!action) {
                return res.status(200).json({
                    user_info: { username: "demo_streamer", status: "Active", exp_date: "1893456000", is_trial: "0", active_cons: "1", max_connections: "2" },
                    server_info: { url: "demo.mystream.local", port: "8080", https_port: "8443", server_protocol: "https" }
                });
            }
            if (action === 'get_live_categories') return res.status(200).json([{ category_id: "1", category_name: "Généraliste" }, { category_id: "2", category_name: "Cinéma" }]);
            if (action === 'get_live_streams') return res.status(200).json([{ num: 1, name: "Blender TV HD (Live)", stream_id: "101", stream_icon: "https://test-streams.mux.dev/test_001/stream.png", category_id: "1", direct_source: "https://test-streams.mux.dev/test_001/stream.m3u8" }]);
            if (action === 'get_vod_categories') return res.status(200).json([{ category_id: "10", category_name: "Animation" }]);
            if (action === 'get_vod_streams') return res.status(200).json([{ num: 1, name: "Big Buck Bunny", stream_id: "201", stream_icon: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg", category_id: "10", container_extension: "mp4", direct_source: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" }]);
            if (action === 'get_series_categories') return res.status(200).json([{ category_id: "20", category_name: "Séries Démo" }]);
            if (action === 'get_series') return res.status(200).json([{ num: 1, name: "Open Movie Project", series_id: "301", cover: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg", category_id: "20" }]);
            if (action === 'get_series_info') return res.status(200).json({
                seasons: [{ season_number: 1, name: "Saison 1" }],
                episodes: { "1": [{ id: "401", episode_num: 1, title: "Épisode 1", direct_source: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" }] }
            });
            return res.status(200).json([]);
        }

        let cleanedServer = server.trim();
        if (!cleanedServer.startsWith('http://') && !cleanedServer.startsWith('https://')) {
            cleanedServer = 'http://' + cleanedServer;
        }
        cleanedServer = cleanedServer.replace(/\/+$/, '');

        const url = new URL(`${cleanedServer}/player_api.php`);
        url.searchParams.set('username', username);
        url.searchParams.set('password', password);

        if (action) {
            url.searchParams.set('action', action);
        }

        if (params && typeof params === 'object') {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined && v !== null) {
                    url.searchParams.set(k, String(v));
                }
            }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 18000);

        const response = await fetch(url.toString(), {
            headers: {
                'User-Agent': 'IPTVSmarters/1.0.0 (Linux; Android 10)',
                'Accept': 'application/json, text/plain, */*'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            return res.status(response.status).json({ error: `Erreur serveur Xtream: ${response.statusText}` });
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Impossible de contacter le serveur Xtream' });
    }
};
