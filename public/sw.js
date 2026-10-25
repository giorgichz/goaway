// Service Worker: speichert die App selbst, damit sie ohne Internet startet.
// Daten (Lage, Kurse, Bahndaten …) liegen in IndexedDB, nicht hier.
// Bei Änderungen an den App-Dateien VERSION erhöhen.

const VERSION = 'neustart-v8';
const KACHELN = 'neustart-kacheln';
const MAX_KACHELN = 4000;
const KACHEL_HOSTS = /(basemaps\.cartocdn\.com|tile\.openstreetmap\.org|tile\.opentopomap\.org|server\.arcgisonline\.com|gibs\.earthdata\.nasa\.gov|raw\.githubusercontent\.com|upload\.wikimedia\.org|flagcdn\.com|tiles\.openfreemap\.org)$/;
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'data/laender.geojson',
  'vendor/satellite.min.js',
  'js/main.js', 'js/util.js', 'js/crypto.js', 'js/db.js', 'js/sperre.js', 'js/ki.js', 'js/karte.js', 'js/stadt.js', 'js/reise.js', 'js/mehr.js', 'js/laender.js', 'js/start.js', 'js/lage.js',
  'js/himmel.js', 'js/fluege.js', 'js/geld.js', 'js/plan.js', 'js/tresor.js', 'js/briefe.js', 'js/notfall.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== KACHELN).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Nur eigene Dateien: erst Netz (damit Updates ankommen), nach 4 s oder
// ohne Netz aus dem Cache.
// Externe APIs und der eigene KI-Server laufen am Service Worker vorbei.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // TileJSON der Vektorkarte verweist auf die aktuelle Kachel-Version: erst Netz.
  if (e.request.method === 'GET' && url.hostname === 'tiles.openfreemap.org' && url.pathname === '/planet') {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(KACHELN).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request)));
    return;
  }
  if (e.request.method === 'GET' && KACHEL_HOSTS.test(url.hostname)) {
    e.respondWith(kachel(e.request));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  // Bibliotheken (Cesium, MapLibre) ändern sich nur mit neuer Version: einmal
  // vollständig laden (ohne Zeitlimit, sie sind groß), danach aus dem Cache.
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  const timeout = new Promise((_, reject) => setTimeout(reject, 4000));
  e.respondWith(
    Promise.race([fetch(e.request), timeout])
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});

// Kartenkacheln: erst Cache, sonst Netz und merken. So bleiben angesehene
// Ausschnitte offline verfügbar. Nur angesehene Kacheln, kein Massen-Download.
async function kachel(request) {
  const cache = await caches.open(KACHELN);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') {
      await cache.put(request, res.clone());
      aufraeumen(cache);
    }
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

let zaehler = 0;
async function aufraeumen(cache) {
  if (++zaehler % 100) return;
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_KACHELN))) await cache.delete(k);
}
