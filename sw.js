// Keeps the screens on the device. Version 5b6007c897.
var CACHE = 'zas-5b6007c897';
var SHELL = ["./","index.html","config.js","manifest.webmanifest","styles.css?v=329ee6c5ab","app.js?v=2c466404e5","views.js?v=351a0fd049","picture.js?v=4a3197a23a","boot.js?v=6be60db6d0","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","favicon.png"];
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
    // The copy on the device straight away (so a weak signal never holds up opening the system);
    // the network refreshes it in the background, so a new version shows from the next opening.
    var key = req.mode === 'navigate' ? 'index.html' : url.pathname.split('/').pop();
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(key, { ignoreSearch: true }).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res.ok) c.put(key, res.clone()); return res; });
        if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
        return net;
      });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});
