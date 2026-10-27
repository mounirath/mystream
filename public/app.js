let allItems = [];
let currentFilter = 'all';
let currentGroup = null;
let currentQuality = null;
let favorites = JSON.parse(localStorage.getItem('mystream_favs') || '[]');
let hlsInstance = null;

// État Xtream Codes
let xtreamState = {
    server: '',
    username: '',
    password: '',
    userInfo: null,
    serverInfo: null,
    activeType: 'live', // 'live', 'vod', 'series'
    categories: [],
    streams: [],
    selectedCategory: 'all',
    searchQuery: '',
    currentSeriesInfo: null,
    activeSeason: 1
};

const EMBEDDED_DEMO_M3U = `#EXTM3U
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

// ==========================================
// M3U & Catalogue Principal (Client-First)
// ==========================================

async function loadActiveM3U() {
    const loadingScreen = document.getElementById('loadingScreen');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const contentGrid = document.getElementById('contentGrid');

    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (loadingScreen) loadingScreen.style.display = 'flex';

    let contentToParse = null;
    let playlistName = 'Catalogue';

    try {
        const response = await fetch('/api/m3u/active');
        if (response.ok) {
            const data = await response.json();
            if (data && data.content) {
                contentToParse = data.content;
                playlistName = data.name || playlistName;
                try {
                    localStorage.setItem('mystream_active_playlist', JSON.stringify({ name: playlistName, content: contentToParse }));
                } catch (e) {}
            }
        }
    } catch (e) {
        console.warn('API m3u/active non joignable, tentative de chargement local...');
    }

    // Si l'API échoue ou renvoie vide, vérifier le cache local
    if (!contentToParse) {
        try {
            const cached = localStorage.getItem('mystream_active_playlist');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.content) {
                    contentToParse = parsed.content;
                    playlistName = parsed.name || playlistName;
                }
            }
        } catch (e) {}
    }

    // Si toujours rien, charger la démo embarquée
    if (!contentToParse) {
        contentToParse = EMBEDDED_DEMO_M3U;
        playlistName = 'Démo Catalogue (Films & Séries)';
    }

    allItems = parseM3U(contentToParse);

    if (loadingScreen) loadingScreen.style.display = 'none';
    if (contentGrid) contentGrid.style.display = 'grid';

    renderContent();
    renderGroups();
}

function parseM3U(content) {
    if (!content) return [];
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
    if (!title) return '';
    return title.replace(/\[.*?\]/g, '').replace(/\b(FHD|HD|4K|UHD)\b/gi, '').replace(/\s+/g, ' ').trim();
}

function renderContent() {
    const grid = document.getElementById('contentGrid');
    if (!grid) return;
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
    
    let filtered = allItems;
    
    if (currentFilter === 'film') filtered = filtered.filter(i => i.type === 'film');
    else if (currentFilter === 'serie') filtered = filtered.filter(i => i.type === 'serie');
    else if (currentFilter === 'favorites') filtered = filtered.filter(i => favorites.includes(i.url));
    
    if (currentGroup) filtered = filtered.filter(i => i.group === currentGroup);
    if (currentQuality) filtered = filtered.filter(i => i.quality === currentQuality);
    if (search) filtered = filtered.filter(i => 
        i.title.toLowerCase().includes(search) || (i.group && i.group.toLowerCase().includes(search))
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
            if (item) playItem(item);
        });
    });
}

function renderGroups() {
    const bar = document.getElementById('groupsBar');
    if (!bar) return;
    const groups = [...new Set(allItems.map(i => i.group).filter(g => g))];
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

// ==========================================
// Lecteur Vidéo Intégré (HLS & Direct)
// ==========================================

function playItem(item, badgeText = '') {
    const modal = document.getElementById('playerModal');
    const video = document.getElementById('videoPlayer');
    const titleEl = document.getElementById('playerTitle');
    const badgeEl = document.getElementById('playerMetaBadge');
    const urlEl = document.getElementById('streamUrlDisplay');

    if (titleEl) titleEl.textContent = item.title;
    if (badgeEl) {
        badgeEl.textContent = badgeText || (item.type === 'serie' ? 'Série' : (item.quality ? qualityLabel(item.quality) : 'Lecture'));
    }
    if (urlEl) urlEl.textContent = item.url;
    
    modal.classList.add('active');
    
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }

    const url = item.url;
    const isHLS = url.includes('.m3u8') || url.includes('m3u8');
    
    if (isHLS && Hls.isSupported()) {
        hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90
        });
        hlsInstance.loadSource(url);
        hlsInstance.attachMedia(video);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(e => console.warn('Autoplay bloqué:', e));
            loadHLSQualities();
        });
        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.warn('Erreur réseau HLS, tentative de récupération...');
                        hlsInstance.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.warn('Erreur média HLS, récupération...');
                        hlsInstance.recoverMediaError();
                        break;
                    default:
                        hlsInstance.destroy();
                        video.src = url;
                        break;
                }
            }
        });
    } else {
        video.src = url;
        video.play().catch(e => console.warn('Autoplay bloqué:', e));
    }
}

function loadHLSQualities() {
    if (!hlsInstance) return;
    const levels = hlsInstance.levels || [];
    const menu = document.getElementById('qualityMenu');
    if (!menu) return;

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
            const label = document.getElementById('currentQualityLabel');
            if (label) label.textContent = opt.textContent.replace('📺 ', '').replace('⚡ ', '');
        });
    });
}

function closePlayer() {
    document.getElementById('playerModal').classList.remove('active');
    const video = document.getElementById('videoPlayer');
    if (video) {
        video.pause();
        video.src = '';
    }
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }
}

// ==========================================
// Moteur Xtream Codes
// ==========================================

function openXtreamModal() {
    const modal = document.getElementById('xtreamModal');
    if (!modal) return;
    modal.classList.add('active');

    // Vérifier si des identifiants sont déjà mémorisés
    const saved = localStorage.getItem('mystream_xtream');
    if (saved && !xtreamState.userInfo) {
        try {
            const parsed = JSON.parse(saved);
            document.getElementById('xtreamServer').value = parsed.server || '';
            document.getElementById('xtreamUser').value = parsed.username || '';
            document.getElementById('xtreamPass').value = parsed.password || '';
            connectXtream(parsed.server, parsed.username, parsed.password, true);
            return;
        } catch {}
    }

    if (xtreamState.userInfo) {
        showXtreamPortalView();
    } else {
        showXtreamLoginView();
    }
}

function closeXtreamModal() {
    const modal = document.getElementById('xtreamModal');
    if (modal) modal.classList.remove('active');
}

function showXtreamLoginView() {
    document.getElementById('xtreamLoginView').style.display = 'flex';
    document.getElementById('xtreamPortalView').style.display = 'none';
}

function showXtreamPortalView() {
    document.getElementById('xtreamLoginView').style.display = 'none';
    document.getElementById('xtreamPortalView').style.display = 'flex';
    updateXtreamAccountBar();
    loadXtreamData(xtreamState.activeType);
}

function showXtreamLoginStatus(message, type = '') {
    const el = document.getElementById('xtreamLoginStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'xtream-status-msg' + (type ? ' ' + type : '');
    el.style.display = message ? 'block' : 'none';
}

// Appel proxy vers l'API Xtream
async function callXtreamApi(action, params = {}) {
    const response = await fetch('/api/xtream/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            server: xtreamState.server,
            username: xtreamState.username,
            password: xtreamState.password,
            action,
            params
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur serveur (${response.status})`);
    }

    return await response.json();
}

