// Keeps the screens on the device. Version 8a483e9a4e.
var CACHE = 'zas-8a483e9a4e';
var SHELL = ["./","index.html","config.js","manifest.webmanifest","styles.css?v=329ee6c5ab","app.js?v=2a76184616","views.js?v=351a0fd049","picture.js?v=4a3197a23a","boot.js?v=c6ce1d6303","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","favicon.png"];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('zas-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  var fresh = req.mode === 'navigate' || /\/(config\.js|manifest\.webmanifest)$/.test(url.pathname) || /\/$/.test(url.pathname);
  if (fresh) {
    e.respondWith(Promise.race([
      fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req.mode === 'navigate' ? 'index.html' : req, copy); }); }
        return res;
      }),
      new Promise(function (_, no) { setTimeout(no, 4000); })
    ]).catch(function () {
      return caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true }).then(function (hit) { return hit || fetch(req); });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});
