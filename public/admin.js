async function uploadFile(file) {
    if (!file.name.match(/\.(m3u|m3u8)$/i)) {
        showStatus('Seuls les fichiers M3U sont acceptés', 'error');
        return;
    }

    try {
        showStatus('📤 Lecture du fichier...', '');
        
        // Lire le fichier en base64
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
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

        if (response.ok) {
            showStatus(`✅ Fichier uploadé ! ${data.itemCount} éléments détectés.`, 'success');
            loadFiles();
        } else {
            showStatus(`❌ Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Erreur: ${error.message}`, 'error');
    }
}