async function connectXtream(server, username, password, remember = true) {
    try {
        showXtreamLoginStatus('Connexion et vérification de l\'abonnement...', '');
        const submitBtn = document.getElementById('xtreamSubmitBtn');
        if (submitBtn) submitBtn.disabled = true;

        xtreamState.server = server;
        xtreamState.username = username;
        xtreamState.password = password;

        // Appel d'authentification initial (player_api.php sans action)
        const data = await callXtreamApi(null);

        if (!data || (!data.user_info && !data.server_info)) {
            throw new Error('Identifiants ou URL de serveur Xtream invalides');
        }

        if (data.user_info && data.user_info.auth === 0) {
            throw new Error('Identifiants Xtream incorrects');
        }

        xtreamState.userInfo = data.user_info || {};
        xtreamState.serverInfo = data.server_info || {};

        if (remember) {
            localStorage.setItem('mystream_xtream', JSON.stringify({ server, username, password }));
        } else {
            localStorage.removeItem('mystream_xtream');
        }

        showXtreamLoginStatus('Connexion réussie ! Chargement...', 'success');
        setTimeout(() => {
            showXtreamPortalView();
        }, 500);

    } catch (error) {
        showXtreamLoginStatus(`❌ ${error.message}`, 'error');
    } finally {
        const submitBtn = document.getElementById('xtreamSubmitBtn');
        if (submitBtn) submitBtn.disabled = false;
    }
}

