/* tide.js — the real tides of the United Kingdom.

   Not a copy of anyone's tide tables. Thirty-eight gauges of the National
   Tide Gauge Network were each least-squares fitted for eight harmonic
   constituents from a month of fifteen-minute observations (see
   tools/fetch_tides.py). This module interpolates those constituents between
   stations, so the range and the timing of high water vary around the coast
   the way they really do: twelve metres in the Severn, under two at Lowestoft,
   and high water sweeping anticlockwise around Britain.

   Amplitude and phase are interpolated separately. Averaging the phasors
   instead would make the range collapse wherever neighbouring stations
   disagree on timing, which is precisely what happens in the Dover Strait.

   Heights here are a model, not a prediction. NOT FOR NAVIGATION. */
(function (S) {
  'use strict';
  var U = S.U, Geo = S.Geo;
  var T = S.Tide = {};

  /* degrees per hour */
  T.SPEED = { M2: 28.9841042, S2: 30.0, N2: 28.4397295, K2: 30.0821373,
              K1: 15.0410686, O1: 13.9430356, M4: 57.9682084, MS4: 58.9841042 };
  T.stations = [];
  T.epoch = 0;                 // ms UTC that the fits are referenced to

  var RAD = Math.PI / 180;
  var NEAR = 4;                // stations blended at any one place

  T.load = function (list) {
    T.stations = list.map(function (s) {
      var o = { name: s.name, lat: s.lat, lon: s.lon, z0: s.z0, con: {} };
      for (var c in T.SPEED) {
        var v = s.con[c] || [0, 0];
        o.con[c] = { a: v[0], g: v[1] };
      }
      /* the record each fit was referenced to */
      o.t0 = Date.parse(s.epoch);
      return o;
    });
    /* all fits share a common epoch by shifting each station's phase */
    var base = Math.min.apply(null, T.stations.map(function (s) { return s.t0; }));
    T.epoch = base;
    T.stations.forEach(function (s) {
      var dh = (s.t0 - base) / 3600000;
      for (var c in T.SPEED) s.con[c].g = (s.con[c].g - T.SPEED[c] * dh) % 360;
    });
    T._cache = {};
  };

  function dist2(lon1, lat1, lon2, lat2) {
    var dx = (lon2 - lon1) * Math.cos((lat1 + lat2) * 0.5 * RAD), dy = lat2 - lat1;
    return dx * dx + dy * dy;
  }

  /** blended constituents at a place, cached on a coarse grid */
  T.at = function (lon, lat) {
    var key = (Math.round(lon * 12) * 4096 + Math.round(lat * 12));
    var hit = T._cache[key];
    if (hit) return hit;
    var st = T.stations;
    if (!st.length) return null;
    var near = [];
    for (var i = 0; i < st.length; i++) near.push([dist2(lon, lat, st[i].lon, st[i].lat), st[i]]);
    near.sort(function (a, b) { return a[0] - b[0]; });
    var k = Math.min(NEAR, near.length);
    var out = { z0: 0, con: {} }, wsum = 0;
    var amp = {}, pc = {}, ps = {};
    for (var c in T.SPEED) { amp[c] = 0; pc[c] = 0; ps[c] = 0; }
    for (var n = 0; n < k; n++) {
      var d = Math.max(near[n][0], 1e-7), s = near[n][1], w = 1 / (d * d);
      wsum += w; out.z0 += w * s.z0;
      for (var c2 in T.SPEED) {
        amp[c2] += w * s.con[c2].a;
        pc[c2] += w * Math.cos(s.con[c2].g * RAD);
        ps[c2] += w * Math.sin(s.con[c2].g * RAD);
      }
    }
    out.z0 /= wsum;
    for (var c3 in T.SPEED)
      out.con[c3] = { a: amp[c3] / wsum, g: Math.atan2(ps[c3], pc[c3]) / RAD };
    T._cache[key] = out;
    return out;
  };

  /** height of tide above chart datum, metres. t is game seconds. */
  T.height = function (lon, lat, t) {
    var s = T.at(lon, lat);
    if (!s) return 3;
    var h = s.z0, hrs = t / 3600;
    for (var c in T.SPEED)
      h += s.con[c].a * Math.cos((T.SPEED[c] * hrs - s.con[c].g) * RAD);
    return h;
  };
  /** height of mean sea level above chart datum */
  T.z0 = function (lon, lat) {
    var s = T.at(lon, lat);
    return s ? s.z0 : 2.5;
  };
  /** spring and neap ranges, from the two dominant constituents */
  T.ranges = function (lon, lat) {
    var s = T.at(lon, lat);
    if (!s) return { spring: 4, neap: 2 };
    var m = s.con.M2.a, ss = s.con.S2.a;
    return { spring: 2 * (m + ss), neap: 2 * Math.max(0.15, m - ss) };
  };

  /** the full picture at a place: height, rate, next high and low water */
  T.info = function (lon, lat, t) {
    var h = T.height(lon, lat, t);
    var rate = (T.height(lon, lat, t + 60) - T.height(lon, lat, t - 60)) / 2;   // m/min
    /* walk forward to the turning points */
    var step = 300, prev = T.height(lon, lat, t), prevRate = rate;
    var nextHW = null, nextLW = null, hHW = 0, hLW = 0;
    for (var k = 1; k <= 200 && (nextHW === null || nextLW === null); k++) {
      var tt = t + k * step;
      var cur = T.height(lon, lat, tt);
      var r = cur - prev;
      if (prevRate > 0 && r <= 0 && nextHW === null) { nextHW = tt; hHW = cur; }
      if (prevRate < 0 && r >= 0 && nextLW === null) { nextLW = tt; hLW = cur; }
      prev = cur; prevRate = r;
    }
    var rg = T.ranges(lon, lat);
    var spring = U.clamp((T.range24(lon, lat, t) - rg.neap) /
                         Math.max(0.2, rg.spring - rg.neap), 0, 1);
    return { height: h, rate: rate, rising: rate > 0,
             nextHW: nextHW === null ? t + 21600 : nextHW, nextHWHeight: hHW,
             nextLW: nextLW === null ? t + 21600 : nextLW, nextLWHeight: hLW,
             range: T.range24(lon, lat, t), springs: 0.42 + 0.58 * spring };
  };
  /** the range over the day around t */
  T.range24 = function (lon, lat, t) {
    var mn = 1e9, mx = -1e9;
    for (var k = -12; k <= 12; k++) {
      var v = T.height(lon, lat, t + k * 1800);
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    return mx - mn;
  };


  /* ---------------- tidal streams ----------------
     A tidal stream is the water moving under the wave, not a separate thing.
     For a progressive wave in water of depth h the current is

         u = (eta - MSL) * sqrt(g / h)

     directed along the way the wave is travelling, which we get from the
     gradient of the M2 phase: the crest arrives later where the phase lag is
     greater. That single relation gives about three knots through the Solent,
     under one in the open North Sea, and five or more in the Severn, which is
     roughly what happens. Named races are strengthened by hand below. */
  T.RACES = [
    { n: 'Portland Race',    lon: -2.44, lat: 50.51, r: 0.09, k: 7.0 },
    { n: 'Pentland Firth',   lon: -3.13, lat: 58.72, r: 0.20, k: 15.0 },
    { n: 'Corryvreckan',     lon: -5.71, lat: 56.15, r: 0.05, k: 8.0 },
    { n: 'Menai Swellies',   lon: -4.17, lat: 53.21, r: 0.04, k: 6.0 },
    { n: 'Hurst Narrows',    lon: -1.55, lat: 50.70, r: 0.05, k: 3.2 },
    { n: 'Alderney Race',    lon: -2.20, lat: 49.75, r: 0.18, k: 6.0 },
    { n: 'Ramsey Sound',     lon: -5.32, lat: 51.87, r: 0.05, k: 5.0 },
    { n: 'Bristol Deep',     lon: -3.00, lat: 51.45, r: 0.25, k: 1.8 },
    { n: 'Dover Strait',     lon:  1.45, lat: 51.02, r: 0.22, k: 1.5 },
    { n: 'Kyle Rhea',        lon: -5.66, lat: 57.24, r: 0.04, k: 6.0 },
    { n: 'Strangford Narrows', lon: -5.55, lat: 54.36, r: 0.05, k: 6.5 },
    { n: 'Skerries',         lon: -4.60, lat: 53.42, r: 0.09, k: 2.0 }
  ];

  /** unit vector along the direction the tidal wave travels */
  T.propDir = function (lon, lat) {
    var e = 0.25;
    function g(lo, la) {
      var s = T.at(lo, la);
      return s ? s.con.M2.g : 0;
    }
    var g0 = g(lon, lat);
    function d(v) { var x = (v - g0) % 360; if (x > 180) x -= 360; if (x < -180) x += 360; return x; }
    var dx = d(g(lon + e, lat)), dy = d(g(lon, lat + e));
    var ex = dx * Math.cos(lat * RAD), ey = -dy;           // +y is south
    var m = Math.sqrt(ex * ex + ey * ey);
    if (m < 1e-6) return { x: 1, y: 0 };
    return { x: ex / m, y: ey / m };
  };

  /** tidal stream in metres per second, in game axes (+y south) */
  T.stream = function (lon, lat, t, depth) {
    var s = T.at(lon, lat);
    if (!s) return { x: 0, y: 0 };
    var eta = T.height(lon, lat, t) - s.z0;
    var h = Math.max(10, depth);      // the relation runs away in the shallows
    /* 0.5 because a real estuary is not a clean progressive wave: the
       unscaled relation gives nearly six knots across the middle of the
       Solent, where two and a half is the truth. The base is then capped —
       outside the named races a British tidal stream rarely beats four
       knots, however big the range or however thin the water. */
    var mag = U.clamp(0.5 * eta * Math.sqrt(9.81 / h), -2.05, 2.05);
    var boost = 1;
    for (var i = 0; i < T.RACES.length; i++) {
      var r = T.RACES[i];
      var dd = Math.sqrt(Math.pow((lon - r.lon) * Math.cos(lat * RAD), 2) +
                         Math.pow(lat - r.lat, 2));
      if (dd < r.r) boost = Math.max(boost, 1 + (r.k - 1) * U.smooth(1 - dd / r.r));
    }
    mag = U.clamp(mag * boost, -6.5, 6.5);
    var d = T.propDir(lon, lat);
    return { x: d.x * mag, y: d.y * mag };
  };

})(window.SCS);
