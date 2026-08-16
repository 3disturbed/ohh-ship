/* atlas.js — load the world and make it navigable.

   Pulls the bathymetry rasters, the tidal constants and the marks, then does
   the two jobs that turn survey data into a place you can trade around:
   choosing which of the nine hundred harbours become ports, and making sure
   each of them can actually be reached — carving the approach where the
   survey is too coarse to see the channel. */
(function (S) {
  'use strict';
  var U = S.U, W = S.World, Geo = S.Geo, T = S.Tide;
  var A = S.Atlas = {};

  A.base = 'data/';
  A.v = '8';                       // bump with the asset version
  function u(p) { return A.base + p + '?v=' + A.v; }
  A.progress = function () {};

  /* ---------------- fetch helpers ---------------- */
  function json(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ': ' + r.status);
      return r.json();
    });
  }
  /** decode a heightmap PNG to raw RGBA using the browser's own decoder */
  function png(url) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0);
        res({ w: img.width, h: img.height, data: x.getImageData(0, 0, img.width, img.height).data });
      };
      img.onerror = function () { rej(new Error('image ' + url)); };
      img.src = url;
    });
  }

  /* ---------------- ports ---------------- */
  var MIN_SEP = 2600;            // metres between ports
  var ALWAYS = ['Conwy Marina'];   // harbours that must always be a port
  var MAX_PORTS = 150;

  function pickPorts() {
    var cands = [];
    W.harbours.forEach(function (h) {
      var r = W.rasterAt(h.lon, h.lat);
      if (!r || r.id === 'national') return;         // only where we have detail
      h.score = (h.kind === 'harbour' ? 2 : 0) +
                (/marina|yacht|quay|harbour|dock/i.test(h.name) ? 1 : 0) +
                (/boat ?yard|sailing club|private|proposed|slipway/i.test(h.name) ? -3 : 0);
      cands.push(h);
    });
    cands.forEach(function (c) { if (ALWAYS.indexOf(c.name) >= 0) c.score += 100; });
    cands.sort(function (a, b) { return b.score - a.score || a.name.length - b.name.length; });
    var out = [];
    for (var i = 0; i < cands.length && out.length < MAX_PORTS; i++) {
      var c = cands[i], ok = true;
      for (var k = 0; k < out.length; k++)
        if (U.len(c.x - out[k].x, c.y - out[k].y) < MIN_SEP) { ok = false; break; }
      if (ok) out.push(c);
    }
    out.sort(function (a, b) { return a.y - b.y; });
    return out.map(function (h, i) {
      var big = h.score >= 2;
      return {
        id: 'p' + i, name: h.name, x: h.x, y: h.y, lon: h.lon, lat: h.lat,
        region: (W.rasterAt(h.lon, h.lat) || {}).name || '',
        r: big ? 240 : 170,
        berth: 8 + Math.round((big ? 16 : 8) * (0.6 + 0.8 * ((i * 37) % 10) / 10)),
        /* every proper marina sells fuel, kit and boats; smaller havens vary */
        fuel: (big || i % 4 === 0) ? 0.95 : 0,
        yard: (big || i % 7 === 0),
        chandler: (big || i % 3 === 0),
        size: big ? 0.9 : 0.55,
        desc: ''
      };
    });
  }

  /** the deepest way in, and the shallowest water on it */
  function approach(p) {
    var best = { min: -99, brg: 0, len: 0 };
    for (var a = 0; a < 36; a++) {
      var br = a * 10 * Math.PI / 180;
      var dx = Math.sin(br), dy = -Math.cos(br);
      var worst = 99, len = 0, escaped = false;
      for (var d = 150; d <= 6000; d += 150) {
        var dep = W.getChartedDepth(p.x + dx * d, p.y + dy * d);
        if (dep < worst) worst = dep;
        len = d;
        if (dep > 6) { escaped = true; break; }
      }
      if (!escaped) continue;
      if (worst > best.min) best = { min: worst, brg: br, len: len };
    }
    return best;
  }

  /** carve the approach and a berth pool where the survey cannot see them */
  function ensureAccess(ports) {
    var carved = 0;
    ports.forEach(function (p) {
      var ap = approach(p);
      p.approach = ap.brg;
      /* a small pool at the berth, so she always floats alongside near HW */
      var pool = p.size > 0.8 ? 2.6 : 1.6;
      W.addChannel([[p.lon, p.lat], [p.lon + 1e-5, p.lat + 1e-5]], p.r * 0.5, pool, p.name);
      if (ap.min < 0.4) {
        /* run a channel out along the best line until it meets real water */
        var dx = Math.sin(ap.brg), dy = -Math.cos(ap.brg);
        var pts = [];
        for (var d = 0; d <= ap.len; d += 250) {
          var g = Geo.unproject(p.x + dx * d, p.y + dy * d);
          pts.push([g.lon, g.lat]);
        }
        if (pts.length > 1) {
          W.addChannel(pts, 70, p.size > 0.8 ? 1.8 : 0.7, p.name + ' approach');
          carved++;
        }
      }
      p.gate = Math.min(pool, Math.max(approach(p).min, -2));
    });
    return carved;
  }

  /* ---------------- routing ---------------- */
  function buildRoutes(ports) {
    var nodes = ports.map(function (p) { return { x: p.x, y: p.y, id: p.id }; });
    /* offshore stepping stones: a coarse lattice over navigable water */
    var b = W.bounds(), step = 16000;
    for (var y = b.y0; y < b.y1; y += step)
      for (var x = b.x0; x < b.x1; x += step)
        if (W.getChartedDepth(x, y) > 12) nodes.push({ x: x, y: y, id: null });
    var edges = nodes.map(function () { return []; });
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var d = U.len(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
        if (d > 42000) continue;
        var lim = (nodes[i].id || nodes[j].id) ? -1.5 : 4;
        if (!W.clearWater(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y, lim)) continue;
        edges[i].push({ to: j, d: d }); edges[j].push({ to: i, d: d });
      }
    }
    var table = {};
    ports.forEach(function (p, pi) {
      var n = nodes.length, dist = new Float64Array(n).fill(Infinity), seen = new Uint8Array(n);
      dist[pi] = 0;
      for (var k = 0; k < n; k++) {
        var bi = -1, bd = Infinity;
        for (var q = 0; q < n; q++) if (!seen[q] && dist[q] < bd) { bd = dist[q]; bi = q; }
        if (bi < 0) break;
        seen[bi] = 1;
        for (var e = 0; e < edges[bi].length; e++) {
          var ed = edges[bi][e];
          if (dist[bi] + ed.d < dist[ed.to]) dist[ed.to] = dist[bi] + ed.d;
        }
      }
      table[p.id] = {};
      ports.forEach(function (q, qi) { table[p.id][q.id] = dist[qi]; });
    });
    W.routeTable = table;
    return nodes.length;
  }

  /* ---------------- load ---------------- */
  A.load = function (onProgress) {
    A.progress = onProgress || function () {};
    var t0 = Date.now();
    A.progress('Reading the tide gauges', 0.05);
    return json(u('uk-tides.json')).then(function (tides) {
      T.load(tides);
      A.progress('Charting the United Kingdom', 0.15);
      return Promise.all([json(u('uk-bathy.json')), png(u('uk-bathy.png'))]);
    }).then(function (r) {
      var meta = r[0], im = r[1];
      meta.id = 'national';
      W.addRaster(meta, im.data);
      A.progress('Surveying the cruising grounds', 0.3);
      return json(u('regions/index.json'));
    }).then(function (idx) {
      var list = idx.regions, done = 0;
      return Promise.all(list.map(function (m) {
        return png(u('regions/' + m.id + '.png')).then(function (im) {
          W.addRaster(m, im.data);
          done++;
          A.progress('Surveying ' + m.name, 0.3 + 0.4 * done / list.length);
        }).catch(function () { /* a missing region just falls back to the national grid */ });
      }));
    }).then(function () {
      A.progress('Laying out the buoyage', 0.75);
      return json(u('uk-marks.json'));
    }).then(function (m) {
      W.markKinds = m.kinds;
      W.marks = m.marks.map(function (r) {
        var p = Geo.project(r[1], r[2]);
        return { t: r[0], lon: r[1], lat: r[2], x: p.x, y: p.y,
                 n: r[3], cat: r[4], lt: r[5] || '', col: r[6] || '' };
      });
      W.harbours = m.harbours.map(function (r) {
        var p = Geo.project(r[0], r[1]);
        return { lon: r[0], lat: r[1], x: p.x, y: p.y, name: r[2], kind: r[3] };
      });
      W.buildMarkGrid();
      A.progress('Choosing ports of call', 0.85);
      W.PORTS = pickPorts();
      var carved = ensureAccess(W.PORTS);
      A.progress('Planning passages', 0.93);
      var nodes = buildRoutes(W.PORTS);
      W.ready = true;
      A.stats = { ports: W.PORTS.length, marks: W.marks.length, carved: carved,
                  nodes: nodes, ms: Date.now() - t0 };
      A.progress('Ready', 1);
      return A.stats;
    });
  };

})(window.SCS);
