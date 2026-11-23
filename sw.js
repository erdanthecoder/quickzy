// sw.js — lets Quickzy install like an app and work offline.
//
// When it installs it saves every file of the app (the list in precache.js),
// so the Quickzy app (/app) opens and plays solo quizzes with no internet.
// Pages are fetched network-first (updates show at once), falling back to the
// saved copy when the network is slow or gone. Live games need the internet.

importScripts('/precache.js');
const CACHE = 'quickzy-v2';
// libraries from other sites that the app can use offline once saved
const CDN = ['https://www.gstatic.com/firebasejs/', 'https://cdn.jsdelivr.net/npm/three@', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    // one at a time, so one missing file never stops the rest
    await Promise.all((self.PRECACHE || []).map((url) => c.add(new Request(url, { cache: 'reload' })).catch(() => {})));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // versioned libraries from other sites: the saved copy first, it never changes
  if (url.origin !== location.origin) {
    if (!CDN.some((p) => req.url.startsWith(p))) return;
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    })));
    return;
  }
  if (url.pathname.startsWith('/__')) return;              // Firebase Hosting and dev-server internals
  e.respondWith((async () => {
    try {
      const res = await Promise.race([fetch(req), timeout(navigator.onLine === false ? 1 : 6000)]);
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      // pages of the app all load the same shell
      if (req.mode === 'navigate') return (await caches.match('/index.html')) || (await caches.match('/'));
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
