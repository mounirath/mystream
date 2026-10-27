const express = require('express');
const multer = require('multer');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Créer dossiers si n'existent pas
if (!fs.existsSync('data')) fs.mkdirSync('data');
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Base de données SQLite
const db = new Database('data/mystream.db');
db.exec(`
    CREATE TABLE IF NOT EXISTS m3u_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        is_active INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        item_count INTEGER DEFAULT 0
    )
`);

// Configuration multer pour upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname;
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

// Upload fichier M3U
app.post('/api/admin/upload', upload.single('m3ufile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier uploadé' });
    }

    try {
        // Lire le fichier pour compter les éléments
        const content = fs.readFileSync(req.file.path, 'utf-8');
        const itemCount = (content.match(/#EXTINF/g) || []).length;

        // Insérer en base
        const stmt = db.prepare(`
            INSERT INTO m3u_files (name, filename, filepath, item_count) 
            VALUES (?, ?, ?, ?)
        `);
        const result = stmt.run(req.file.originalname, req.file.filename, req.file.path, itemCount);

        res.json({ 
            success: true, 
            id: result.lastInsertRowid,
            name: req.file.originalname,
            itemCount 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Lister tous les fichiers
app.get('/api/admin/files', (req, res) => {
    const files = db.prepare('SELECT * FROM m3u_files ORDER BY created_at DESC').all();
    res.json(files);
});

// Activer un fichier
app.post('/api/admin/activate/:id', (req, res) => {
    const { id } = req.params;
    
    // Désactiver tous les autres
    db.prepare('UPDATE m3u_files SET is_active = 0').run();
    // Activer celui-ci
    db.prepare('UPDATE m3u_files SET is_active = 1 WHERE id = ?').run(id);
    
    res.json({ success: true });
});

// Supprimer un fichier
app.delete('/api/admin/files/:id', (req, res) => {
    const { id } = req.params;
    const file = db.prepare('SELECT * FROM m3u_files WHERE id = ?').get(id);
    
    if (file) {
        // Supprimer le fichier physique
        if (fs.existsSync(file.filepath)) {
            fs.unlinkSync(file.filepath);
        }
        // Supprimer de la base
        db.prepare('DELETE FROM m3u_files WHERE id = ?').run(id);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Fichier non trouvé' });
    }
});

// ===== API FRONTEND =====

// Récupérer le fichier M3U actif
app.get('/api/m3u/active', (req, res) => {
    const file = db.prepare('SELECT * FROM m3u_files WHERE is_active = 1').get();
    
    if (!file) {
        return res.status(404).json({ error: 'Aucun fichier actif' });
    }

    try {
        const content = fs.readFileSync(file.filepath, 'utf-8');
        res.json({
            name: file.name,
            content: content,
            itemCount: file.item_count
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture du fichier' });
    }
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║  🎬 MyStream Server                    ║
    ║  ├─ Frontend: http://localhost:${PORT}    ║
    ║  └─ Admin:    http://localhost:${PORT}/admin.html ║
    ╚════════════════════════════════════════╝
    `);
});