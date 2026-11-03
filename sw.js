// حساب من — service worker: works fully offline after the first visit
const CACHE = 'hesab-v4';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

// Safari refuses to serve "redirected" responses for page loads, so store clean copies.
async function clean(res) {
  const body = await res.blob();
  return new Response(body, { status: 200, statusText: 'OK', headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/html; charset=utf-8' } });
}
async function precache() {
  const c = await caches.open(CACHE);
  await Promise.all(CORE.map(async u => {
    try { const r = await fetch(u, { cache: 'reload' }); if (r.ok) await c.put(u, await clean(r)); } catch (e) {}
  }));
}
self.addEventListener('install', e => { e.waitUntil(precache().then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'precache') e.waitUntil(precache()); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fonts: cache first
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    }).catch(() => new Response('', { status: 504 }))));
    return;
  }
  if (url.origin !== location.origin) return;

  // Opening the app: always the cached page (instant, works offline), refreshed in the background
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = (await c.match('./index.html')) || (await c.match('./'));
      const net = fetch('./index.html', { cache: 'no-cache' }).then(async r => { if (r.ok) await c.put('./index.html', await clean(r.clone())); return r; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      try { return await net; } catch (err) { return new Response('<h3 dir="rtl" style="font-family:sans-serif;padding:24px">یک‌بار با اینترنت باز کنید تا اپ برای حالت آفلاین آماده شود.</h3>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
    })());
    return;
  }

  // Other app files: cache first, update in background
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(async res => {
      if (res.ok) { const c = await caches.open(CACHE); await c.put(req, await clean(res.clone())); }
      return res;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
