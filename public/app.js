let allItems = [];
let currentFilter = 'all';
let currentGroup = null;
let currentQuality = null;
let favorites = JSON.parse(localStorage.getItem('mystream_favs') || '[]');
let hlsInstance = null;

// Charger le M3U actif depuis le backend
async function loadActiveM3U() {
    try {
        document.getElementById('welcomeScreen').style.display = 'none';
        document.getElementById('loadingScreen').style.display = 'flex';
        
        const response = await fetch('/api/m3u/active');
        
        if (!response.ok) {
            throw new Error('Aucun fichier actif');
        }
        
        const data = await response.json();
        allItems = parseM3U(data.content);
        
        console.log(`✅ ${allItems.length} éléments chargés depuis ${data.name}`);
        
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('contentGrid').style.display = 'grid';
        
        renderContent();
        renderGroups();
    } catch (error) {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('welcomeScreen').style.display = 'flex';
        console.error('Erreur:', error);
    }
}

function parseM3U(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    const items = [];
    let currentItem = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXTINF')) {
            currentItem = { title: '', group: '', logo: '', url: '', type: 'film', quality: null };
            const titleMatch = line.match(/,(.+)$/);
            if (titleMatch) currentItem.title = titleMatch[1].trim();
            const tvgLogo = line.match(/tvg-logo="([^"]*)"/);
            const groupTitle = line.match(/group-title="([^"]*)"/);
            if (tvgLogo) currentItem.logo = tvgLogo[1];
            if (groupTitle) {
                currentItem.group = groupTitle[1];
                const g = currentItem.group.toLowerCase();
                if (g.includes('série') || g.includes('serie') || g.includes('season') || g.includes('saison')) {
                    currentItem.type = 'serie';
                }
            }
            currentItem.quality = detectQuality(currentItem);
        } else if (!line.startsWith('#') && currentItem) {
            currentItem.url = line;
            currentItem.title = cleanTitle(currentItem.title);
            items.push(currentItem);
            currentItem = null;
        }
    }
    return items;
}

function detectQuality(item) {
    const text = `${item.title} ${item.group}`.toLowerCase();
    if (/\b(4k|uhd|2160p)\b/.test(text)) return 2160;
    if (/\b(1080p|fhd)\b/.test(text)) return 1080;
    if (/\b(720p|hd)\b/.test(text)) return 720;
    return null;
}

function qualityLabel(q) {
    const labels = { 720: '720p HD', 1080: '1080p FHD', 2160: '4K UHD' };
    return labels[q] || 'Auto';
}

function cleanTitle(title) {
    return title.replace(/\[.*?\]/g, '').replace(/\b(FHD|HD|4K|UHD)\b/gi, '').replace(/\s+/g, ' ').trim();
}

function renderContent() {
    const grid = document.getElementById('contentGrid');
    const search = document.getElementById('searchInput').value.toLowerCase();
    
    let filtered = allItems;
    
    if (currentFilter === 'film') filtered = filtered.filter(i => i.type === 'film');
    else if (currentFilter === 'serie') filtered = filtered.filter(i => i.type === 'serie');
    else if (currentFilter === 'favorites') filtered = filtered.filter(i => favorites.includes(i.url));
    
    if (currentGroup) filtered = filtered.filter(i => i.group === currentGroup);
    if (currentQuality) filtered = filtered.filter(i => i.quality === currentQuality);
    if (search) filtered = filtered.filter(i => 
        i.title.toLowerCase().includes(search) || i.group.toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:#666;"><h2>Aucun résultat</h2></div>';
        return;
    }

    grid.innerHTML = filtered.map(item => `
        <div class="card" data-url="${encodeURIComponent(item.url)}">
            <div class="card-poster">
                ${item.logo ? `<img src="${item.logo}" onerror="this.parentElement.innerHTML='🎬'" alt="">` : '🎬'}
                <span class="card-type">${item.type === 'film' ? '🎥 FILM' : '📺 SÉRIE'}</span>
                <span class="card-quality q-${item.quality || 'unknown'}">${qualityLabel(item.quality)}</span>
                <button class="card-fav" onclick="toggleFavorite(event, '${encodeURIComponent(item.url)}')">
                    ${favorites.includes(item.url) ? '⭐' : '☆'}
                </button>
            </div>
            <div class="card-body">
                <div class="card-title">${item.title || 'Sans titre'}</div>
                <div class="card-group">${item.group || 'Non classé'}</div>
            </div>
        </div>
    `).join('');

    grid.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('card-fav')) return;
            const url = decodeURIComponent(card.dataset.url);
            const item = allItems.find(i => i.url === url);
            playItem(item);
        });
    });
}

