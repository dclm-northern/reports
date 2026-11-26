// Keeps the screens on the device, so the system opens at once and works with no network.
// Version 317311eddd (the build sets it; a new version replaces the old copies).
var VERSION = '317311eddd';
var SHELL_CACHE = 'zas-shell-' + VERSION;
var LIBS_CACHE = 'zas-libs-1';   // Chart.js and the fonts: fixed versions, kept across updates
var SHELL = ["./","index.html","config.js","manifest.webmanifest","app.js?v=aab11cb6d7","views.js?v=bad5b66afb","picture.js?v=4a3197a23a","styles.css?v=6064a5c1ee","boot.js?v=007e0baac1","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","favicon.png"];
// Files from other sites that the page uses and that may be kept: the chart library (a fixed
// version, checked by the page with its integrity hash) and the fonts.
var LIBS = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/chart\.js@4\.4\.1\/|fonts\.googleapis\.com\/css2|fonts\.gstatic\.com\/)/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL_CACHE).then(function (c) {
    // One file that cannot be fetched (config.js not uploaded yet, say) must not stop the rest
    // being kept, or the system would never work offline.
    return Promise.all(SHELL.map(function (u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function (res) { if (res.ok) return c.put(u, res); }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('zas-') === 0 && k !== SHELL_CACHE && k !== LIBS_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/** The copy on the device at once; the network renews it in the background for next time. */
function staleWhileRevalidate(e, cacheName, key) {
  return caches.open(cacheName).then(function (c) {
    return c.match(key, { ignoreSearch: typeof key === 'string' }).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(key, res.clone());
        return res;
      });
      if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
      return net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;            // the server (Apps Script) is never cached here
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (LIBS.test(req.url)) e.respondWith(staleWhileRevalidate(e, LIBS_CACHE, req));
    return;
  }
  if (req.mode === 'navigate') {
    // The page itself: the copy on the device, so a weak signal never holds up opening it.
    e.respondWith(staleWhileRevalidate(e, SHELL_CACHE, 'index.html').catch(function () {
      return caches.match('index.html', { ignoreSearch: true });
    }));
    return;
  }
  var name = url.pathname.split('/').pop();
  if (name === 'config.js' || name === 'manifest.webmanifest' || name === '') {
    e.respondWith(staleWhileRevalidate(e, SHELL_CACHE, name || 'index.html'));
    return;
  }
  // Files with a version in their address never change: the copy on the device, if there is one.
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res.ok && url.search) { var copy = res.clone(); caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
