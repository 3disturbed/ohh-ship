/* util.js — maths, units, noise, formatting. No dependencies. */
window.SCS = window.SCS || {};
(function (S) {
  'use strict';
  var U = S.U = {};

  /* ---- units & constants ---- */
  U.TAU = Math.PI * 2;
  U.KN = 0.5144444;            // knots -> m/s
  U.MS2KN = 1 / U.KN;
  U.NM = 1852;                 // metres in a nautical mile
  U.RHO_AIR = 1.225;
  U.RHO_SEA = 1025;
  U.G = 9.81;
  U.FT = 3.28084;

  /* ---- scalar maths ---- */
  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.smooth = function (t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  U.mix = function (a, b, t) { return a + (b - a) * U.smooth(t); };
  U.deg = function (r) { return r * 180 / Math.PI; };
  U.rad = function (d) { return d * Math.PI / 180; };
  U.sign = function (v) { return v < 0 ? -1 : 1; };
  U.approach = function (cur, tgt, rate, dt) {
    var d = tgt - cur, m = rate * dt;
    return Math.abs(d) <= m ? tgt : cur + U.sign(d) * m;
  };

  /* ---- angles (radians, compass convention: 0 = north, +clockwise) ---- */
  U.wrap = function (a) { a %= U.TAU; return a < 0 ? a + U.TAU : a; };
  U.wrapPI = function (a) { a = (a + Math.PI) % U.TAU; if (a < 0) a += U.TAU; return a - Math.PI; };
  U.angDiff = function (a, b) { return U.wrapPI(a - b); };
  /** unit vector pointing along compass heading h (world: +x east, +y south) */
  U.hvec = function (h) { return { x: Math.sin(h), y: -Math.cos(h) }; };
  /** compass bearing of the vector (dx,dy) */
  U.bearingOf = function (dx, dy) { return U.wrap(Math.atan2(dx, -dy)); };

  /* ---- vectors ---- */
  U.len = function (x, y) { return Math.sqrt(x * x + y * y); };
  U.dist = function (a, b) { return U.len(b.x - a.x, b.y - a.y); };

  /* ---- deterministic randomness ---- */
  U.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  function hash2(x, y, s) {
    var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  U.hash2 = hash2;
  /** smooth 2-D value noise, output 0..1 */
  U.noise2 = function (x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = U.smooth(xf), v = U.smooth(yf);
    var a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s),
        c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  };
  U.fbm = function (x, y, oct, s) {
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < oct; i++) { v += amp * U.noise2(x * f, y * f, s + i * 7); norm += amp; amp *= 0.5; f *= 2; }
    return v / norm;
  };
  /** smooth 1-D value noise, output 0..1 */
  U.noise1 = function (x, s) {
    var xi = Math.floor(x), xf = x - xi;
    return U.lerp(hash2(xi, 0, s), hash2(xi + 1, 0, s), U.smooth(xf));
  };

  /* ---- geometry ---- */
  U.pointInPoly = function (px, py, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  U.distToSeg = function (px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    var t = l2 ? U.clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0;
    return U.len(px - (x1 + t * dx), py - (y1 + t * dy));
  };
  U.distToPoly = function (px, py, pts) {
    var best = Infinity;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++)
      best = Math.min(best, U.distToSeg(px, py, pts[j][0], pts[j][1], pts[i][0], pts[i][1]));
    return best;
  };
  U.distToPath = function (px, py, pts) {
    var best = Infinity;
    for (var i = 1; i < pts.length; i++)
      best = Math.min(best, U.distToSeg(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    return best;
  };

  /* ---- formatting ---- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  U.p2 = p2;
  /** world time (seconds since start, day 1 00:00) -> "Day 3 14:07" */
  U.clockStr = function (t) {
    var d = Math.floor(t / 86400) + 1, s = Math.floor(t % 86400);
    return 'Day ' + d + '  ' + p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s / 60) % 60);
  };
  U.hhmm = function (t) {
    var s = Math.floor(((t % 86400) + 86400) % 86400);
    return p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s / 60) % 60);
  };
  /** duration in seconds -> "3h 08m" / "42m" */
  U.durStr = function (sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.round(sec % 3600 / 60);
    if (m === 60) { h++; m = 0; }
    return h ? h + 'h ' + p2(m) + 'm' : m + 'm';
  };
  U.brgStr = function (rad) { return p2(Math.round(U.deg(U.wrap(rad)))).padStart(3, '0') + '°'; };
  U.nmStr = function (m) {
    var nm = m / U.NM;
    return (nm < 1 ? nm.toFixed(2) : nm.toFixed(1)) + ' NM';
  };
  U.money = function (v) {
    var n = Math.round(v);
    return '£' + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (n < 0 ? ' dr' : '');
  };
  /** 16-point compass name */
  var PTS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  U.cardinal = function (rad) { return PTS[Math.round(U.deg(U.wrap(rad)) / 22.5) % 16]; };

  /* ---- misc ---- */
  U.pick = function (rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; };
  U.shuffle = function (rng, arr) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  };
  U.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

})(window.SCS);