function updateXtreamAccountBar() {
    const user = xtreamState.userInfo || {};
    const server = xtreamState.serverInfo || {};

    document.getElementById('accountUsername').textContent = user.username || xtreamState.username || 'Utilisateur';
    document.getElementById('accountStatus').textContent = user.status || 'Connecté';

    let expText = 'Illimité';
    if (user.exp_date && user.exp_date !== 'null') {
        const d = new Date(parseInt(user.exp_date) * 1000);
        expText = isNaN(d.getTime()) ? user.exp_date : d.toLocaleDateString('fr-FR');
    }
    document.getElementById('accountExp').textContent = `📅 Exp: ${expText}`;
    document.getElementById('accountCons').textContent = `🔗 ${user.active_cons || 1}/${user.max_connections || 1} cons`;

    let hostDisplay = xtreamState.server;
    try {
        if (!hostDisplay.startsWith('http')) hostDisplay = 'http://' + hostDisplay;
        hostDisplay = new URL(hostDisplay).hostname;
    } catch {}
    document.getElementById('accountHost').textContent = `🌐 ${hostDisplay}`;
}

async function loadXtreamData(type) {
    xtreamState.activeType = type;
    const loadingEl = document.getElementById('xtreamLoading');
    const gridEl = document.getElementById('xtreamGrid');
    
    if (loadingEl) {
        loadingEl.style.display = 'flex';
        loadingEl.querySelector('p').textContent = `Chargement des ${type === 'live' ? 'chaînes en direct' : (type === 'vod' ? 'films VOD' : 'séries')}...`;
    }
    if (gridEl) gridEl.innerHTML = '';

    try {
        let catAction = 'get_live_categories';
        let streamAction = 'get_live_streams';

        if (type === 'vod') {
            catAction = 'get_vod_categories';
            streamAction = 'get_vod_streams';
        } else if (type === 'series') {
            catAction = 'get_series_categories';
            streamAction = 'get_series';
        }

        // Charger catégories et flux en parallèle
        const [categories, streams] = await Promise.all([
            callXtreamApi(catAction).catch(() => []),
            callXtreamApi(streamAction).catch(() => [])
        ]);

        xtreamState.categories = Array.isArray(categories) ? categories : [];
        xtreamState.streams = Array.isArray(streams) ? streams : [];

        renderXtreamCategoriesSelect();
        renderXtreamGrid();

    } catch (error) {
        if (gridEl) gridEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444;">❌ Erreur: ${error.message}</div>`;
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function renderXtreamCategoriesSelect() {
    const select = document.getElementById('xtreamCategorySelect');
    if (!select) return;

    select.innerHTML = '<option value="all">📂 Toutes les catégories</option>' +
        xtreamState.categories.map(c => `
            <option value="${c.category_id}">${c.category_name}</option>
        `).join('');

    select.value = 'all';
    xtreamState.selectedCategory = 'all';
}

function buildXtreamStreamUrl(stream, type) {
    if (stream.direct_source) return stream.direct_source;

    let base = xtreamState.server.trim();
    if (!base.startsWith('http://') && !base.startsWith('https://')) base = 'http://' + base;
    base = base.replace(/\/+$/, '');

    const u = encodeURIComponent(xtreamState.username);
    const p = encodeURIComponent(xtreamState.password);

    if (type === 'live') {
        return `${base}/live/${u}/${p}/${stream.stream_id}.m3u8`;
    } else if (type === 'vod') {
        const ext = stream.container_extension || 'mp4';
        return `${base}/movie/${u}/${p}/${stream.stream_id}.${ext}`;
    }
    return '';
}

function renderXtreamGrid() {
    const grid = document.getElementById('xtreamGrid');
    if (!grid) return;

    const catId = xtreamState.selectedCategory;
    const query = xtreamState.searchQuery.toLowerCase();
    const type = xtreamState.activeType;

    let list = xtreamState.streams;

    if (catId && catId !== 'all') {
        list = list.filter(item => String(item.category_id) === String(catId));
    }

    if (query) {
        list = list.filter(item => (item.name || '').toLowerCase().includes(query));
    }

    if (list.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:#64748b;"><h3>Aucun flux trouvé</h3></div>';
        return;
    }

    grid.innerHTML = list.map(item => {
        const title = item.name || 'Sans titre';
        const poster = item.stream_icon || item.cover || '';
        const badgeLabel = type === 'live' ? 'DIRECT' : (type === 'vod' ? 'FILM' : 'SÉRIE');
        const badgeClass = type === 'live' ? 'badge-live' : (type === 'vod' ? 'badge-vod' : 'badge-series');
        const isPortrait = type !== 'live';

        return `
            <div class="xtream-card" data-id="${item.stream_id || item.series_id}">
                <div class="xtream-card-poster ${isPortrait ? 'poster-portrait' : ''}">
                    ${poster ? `<img src="${poster}" onerror="this.parentElement.innerHTML='🎬'" loading="lazy" alt="">` : '🎬'}
                    <span class="xtream-card-badge ${badgeClass}">${badgeLabel}</span>
                    <div class="xtream-card-play-overlay">▶</div>
                </div>
                <div class="xtream-card-body">
                    <div class="xtream-card-title">${title}</div>
                    <div class="xtream-card-sub">${type === 'series' ? 'Série & Épisodes' : (item.container_extension ? item.container_extension.toUpperCase() : 'Flux')}</div>
                </div>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('.xtream-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const item = xtreamState.streams.find(s => String(s.stream_id || s.series_id) === id);
            if (!item) return;

            if (type === 'series') {
                openSeriesDetails(item);
            } else {
                const streamUrl = buildXtreamStreamUrl(item, type);
                playItem({
                    title: item.name,
                    url: streamUrl,
                    type: type === 'live' ? 'live' : 'film'
                }, type === 'live' ? '🔴 Direct' : '🎬 VOD Xtream');
            }
        });
    });
}

// Détails des Séries (Saisons et Épisodes)
async function openSeriesDetails(series) {
    const modal = document.getElementById('seriesModal');
    const titleEl = document.getElementById('seriesTitle');
    const plotEl = document.getElementById('seriesPlot');
    const seasonsBar = document.getElementById('seriesSeasonsBar');
    const listEl = document.getElementById('seriesEpisodesList');

    if (titleEl) titleEl.textContent = series.name;
    if (plotEl) plotEl.textContent = series.plot || 'Sélectionnez un épisode pour lancer la lecture.';
    if (seasonsBar) seasonsBar.innerHTML = '<span style="color:#64748b;font-size:12px;">Chargement des saisons...</span>';
    if (listEl) listEl.innerHTML = '<div class="spinner"></div>';
    
    modal.classList.add('active');

    try {
        const seriesData = await callXtreamApi('get_series_info', { series_id: series.series_id });
        xtreamState.currentSeriesInfo = seriesData;

        const seasons = seriesData.seasons || [];
        const episodesObj = seriesData.episodes || {};

        if (seasons.length === 0) {
            // Créer une saison par défaut si absent
            seasons.push({ season_number: 1, name: 'Saison 1' });
        }

        xtreamState.activeSeason = seasons[0].season_number;

        seasonsBar.innerHTML = seasons.map((s, idx) => `
            <button class="season-tab ${idx === 0 ? 'active' : ''}" data-season="${s.season_number}">
                ${s.name || 'Saison ' + s.season_number}
            </button>
        `).join('');

        seasonsBar.querySelectorAll('.season-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                seasonsBar.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                xtreamState.activeSeason = parseInt(tab.dataset.season);
                renderSeriesEpisodes(episodesObj, series.name);
            });
        });

        renderSeriesEpisodes(episodesObj, series.name);

    } catch (error) {
        listEl.innerHTML = `<div style="text-align:center;color:#ef4444;padding:20px;">Erreur de chargement: ${error.message}</div>`;
    }
}

function renderSeriesEpisodes(episodesObj, seriesName) {
    const listEl = document.getElementById('seriesEpisodesList');
    if (!listEl) return;

    const seasonNum = xtreamState.activeSeason;
    const episodes = episodesObj[String(seasonNum)] || episodesObj[seasonNum] || [];

    if (!Array.isArray(episodes) || episodes.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;color:#64748b;padding:30px;">Aucun épisode disponible pour cette saison.</div>';
        return;
    }

    listEl.innerHTML = episodes.map(ep => {
        const epNum = ep.episode_num || ep.episodeNumber || 1;
        const title = ep.title || `Épisode ${epNum}`;
        const duration = ep.info?.duration || '';
        const desc = ep.info?.plot || '';

        return `
            <div class="episode-item" data-id="${ep.id}">
                <div class="episode-info">
                    <h4>${title}</h4>
                    <p>${duration ? '⏱️ ' + duration : ''} ${desc ? '• ' + desc : ''}</p>
                </div>
                <button class="btn-play-episode">▶ Lire</button>
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.episode-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            const ep = episodes.find(e => String(e.id) === id);
            if (!ep) return;

            let epUrl = ep.direct_source;
            if (!epUrl) {
                let base = xtreamState.server.trim();
                if (!base.startsWith('http://') && !base.startsWith('https://')) base = 'http://' + base;
                base = base.replace(/\/+$/, '');
                const u = encodeURIComponent(xtreamState.username);
                const p = encodeURIComponent(xtreamState.password);
                const ext = ep.container_extension || 'mp4';
                epUrl = `${base}/series/${u}/${p}/${ep.id}.${ext}`;
            }

            playItem({
                title: `${seriesName} - ${ep.title || 'Épisode ' + ep.episode_num}`,
                url: epUrl,
                type: 'serie'
            }, `📺 S${seasonNum} : E${ep.episode_num || 1}`);
        });
    });
}