function renderGroups() {
    const groups = [...new Set(allItems.map(i => i.group).filter(g => g))];
    const bar = document.getElementById('groupsBar');
    bar.innerHTML = groups.map(g => `<span class="group-chip" data-group="${g}">${g}</span>`).join('');
    
    bar.querySelectorAll('.group-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const g = chip.dataset.group;
            if (currentGroup === g) {
                currentGroup = null;
                chip.classList.remove('active');
            } else {
                currentGroup = g;
                bar.querySelectorAll('.group-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
            }
            renderContent();
        });
    });
}

function toggleFavorite(e, encodedUrl) {
    e.stopPropagation();
    const url = decodeURIComponent(encodedUrl);
    if (favorites.includes(url)) {
        favorites = favorites.filter(f => f !== url);
    } else {
        favorites.push(url);
    }
    localStorage.setItem('mystream_favs', JSON.stringify(favorites));
    renderContent();
}

function playItem(item) {
    const modal = document.getElementById('playerModal');
    const video = document.getElementById('videoPlayer');
    document.getElementById('playerTitle').textContent = item.title;
    
    modal.classList.add('active');
    
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

    const url = item.url;
    const isHLS = url.includes('.m3u8') || url.includes('m3u8');
    
    if (isHLS && Hls.isSupported()) {
        hlsInstance = new Hls();
        hlsInstance.loadSource(url);
        hlsInstance.attachMedia(video);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play();
            loadHLSQualities();
        });
    } else {
        video.src = url;
    }
}

function loadHLSQualities() {
    if (!hlsInstance) return;
    const levels = hlsInstance.levels;
    const menu = document.getElementById('qualityMenu');
    menu.innerHTML = `
        <div class="quality-option selected" data-level="-1">⚡ Auto</div>
        ${levels.map((level, idx) => `
            <div class="quality-option" data-level="${idx}">
                📺 ${level.height ? level.height + 'p' : Math.round(level.bitrate/1000) + 'kbps'}
            </div>
        `).join('')}
    `;
    
    menu.querySelectorAll('.quality-option').forEach(opt => {
        opt.addEventListener('click', () => {
            hlsInstance.currentLevel = parseInt(opt.dataset.level);
            menu.querySelectorAll('.quality-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        });
    });
}

function closePlayer() {
    document.getElementById('playerModal').classList.remove('active');
    const video = document.getElementById('videoPlayer');
    video.pause();
    video.src = '';
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
}

// Événements
document.getElementById('refreshBtn').addEventListener('click', loadActiveM3U);
document.getElementById('retryBtn').addEventListener('click', loadActiveM3U);
document.getElementById('searchInput').addEventListener('input', renderContent);

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderContent();
    });
});

document.querySelectorAll('.quality-pill').forEach(btn => {
    btn.addEventListener('click', () => {
        const q = parseInt(btn.dataset.quality);
        if (currentQuality === q) {
            currentQuality = null;
            btn.classList.remove('active');
        } else {
            currentQuality = q;
            document.querySelectorAll('.quality-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
        renderContent();
    });
});

document.getElementById('qualityToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('qualityMenu').classList.toggle('active');
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.quality-selector')) {
        document.getElementById('qualityMenu').classList.remove('active');
    }
});

document.getElementById('closePlayer').addEventListener('click', closePlayer);
document.getElementById('playerModal').addEventListener('click', (e) => {
    if (e.target.id === 'playerModal') closePlayer();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePlayer();
});

// Charger au démarrage
loadActiveM3U();