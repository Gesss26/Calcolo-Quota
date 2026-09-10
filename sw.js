/* ==============================================================
   SERVICE WORKER — Calcolatore Quote
   Strategia:
   - HTML  → network-first (SEMPRE fresco dal server)
   - Altri → cache-first, aggiornati in background
   - CACHE_NAME con timestamp → ogni modifica invalida la cache
   ============================================================== */

// ⚠️ Timestamp automatico: ogni volta che modifichi sw.js
//    (o lo ricarichi dal server), il nome cambia e la cache
//    vecchia viene automaticamente eliminata.
const VERSION = 'v-' + Date.now();
const CACHE_NAME = 'calcolatore-quote-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .catch(err => console.warn('[SW] Errore cache install:', err))
  );
  // Attiva subito il nuovo SW senza aspettare la chiusura delle tab
  self.skipWaiting();
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Elimina tutte le cache con nome diverso dal corrente
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
      // Prende il controllo di tutte le pagine aperte
      await self.clients.claim();
      console.log('[SW] Attivato:', CACHE_NAME);
    })()
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', event => {
  const req = event.request;

  // Ignora richieste non-GET (POST, PUT, ecc.)
  if (req.method !== 'GET') return;

  // Ignora richieste verso domini esterni
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ---- HTML: NETWORK-FIRST (sempre fresco) ----
  if (req.mode === 'navigate' ||
      (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-store' });
          // Aggiorna la cache in background
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (err) {
          // Offline → usa la cache
          const cached = await caches.match(req);
          return cached || caches.match('./index.html');
        }
      })()
    );
    return;
  }

  // ---- ALTRI ASSET: CACHE-FIRST con aggiornamento in background ----
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        // Aggiorna in background (stale-while-revalidate)
        fetch(req).then(fresh => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(req, fresh));
          }
        }).catch(() => {});
        return cached;
      }

      // Non in cache → scarica e salva
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        // Fallback finale
        return caches.match('./index.html');
      }
    })()
  );
});

/* ---------- MESSAGGI DALLA PAGINA ---------- */
self.addEventListener('message', event => {
  if (event.data && event.data.tipo === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.tipo === 'SVUOTA_CACHE') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(ASSETS);
        console.log('[SW] Cache svuotata e ricostruita');
      })()
    );
  }
});