function closeSeriesModal() {
    const modal = document.getElementById('seriesModal');
    if (modal) modal.classList.remove('active');
}

// Importer la playlist Xtream dans le catalogue actif de MyStream
async function importXtreamToMyStream() {
    const btn = document.getElementById('xtreamImportBtn');
    if (!btn) return;
    const originalText = btn.textContent;
    btn.textContent = '⏳ Importation...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/xtream/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                server: xtreamState.server,
                username: xtreamState.username,
                password: xtreamState.password
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert(`✅ Succès ! ${data.itemCount} flux Xtream ont été importés dans MyStream.`);
            closeXtreamModal();
            await loadActiveM3U();
        } else {
            alert(`❌ Erreur: ${data.error || 'Échec de l\'importation'}`);
        }
    } catch (e) {
        alert(`❌ Erreur: ${e.message}`);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function disconnectXtream() {
    xtreamState.userInfo = null;
    xtreamState.serverInfo = null;
    xtreamState.streams = [];
    xtreamState.categories = [];
    localStorage.removeItem('mystream_xtream');
    showXtreamLoginView();
    showXtreamLoginStatus('Déconnecté avec succès', 'success');
}

// ==========================================
// Initialisation & Événements
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Boutons de navigation et filtres
    document.getElementById('refreshBtn')?.addEventListener('click', loadActiveM3U);
    document.getElementById('retryBtn')?.addEventListener('click', loadActiveM3U);
    document.getElementById('searchInput')?.addEventListener('input', renderContent);

    document.querySelectorAll('.filter-btn:not(.filter-btn-xtream)').forEach(btn => {
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

    // Contrôles Lecteur Vidéo
    document.getElementById('qualityToggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('qualityMenu')?.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.quality-selector')) {
            document.getElementById('qualityMenu')?.classList.remove('active');
        }
    });

    document.getElementById('closePlayer')?.addEventListener('click', closePlayer);
    document.getElementById('playerModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'playerModal') closePlayer();
    });

    document.getElementById('closeSeries')?.addEventListener('click', closeSeriesModal);
    document.getElementById('seriesModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'seriesModal') closeSeriesModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePlayer();
            closeSeriesModal();
            closeXtreamModal();
        }
    });

    // Boutons d'accès Xtream
    document.getElementById('openXtreamBtn')?.addEventListener('click', openXtreamModal);
    document.getElementById('navXtreamBtn')?.addEventListener('click', openXtreamModal);
    document.getElementById('heroXtreamBtn')?.addEventListener('click', openXtreamModal);
    document.getElementById('closeXtream')?.addEventListener('click', closeXtreamModal);
    document.getElementById('xtreamModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'xtreamModal') closeXtreamModal();
    });

    // Formulaire de connexion Xtream
    document.getElementById('xtreamLoginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const server = document.getElementById('xtreamServer').value.trim();
        const user = document.getElementById('xtreamUser').value.trim();
        const pass = document.getElementById('xtreamPass').value.trim();
        const remember = document.getElementById('xtreamRemember').checked;
        connectXtream(server, user, pass, remember);
    });

    // Bouton de démonstration Xtream
    document.getElementById('xtreamDemoBtn')?.addEventListener('click', () => {
        document.getElementById('xtreamServer').value = 'http://demo.mystream.local:8080';
        document.getElementById('xtreamUser').value = 'demo_streamer';
        document.getElementById('xtreamPass').value = 'demo123';
        connectXtream('demo', 'demo_streamer', 'demo123', true);
    });

    // Déconnexion et import Xtream
    document.getElementById('xtreamLogoutBtn')?.addEventListener('click', disconnectXtream);
    document.getElementById('xtreamImportBtn')?.addEventListener('click', importXtreamToMyStream);

    // Onglets de type Xtream (Direct, VOD, Séries)
    document.querySelectorAll('.xtream-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.xtream-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadXtreamData(tab.dataset.type);
        });
    });

    // Filtre de catégorie Xtream
    document.getElementById('xtreamCategorySelect')?.addEventListener('change', (e) => {
        xtreamState.selectedCategory = e.target.value;
        renderXtreamGrid();
    });

    // Recherche Xtream
    document.getElementById('xtreamSearchInput')?.addEventListener('input', (e) => {
        xtreamState.searchQuery = e.target.value;
        renderXtreamGrid();
    });

    // Import Rapide M3U (Client-side Web App)
    document.getElementById('quickImportBtn')?.addEventListener('click', openImportModal);
    document.getElementById('closeImport')?.addEventListener('click', closeImportModal);
    document.getElementById('importModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'importModal') closeImportModal();
    });

    document.getElementById('btnLoadUrl')?.addEventListener('click', () => {
        const url = (document.getElementById('m3uUrlInput')?.value || '').trim();
        if (url) loadM3UFromUrl(url);
    });

    const webAppFileInput = document.getElementById('webAppFileInput');
    if (webAppFileInput) {
        webAppFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleClientFileUpload(e.target.files[0]);
            }
        });
    }

    const dropArea = document.getElementById('webAppUploadArea');
    if (dropArea) {
        ['dragenter', 'dragover'].forEach(name => {
            dropArea.addEventListener(name, (e) => {
                e.preventDefault();
                dropArea.style.borderColor = '#a855f7';
                dropArea.style.background = 'rgba(168, 85, 247, 0.1)';
            });
        });
        ['dragleave', 'drop'].forEach(name => {
            dropArea.addEventListener(name, (e) => {
                e.preventDefault();
                dropArea.style.borderColor = 'rgba(168, 85, 247, 0.4)';
                dropArea.style.background = 'transparent';
            });
        });
        dropArea.addEventListener('drop', (e) => {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleClientFileUpload(e.dataTransfer.files[0]);
            }
        });
    }

    // Chargement initial du catalogue M3U
    loadActiveM3U();
});

