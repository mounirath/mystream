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