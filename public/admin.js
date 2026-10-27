function showStatus(message, type) {
    const statusEl = document.getElementById('uploadStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'upload-status' + (type ? ' ' + type : '');
    statusEl.style.display = message ? 'block' : 'none';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        return d.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return isoStr;
    }
}

async function uploadFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(m3u|m3u8)$/i)) {
        showStatus('Seuls les fichiers M3U (.m3u, .m3u8) sont acceptés', 'error');
        return;
    }

    try {
        showStatus('📤 Lecture du fichier...', '');
        
        // Lire le fichier en base64
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const res = reader.result;
                const idx = res.indexOf(',');
                resolve(idx >= 0 ? res.substring(idx + 1) : res);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        showStatus('⬆️ Upload en cours...', '');
        
        const response = await fetch('/api/admin/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file: base64,
                filename: file.name
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showStatus(`✅ Fichier "${data.name}" uploadé avec succès ! (${data.itemCount} éléments détectés)`, 'success');
            await loadFiles();
            // Réinitialiser le sélecteur de fichier
            const input = document.getElementById('m3uFile');
            if (input) input.value = '';
        } else {
            showStatus(`❌ Erreur: ${data.error || 'Échec de l\'upload'}`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Erreur: ${error.message}`, 'error');
    }
}

async function loadFiles() {
    const listEl = document.getElementById('filesList');
    if (!listEl) return;

    try {
        const response = await fetch('/api/admin/files');
        if (!response.ok) throw new Error('Impossible de charger les fichiers');
        
        const files = await response.json();

        if (!Array.isArray(files) || files.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📂</div>
                    <p>Aucun fichier M3U enregistré pour le moment.</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = files.map(file => {
            const isActive = Boolean(file.is_active);
            const count = file.itemCount || file.item_count || 0;
            const dateStr = formatDate(file.created_at);
            return `
                <div class="file-item ${isActive ? 'active' : ''}">
                    <div class="file-info">
                        <h3>${escapeHtml(file.name)}</h3>
                        <div class="file-meta">
                            ${count} éléments ${dateStr ? '• Ajouté le ' + dateStr : ''}
                        </div>
                    </div>
                    <div class="file-actions">
                        <button 
                            class="btn-activate" 
                            ${isActive ? 'disabled' : ''} 
                            onclick="activateFile('${escapeHtml(file.id)}')">
                            ${isActive ? '✓ Actif' : 'Activer'}
                        </button>
                        <button 
                            class="btn-delete" 
                            onclick="deleteFile('${escapeHtml(file.id)}', '${escapeHtml(file.name)}')">
                            Supprimer
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        listEl.innerHTML = `<div class="empty-state" style="color:#ef4444;">❌ Erreur: ${escapeHtml(error.message)}</div>`;
    }
}

async function activateFile(id) {
    try {
        showStatus('Activation en cours...', '');
        const response = await fetch(`/api/admin/activate/${encodeURIComponent(id)}`, {
            method: 'POST'
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showStatus('✅ Playlist activée avec succès !', 'success');
            await loadFiles();
        } else {
            showStatus(`❌ Erreur: ${data.error || 'Échec de l\'activation'}`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Erreur: ${error.message}`, 'error');
    }
}

async function deleteFile(id, name) {
    if (!confirm(`Supprimer la playlist "${name}" ?`)) return;

    try {
        showStatus('Suppression en cours...', '');
        const response = await fetch(`/api/admin/files/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showStatus('✅ Playlist supprimée', 'success');
            await loadFiles();
        } else {
            showStatus(`❌ Erreur: ${data.error || 'Échec de la suppression'}`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Erreur: ${error.message}`, 'error');
    }
}

// Initialisation des événements
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();

    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('m3uFile');

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                uploadFile(e.target.files[0]);
            }
        });
    }

    if (uploadArea) {
        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadArea.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadArea.classList.remove('dragover');
            }, false);
        });

        uploadArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files[0]) {
                uploadFile(dt.files[0]);
            }
        });
    }
});

// Exposer globalement pour les attributs onclick
window.activateFile = activateFile;
window.deleteFile = deleteFile;
