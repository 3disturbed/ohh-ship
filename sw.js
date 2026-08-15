/* sw.js — offline cache. Bump ASSET_V here and in index.html together. */
var ASSET_V = '6';
var CACHE = 'ohh-ship-v' + ASSET_V;
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=' + ASSET_V,
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
].concat(['util', 'data', 'world', 'environment', 'vessel', 'economy', 'education',
          'render', 'chart', 'instruments', 'ui', 'game']
  .map(function (n) { return './js/' + n + '.js?v=' + ASSET_V; }));

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ASSETS);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* The document is fetched fresh when possible, so a new build is picked up;
     versioned assets never change under a given URL, so cache wins. */
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match('./index.html'); });
      })
    );
    return;
  }
  e.respondWith(caches.match(req).then(function (m) {
    return m || fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
  }));
});
