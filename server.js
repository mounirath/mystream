const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Configuration dossiers
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'mystream.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Stockage des métadonnées (remplace better-sqlite3 sans dépendance native)
function readStore() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.warn('Erreur lecture DB:', e.message);
    }
    return { files: [] };
}

function writeStore(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('Erreur écriture DB:', e.message);
    }
}

// Initialiser avec une playlist de démonstration si vide
function initDemoData() {
    const store = readStore();
    if (!store.files || store.files.length === 0) {
        const demoContent = `#EXTM3U
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg" group-title="Films Animation",Big Buck Bunny [1080p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg" group-title="Films Animation",Elephants Dream [720p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg" group-title="Films Animation",Sintel - The Durian Project [1080p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg" group-title="Films Sci-Fi",Tears of Steel [4K]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg" group-title="Films Action",For Bigger Blazes [1080p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4
#EXTINF:-1 tvg-logo="https://test-streams.mux.dev/test_001/stream.png" group-title="Série Stream Test - Saison 1",Big Buck Bunny HLS [1080p]
https://test-streams.mux.dev/test_001/stream.m3u8`;

        const filename = 'demo-catalogue.m3u';
        const filepath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filepath, demoContent, 'utf-8');

        store.files = [{
            id: '1',
            name: 'Démo Catalogue (Films & Séries)',
            filename: filename,
            filepath: filepath,
            is_active: 1,
            created_at: new Date().toISOString(),
            item_count: 6,
            content: demoContent
        }];
        writeStore(store);
    }
}
initDemoData();

// Configuration multer pour upload multipart
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage,
    fileFilter: (req, file, cb) => {
        if (file.originalname.match(/\.(m3u|m3u8)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Seuls les fichiers M3U sont acceptés'));
        }
    }
});

// ===== API ADMIN =====

