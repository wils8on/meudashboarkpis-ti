const CACHE_NAME = 'painel-kpi-v9';
const APP_SHELL = [
    './',
    './index.html',
    './dashboard.html',
    './manifest.webmanifest',
    './assets/pwa-icon.svg',
    './css/login.css',
    './css/dashboard.css',
    './js/firebase-config.js',
    './js/auth-guard.js',
    './js/client-store.js',
    './js/private-ticket-store.js',
    './js/solutions-store.js',
    './js/solutions-dashboard.js',
    './js/access-admin.js',
    './js/login.js',
    './js/dashboard.js'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    if (url.pathname.endsWith('/dados.json')) {
        const stableRequest = new Request(new URL('./dados.json', self.location.href), { method: 'GET' });
        event.respondWith(
            fetch(event.request).then(response => {
                if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(stableRequest, response.clone()));
                return response;
            }).catch(() => caches.match(stableRequest))
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok && url.origin === self.location.origin) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