// ==========================================
// Fonctions d'Import Client (Web App)
// ==========================================

function openImportModal() {
    const modal = document.getElementById('importModal');
    if (modal) modal.classList.add('active');
}

function closeImportModal() {
    const modal = document.getElementById('importModal');
    if (modal) modal.classList.remove('active');
    showImportStatus('');
}

function showImportStatus(msg, type = '') {
    const el = document.getElementById('importModalStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
    if (type === 'error') {
        el.style.background = 'rgba(239, 68, 68, 0.2)';
        el.style.border = '1px solid rgba(239, 68, 68, 0.5)';
        el.style.color = '#ef4444';
    } else if (type === 'success') {
        el.style.background = 'rgba(34, 197, 94, 0.2)';
        el.style.border = '1px solid rgba(34, 197, 94, 0.5)';
        el.style.color = '#22c55e';
    } else {
        el.style.background = 'rgba(255, 255, 255, 0.1)';
        el.style.color = '#fff';
    }
}

async function loadM3UFromUrl(url) {
    if (!url) return;
    showImportStatus('Téléchargement de la playlist en cours...', '');
    try {
        let content = '';
        try {
            const res = await fetch(url);
            if (res.ok) content = await res.text();
        } catch (e) {
            // Tentative via proxy si problème CORS
            const proxyRes = await fetch(`/api/xtream/proxy?url=${encodeURIComponent(url)}`);
            if (proxyRes.ok) content = await proxyRes.text();
        }

        if (!content || !content.includes('#EXTINF')) {
            throw new Error('Impossible de lire les flux M3U depuis cette URL (vérifiez le lien)');
        }

        const name = url.split('/').pop().split('?')[0] || 'Playlist URL';
        applyM3UContent(name, content);
    } catch (e) {
        showImportStatus(`❌ Erreur: ${e.message}`, 'error');
    }
}

function handleClientFileUpload(file) {
    if (!file) return;
    showImportStatus('Lecture du fichier en local...', '');
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        if (!text || !text.includes('#EXTINF')) {
            showImportStatus('Ce fichier ne contient pas de directive #EXTINF valide.', 'error');
            return;
        }
        applyM3UContent(file.name, text);
    };
    reader.onerror = () => showImportStatus('Erreur de lecture du fichier', 'error');
    reader.readAsText(file);
}

function applyM3UContent(name, text) {
    allItems = parseM3U(text);
    try {
        localStorage.setItem('mystream_active_playlist', JSON.stringify({ name, content: text }));
    } catch (e) {}

    // Sauvegarde en tâche de fond sur le serveur si disponible
    fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name, content: text })
    }).catch(() => {});

    renderContent();
    renderGroups();
    showImportStatus(`✅ ${allItems.length} flux chargés dans la Web App !`, 'success');
    setTimeout(() => {
        closeImportModal();
    }, 1200);
}