// Upload fichier M3U (supporte multipart multer ET payload JSON base64)
app.post('/api/admin/upload', (req, res, next) => {
    // Si c'est du JSON, passez directement au handler
    if (req.is('application/json')) {
        return next();
    }
    // Sinon utilisez multer
    upload.single('m3ufile')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, (req, res) => {
    try {
        let filename = '';
        let content = '';

        if (req.file) {
            filename = req.file.originalname;
            content = fs.readFileSync(req.file.path, 'utf-8');
        } else if (req.body && req.body.file) {
            // Fichier envoyé en base64
            filename = req.body.filename || `playlist-${Date.now()}.m3u`;
            content = Buffer.from(req.body.file, 'base64').toString('utf-8');
        } else if (req.body && req.body.content) {
            filename = req.body.filename || `playlist-${Date.now()}.m3u`;
            content = req.body.content;
        } else {
            return res.status(400).json({ error: 'Aucun fichier reçu' });
        }

        if (!filename.match(/\.(m3u|m3u8)$/i)) {
            return res.status(400).json({ error: 'Seuls les fichiers M3U sont acceptés' });
        }

        const safeFilename = Date.now() + '-' + filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filepath = path.join(UPLOADS_DIR, safeFilename);
        fs.writeFileSync(filepath, content, 'utf-8');

        const itemCount = (content.match(/#EXTINF/g) || []).length;
        const store = readStore();
        const id = Date.now().toString();

        const newFile = {
            id,
            name: filename,
            filename: safeFilename,
            filepath: filepath,
            is_active: store.files.length === 0 ? 1 : 0,
            created_at: new Date().toISOString(),
            item_count: itemCount,
            itemCount: itemCount,
            content: content
        };

        store.files.unshift(newFile);
        writeStore(store);

        res.json({ 
            success: true, 
            id: newFile.id,
            name: filename,
            itemCount 
        });
    } catch (error) {
        console.error('Erreur upload:', error);
        res.status(500).json({ error: error.message });
    }
});

// Lister tous les fichiers
app.get('/api/admin/files', (req, res) => {
    const store = readStore();
    const files = (store.files || []).map(f => ({
        id: f.id,
        name: f.name,
        filename: f.filename,
        is_active: Boolean(f.is_active),
        created_at: f.created_at,
        itemCount: f.item_count || f.itemCount || 0,
        item_count: f.item_count || f.itemCount || 0
    }));
    res.json(files);
});

// Activer un fichier (gère /:id ou query param ?id= ou body id)
function handleActivate(req, res) {
    const id = (req.params && req.params.id) || (req.query && req.query.id) || (req.body && req.body.id);
    if (!id) return res.status(400).json({ error: 'ID requis' });

    const store = readStore();
    let found = false;
    store.files.forEach(f => {
        if (f.id.toString() === id.toString()) {
            f.is_active = 1;
            found = true;
        } else {
            f.is_active = 0;
        }
    });

    if (!found) {
        return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    writeStore(store);
    res.json({ success: true });
}

app.post('/api/admin/activate/:id', handleActivate);
app.post('/api/admin/activate', handleActivate);

// Supprimer un fichier
function handleDelete(req, res) {
    const id = (req.params && req.params.id) || (req.query && req.query.id) || (req.body && req.body.id);
    if (!id) return res.status(400).json({ error: 'ID requis' });

    const store = readStore();
    const index = store.files.findIndex(f => f.id.toString() === id.toString());

    if (index === -1) {
        return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    const [deleted] = store.files.splice(index, 1);
    if (deleted.filepath && fs.existsSync(deleted.filepath)) {
        try { fs.unlinkSync(deleted.filepath); } catch {}
    }

    // Si on a supprimé le fichier actif et qu'il reste d'autres fichiers, activer le premier
    if (deleted.is_active && store.files.length > 0) {
        store.files[0].is_active = 1;
    }

    writeStore(store);
    res.json({ success: true });
}

app.delete('/api/admin/files/:id', handleDelete);
app.delete('/api/admin/delete/:id', handleDelete);
app.delete('/api/admin/delete', handleDelete);

// ===== API FRONTEND =====

// Récupérer le fichier M3U actif
app.get('/api/m3u/active', (req, res) => {
    const store = readStore();
    const file = (store.files || []).find(f => f.is_active);

    if (!file) {
        return res.status(404).json({ error: 'Aucun fichier actif' });
    }

    let content = file.content;
    if (!content && file.filepath && fs.existsSync(file.filepath)) {
        try {
            content = fs.readFileSync(file.filepath, 'utf-8');
        } catch (e) {
            console.error('Erreur lecture fichier physique:', e);
        }
    }

    if (!content) {
        return res.status(500).json({ error: 'Erreur de lecture du fichier M3U' });
    }

    res.json({
        name: file.name,
        content: content,
        itemCount: file.item_count || file.itemCount || 0
    });
});

// ===== API XTREAM CODES =====

function normalizeXtreamUrl(url) {
    if (!url) return '';
    let cleaned = url.trim();
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
        cleaned = 'http://' + cleaned;
    }
    return cleaned.replace(/\/+$/, '');
}

// Données démo Xtream pour tests immédiats sans compte
const DEMO_XTREAM_DATA = {
    user_info: {
        username: "demo_streamer",
        status: "Active",
        exp_date: "1893456000", // 2030
        is_trial: "0",
        active_cons: "1",
        max_connections: "2",
        created_at: "1672531199"
    },
    server_info: {
        url: "demo.mystream.local",
        port: "8080",
        https_port: "8443",
        server_protocol: "https",
        rtmp_port: "8880",
        timezone: "Europe/Paris"
    },
    live_categories: [
        { category_id: "1", category_name: "Généraliste & Divertissement" },
        { category_id: "2", category_name: "Cinéma & Séries" },
        { category_id: "3", category_name: "Sport & Découverte" }
    ],
    live_streams: [
        {
            num: 1,
            name: "Blender TV HD (Live HLS)",
            stream_type: "live",
            stream_id: "101",
            stream_icon: "https://test-streams.mux.dev/test_001/stream.png",
            epg_channel_id: "blender.tv",
            category_id: "1",
            direct_source: "https://test-streams.mux.dev/test_001/stream.m3u8"
        },
        {
            num: 2,
            name: "Cinema World 4K",
            stream_type: "live",
            stream_id: "102",
            stream_icon: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg",
            epg_channel_id: "cinema.world",
            category_id: "2",
            direct_source: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
        },
        {
            num: 3,
            name: "Sport Action Max",
            stream_type: "live",
            stream_id: "103",
            stream_icon: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg",
            epg_channel_id: "sport.max",
            category_id: "3",
            direct_source: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
        }
    ],
    vod_categories: [
        { category_id: "10", category_name: "Films Animation" },
        { category_id: "11", category_name: "Films Sci-Fi & Aventure" }
    ],
    vod_streams: [
        {
            num: 1,
            name: "Big Buck Bunny (2008)",
            stream_type: "movie",
            stream_id: "201",
            stream_icon: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
            rating: "8.5",
            category_id: "10",
            container_extension: "mp4",
            direct_source: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
        },
        {
            num: 2,
            name: "Sintel - Durian Project",
            stream_type: "movie",
            stream_id: "202",
            stream_icon: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg",
            rating: "8.1",
            category_id: "10",
            container_extension: "mp4",
            direct_source: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4"
        },
        {
            num: 3,
            name: "Tears of Steel 4K",
            stream_type: "movie",
            stream_id: "203",
            stream_icon: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg",
            rating: "7.9",
            category_id: "11",
            container_extension: "mp4",
            direct_source: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
        },
        {
            num: 4,
            name: "Elephants Dream HD",
            stream_type: "movie",
            stream_id: "204",
            stream_icon: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg",
            rating: "7.2",
            category_id: "10",
            container_extension: "mp4",
            direct_source: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
        }
    ],
    series_categories: [
        { category_id: "20", category_name: "Séries Démo" }
    ],
    series: [
        {
            num: 1,
            name: "Open Movie Project",
            series_id: "301",
            cover: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
            plot: "Une série d'animations 3D de renommée mondiale créées par la Blender Foundation.",
            rating: "9.0",
            category_id: "20"
        }
    ],
    series_info_301: {
        seasons: [
            { air_date: "2023", name: "Saison 1", season_number: 1, episode_count: 2 }
        ],
        info: {
            name: "Open Movie Project",
            plot: "Une série d'animations 3D de renommée mondiale créées par la Blender Foundation.",
            cover: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
            genre: "Animation / Démo",
            rating: "9.0"
        },
        episodes: {
            "1": [
                {
                    id: "401",
                    episode_num: 1,
                    title: "Épisode 1 : Big Buck Bunny",
                    container_extension: "mp4",
                    direct_source: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
                    info: { duration: "9:56", plot: "Un grand lapin rencontre des petits animaux de la forêt." }
                },
                {
                    id: "402",
                    episode_num: 2,
                    title: "Épisode 2 : Sintel",
                    container_extension: "mp4",
                    direct_source: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
                    info: { duration: "14:48", plot: "Une jeune fille part à la recherche de son dragon." }
                }
            ]
        }
    }
};

// Route proxy universelle pour l'API Xtream Codes
app.post('/api/xtream/action', async (req, res) => {
    try {
        const { server, username, password, action, params } = req.body;
        if (!server || !username || !password) {
            return res.status(400).json({ error: 'Serveur, identifiant et mot de passe requis' });
        }

        // Mode démo
        if (server === 'demo' || server.toLowerCase().includes('demo')) {
            if (!action) {
                return res.json({
                    user_info: DEMO_XTREAM_DATA.user_info,
                    server_info: DEMO_XTREAM_DATA.server_info
                });
            }
            if (action === 'get_live_categories') return res.json(DEMO_XTREAM_DATA.live_categories);
            if (action === 'get_live_streams') return res.json(DEMO_XTREAM_DATA.live_streams);
            if (action === 'get_vod_categories') return res.json(DEMO_XTREAM_DATA.vod_categories);
            if (action === 'get_vod_streams') return res.json(DEMO_XTREAM_DATA.vod_streams);
            if (action === 'get_series_categories') return res.json(DEMO_XTREAM_DATA.series_categories);
            if (action === 'get_series') return res.json(DEMO_XTREAM_DATA.series);
            if (action === 'get_series_info') return res.json(DEMO_XTREAM_DATA.series_info_301);
            return res.json([]);
        }

        const baseUrl = normalizeXtreamUrl(server);
        const url = new URL(`${baseUrl}/player_api.php`);
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
            return res.status(response.status).json({ error: `Erreur serveur Xtream (${response.status}): ${response.statusText}` });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erreur Xtream action:', error.message);
        res.status(500).json({ error: error.message || 'Impossible de contacter le serveur Xtream' });
    }
});

// Importation de l'abonnement Xtream en playlist MyStream
app.post('/api/xtream/import', async (req, res) => {
    try {
        const { server, username, password } = req.body;
        if (!server || !username || !password) {
            return res.status(400).json({ error: 'Informations Xtream manquantes' });
        }

        let content = '';
        let hostDisplay = 'Xtream';

        if (server === 'demo' || server.toLowerCase().includes('demo')) {
            content = `#EXTM3U
#EXTINF:-1 tvg-logo="https://test-streams.mux.dev/test_001/stream.png" group-title="Xtream Direct",Blender TV HD (Live HLS)
https://test-streams.mux.dev/test_001/stream.m3u8
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg" group-title="Xtream Direct",Cinema World 4K
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg" group-title="Xtream Direct",Sport Action Max
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg" group-title="Xtream Films",Big Buck Bunny (2008) [1080p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg" group-title="Xtream Films",Sintel - Durian Project [1080p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg" group-title="Xtream Films",Tears of Steel [4K]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4
#EXTINF:-1 tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg" group-title="Xtream Série - Saison 1",Open Movie - S01E01 [1080p]
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`;
            hostDisplay = 'Démo IPTV';
        } else {
            const baseUrl = normalizeXtreamUrl(server);
            hostDisplay = new URL(baseUrl).hostname;
            const m3uUrl = `${baseUrl}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=m3u8`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 25000);

            const response = await fetch(m3uUrl, {
                headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) {
                return res.status(response.status).json({ error: 'Le serveur Xtream a refusé le téléchargement de la playlist M3U' });
            }

            content = await response.text();
        }

        const itemCount = (content.match(/#EXTINF/g) || []).length;
        const filename = `xtream-${Date.now()}.m3u`;
        const filepath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filepath, content, 'utf-8');

        const store = readStore();
        store.files.forEach(f => f.is_active = 0);

        const newFile = {
            id: Date.now().toString(),
            name: `Xtream (${hostDisplay} - ${username})`,
            filename: filename,
            filepath: filepath,
            is_active: 1,
            created_at: new Date().toISOString(),
            item_count: itemCount,
            itemCount: itemCount,
            content: content
        };

        store.files.unshift(newFile);
        writeStore(store);

        res.json({
            success: true,
            id: newFile.id,
            name: newFile.name,
            itemCount
        });
    } catch (error) {
        console.error('Erreur import Xtream:', error);
        res.status(500).json({ error: error.message || 'Erreur lors de l\'import Xtream' });
    }
});

// Proxy flux vidéo pour éviter les problèmes de CORS et de Mixed Content (HTTPS -> HTTP)
app.get('/api/xtream/proxy', async (req, res) => {
    try {
        const streamUrl = req.query.url;
        if (!streamUrl) return res.status(400).send('URL requise');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const streamRes = await fetch(streamUrl, {
            headers: {
                'User-Agent': 'IPTVSmarters/1.0.0 (Linux; Android 10)'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        // Copier les en-têtes pertinents
        const contentType = streamRes.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (!streamRes.body) {
            return res.status(500).send('Flux indisponible');
        }

        const nodeReadable = streamRes.body;
        if (typeof nodeReadable.pipe === 'function') {
            nodeReadable.pipe(res);
        } else {
            // Web ReadableStream
            const reader = nodeReadable.getReader();
            const pump = async () => {
                const { done, value } = await reader.read();
                if (done) return res.end();
                res.write(value);
                await pump();
            };
            pump().catch(() => res.end());
        }
    } catch (error) {
        res.status(500).send('Erreur proxy stream: ' + error.message);
    }
});

// Fallback routes pour l'interface admin et accueil
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrer le serveur
app.listen(PORT, HOST, () => {
    console.log(`
    ╔════════════════════════════════════════════════╗
    ║  🎬 MyStream Server                            ║
    ║  ├─ Frontend: http://${HOST}:${PORT}               ║
    ║  └─ Admin:    http://${HOST}:${PORT}/admin.html    ║
    ╚════════════════════════════════════════════════╝
    `);
});