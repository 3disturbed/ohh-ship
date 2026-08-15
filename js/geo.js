/* geo.js — real-world coordinates.

   The world is now the United Kingdom, so the game's metre grid has to be a
   real projection rather than a flat rectangle. We use a spherical transverse
   Mercator on a central meridian of 3.4°W, which is what Ordnance Survey does
   for the same reason: it is conformal, so headings and shapes are true, and
   across the width of Britain the scale error stays under a quarter of one
   percent.

   Game coordinates: x metres east of the central meridian (negative to the
   west), y metres south of the northern edge — keeping +y = south as the rest
   of the engine expects. */
(function (S) {
  'use strict';
  var U = S.U;
  var G = S.Geo = {};

  G.R = 6371008.8;                 // mean Earth radius, metres
  G.LON_C = -3.4;                  // central meridian
  G.LAT_N = 61.0;                  // northern edge of the world
  G.LAT_S = 49.8;
  G.LON_W = -8.8;
  G.LON_E = 2.0;

  var rad = Math.PI / 180, deg = 180 / Math.PI;
  var latNr = G.LAT_N * rad;

  function sinh(v) { return (Math.exp(v) - Math.exp(-v)) / 2; }
  function cosh(v) { return (Math.exp(v) + Math.exp(-v)) / 2; }

  /** longitude/latitude in degrees -> game metres */
  G.project = function (lon, lat) {
    var l = (lon - G.LON_C) * rad, p = lat * rad;
    var B = Math.cos(p) * Math.sin(l);
    B = U.clamp(B, -0.999999, 0.999999);
    return {
      x: 0.5 * G.R * Math.log((1 + B) / (1 - B)),
      y: G.R * (latNr - Math.atan2(Math.tan(p), Math.cos(l)))
    };
  };

  /** game metres -> longitude/latitude in degrees */
  G.unproject = function (x, y) {
    var D = latNr - y / G.R, xr = x / G.R;
    var ch = cosh(xr);
    return {
      lon: G.LON_C + Math.atan2(sinh(xr), Math.cos(D)) * deg,
      lat: Math.asin(U.clamp(Math.sin(D) / ch, -1, 1)) * deg
    };
  };

  /** local scale factor of the projection — 1.0 on the central meridian */
  G.scaleAt = function (x) { return cosh(x / G.R); };

  /** great-circle distance in metres, for checking the projection */
  G.haversine = function (lon1, lat1, lon2, lat2) {
    var p1 = lat1 * rad, p2 = lat2 * rad;
    var dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * G.R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  /* extent of the projected world, filled in on first use */
  G.bounds = function () {
    if (G._b) return G._b;
    var xs = [], ys = [];
    for (var i = 0; i <= 20; i++) {
      var f = i / 20;
      var lon = G.LON_W + (G.LON_E - G.LON_W) * f;
      var latA = G.project(lon, G.LAT_S), latB = G.project(lon, G.LAT_N);
      xs.push(latA.x, latB.x); ys.push(latA.y, latB.y);
      var lat = G.LAT_S + (G.LAT_N - G.LAT_S) * f;
      var lonA = G.project(G.LON_W, lat), lonB = G.project(G.LON_E, lat);
      xs.push(lonA.x, lonB.x); ys.push(lonA.y, lonB.y);
    }
    G._b = { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
             y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
    G._b.w = G._b.x1 - G._b.x0;
    G._b.h = G._b.y1 - G._b.y0;
    return G._b;
  };

  /** a printable position, as a navigator would write it */
  G.posStr = function (x, y) {
    var g = G.unproject(x, y);
    function d(v, pos, neg, pad) {
      var h = v >= 0 ? pos : neg, a = Math.abs(v);
      var dd = Math.floor(a), mm = (a - dd) * 60;
      return (pad && dd < 100 ? (dd < 10 ? '00' : '0') : '') + dd + '° ' +
             (mm < 10 ? '0' : '') + mm.toFixed(2) + "' " + h;
    }
    return d(g.lat, 'N', 'S') + '  ' + d(g.lon, 'E', 'W', true);
  };

})(window.SCS);
