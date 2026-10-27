const CACHE_NAME = 'mystream-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/admin.html',
    '/style.css',
    '/admin.css',
    '/app.js',
    '/admin.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable.png',
    '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ne pas intercepter les requêtes API ni les flux vidéo externes
    if (url.pathname.startsWith('/api/') || url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts') || url.pathname.endsWith('.mp4')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            });
        })
    );
});
