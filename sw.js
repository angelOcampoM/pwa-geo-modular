// =====================================================================
// sw.js - Service Worker con estrategia Cache First
// Autor: Angel Daniel Ocampo Martinez
//
// Guarda el App Shell para que la app abra sin internet.
// IMPORTANTE: ./geo-helper.js va en la lista; si faltara, sin red
// app.js fallaría porque sus funciones (obtenerUbicacionActual, etc.)
// no existirían.
// =====================================================================

// Sube la versión (v2, v3...) cada vez que cambies un archivo del App Shell
const CACHE_NAME = 'rumbo-static-v2';

const ARCHIVOS_APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './geo-helper.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// INSTALL: precache del App Shell
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando y guardando App Shell...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ARCHIVOS_APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE: borra cachés de versiones anteriores
self.addEventListener('activate', (event) => {
  console.log('[SW] Activado');
  event.waitUntil(
    caches.keys()
      .then((nombres) => {
        const viejas = nombres.filter((nombre) => nombre !== CACHE_NAME);
        return Promise.all(viejas.map((nombre) => caches.delete(nombre)));
      })
      .then(() => self.clients.claim())
  );
});

// FETCH: Cache First -> responde desde caché; si no está, va a la red
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((respuestaCache) => respuestaCache || fetch(event.request))
  );
});
