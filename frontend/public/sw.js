/* Only the public application shell is cached. No API responses, chat history,
   access tokens, attachments, POSTs, or cross-origin requests are cached. */
const CACHE = "omsai-shell-v2";
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch("/", { cache: "reload" });
    if (response.ok) {
      const html = await response.clone().text();
      await cache.put("/", response);
      const assets = [...html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g)].map(m => m[1]).filter(url => url.startsWith("/") && !url.startsWith("//"));
      await Promise.allSettled(assets.map(asset => cache.add(asset)));
    }
    await Promise.allSettled(["/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"].map(asset => cache.add(asset)));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("omsai-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || /^\/(api|auth|socket\.io|webhook|uploads)(\/|$)/.test(url.pathname)) return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }
  if (/\.(?:js|css|woff2?|svg|png|webmanifest)$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(req, copy)); }
      return response;
    })));
  }
});
