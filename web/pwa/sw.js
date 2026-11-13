// BT Servant Mini, installable web app: the service worker that makes it open without internet. It keeps the app's own
// files (page, script, the model runtime, icons); the language packs live in IndexedDB and the model in wllama's cache, both
// managed by the page. Requests to other sites (packs server, online AI) are left alone.
const VERSION = '__BUILD__'
const CACHE = `btsm-app-${VERSION}`
const FILES = __FILES__

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('btsm-app-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  // the page: the newest when online, the kept copy when not. The copy is the one of './': the host redirects
  // /app/index.html to /app/, and a browser refuses a redirected response for a page
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./')))
    return
  }
  // the app's files: the kept copy first (each build has its own cache)
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)))
})
