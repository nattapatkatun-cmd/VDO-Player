/* Service worker: caches only the app itself (page, manifest, icons, hls.js, fonts)
   so the player opens offline. Video files, subtitles and stream URLs are never
   intercepted or stored — local files play from blob: URLs that bypass this worker. */
var VERSION = 'vp-v2';
var SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
             'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
var HLS_JS = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
var MEDIABUNNY = 'https://cdn.jsdelivr.net/npm/mediabunny@1.60.0/dist/bundles/mediabunny.min.mjs';
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

var scope = self.registration.scope;
var shellUrls = SHELL.map(function(p){ return new URL(p, scope).href; });
var indexUrl = shellUrls[0];
shellUrls.push(new URL('index.html', scope).href);

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){
    return c.addAll(SHELL).then(function(){
      return c.add(new Request(HLS_JS, {mode:'cors'})).catch(function(){});
    });
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VERSION; })
      .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function staleWhileRevalidate(e, key){
  var req = e.request;
  return caches.open(VERSION).then(function(c){
    return c.match(key || req).then(function(hit){
      var net = fetch(req).then(function(res){
        if (res && (res.ok || res.type === 'opaque')) c.put(key || req, res.clone());
        return res;
      });
      if (hit){ e.waitUntil(net.catch(function(){})); return hit; }
      return net;
    });
  });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  var url = new URL(req.url);

  // Page: network first so updates show up, cached copy when offline.
  if (req.mode === 'navigate' && url.href.split(/[?#]/)[0].indexOf(scope) === 0
      && (url.pathname.slice(-1) === '/' || /\/index\.html$/.test(url.pathname))){
    e.respondWith(fetch(req).then(function(res){
      if (res.ok){ var copy = res.clone(); caches.open(VERSION).then(function(c){ c.put(indexUrl, copy); }); }
      return res;
    }).catch(function(){
      return caches.match(indexUrl).then(function(hit){ return hit || Response.error(); });
    }));
    return;
  }
  var bare = url.origin + url.pathname;
  if (shellUrls.indexOf(bare) >= 0){ e.respondWith(staleWhileRevalidate(e, bare)); return; }
  if (req.url === HLS_JS || req.url === MEDIABUNNY || FONT_HOSTS.indexOf(url.hostname) >= 0){ e.respondWith(staleWhileRevalidate(e)); return; }
  // Everything else (videos, streams, subtitles) goes straight to the network.
});
