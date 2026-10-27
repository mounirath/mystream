const uploadForm = document.getElementById('uploadForm');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('m3uFile');
const uploadStatus = document.getElementById('uploadStatus');
const filesList = document.getElementById('filesList');

// Drag & drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
});

uploadArea.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) uploadFile(e.target.files[0]);
});

async function uploadFile(file) {
    if (!file.name.match(/\.(m3u|m3u8)$/i)) {
        showStatus('Seuls les fichiers M3U sont acceptés', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('m3ufile', file);

    try {
        showStatus('Upload en cours...', '');
        const response = await fetch('/api/admin/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            showStatus(`✅ Fichier uploadé avec succès ! ${data.itemCount} éléments détectés.`, 'success');
            loadFiles();
        } else {
            showStatus(`❌ Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Erreur: ${error.message}`, 'error');
    }
}

function showStatus(message, type) {
    uploadStatus.textContent = message;
    uploadStatus.className = 'upload-status ' + type;
}

async function loadFiles() {
    try {
        const response = await fetch('/api/admin/files');
        const files = await response.json();

        if (files.length === 0) {
            filesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p>Aucun fichier uploadé</p>
                </div>
            `;
            return;
        }

        filesList.innerHTML = files.map(file => `
            <div class="file-item ${file.is_active ? 'active' : ''}">
                <div class="file-info">
                    <h3>${file.name} ${file.is_active ? '✅' : ''}</h3>
                    <div class="file-meta">
                        ${file.item_count} éléments • Uploadé le ${new Date(file.created_at).toLocaleDateString('fr-FR')}
                    </div>
                </div>
                <div class="file-actions">
                    <button class="btn-activate" onclick="activateFile(${file.id})" ${file.is_active ? 'disabled' : ''}>
                        ${file.is_active ? 'Actif' : 'Activer'}
                    </button>
                    <button class="btn-delete" onclick="deleteFile(${file.id})">🗑️ Supprimer</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        filesList.innerHTML = '<div class="empty-state"><p>Erreur de chargement</p></div>';
    }
}

async function activateFile(id) {
    try {
        await fetch(`/api/admin/activate/${id}`, { method: 'POST' });
        loadFiles();
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

async function deleteFile(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce fichier ?')) return;
    
    try {
        await fetch(`/api/admin/files/${id}`, { method: 'DELETE' });
        loadFiles();
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

// Charger les fichiers au démarrage
loadFiles();