/* atlas.js — load the world and make it navigable.

   Pulls the bathymetry rasters, the tidal constants, the marks, and the baked
   ports. Which harbours become ports, the route each one has to open water,
   the carved channels where the survey is too coarse to see a real channel,
   and the synthetic buoyage that marks them are all decided offline by
   tools/bake_ports.js, which also proves every port's tidal access window —
   this module just loads data/uk-ports.json and registers it. */
(function (S) {
  'use strict';
  var U = S.U, W = S.World, Geo = S.Geo, T = S.Tide;
  var A = S.Atlas = {};

  A.base = 'data/';
  A.v = '9';                       // bump with the asset version
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
  /** register the baked ports: berth pools, carved channels, buoyage.
      Every gate in the file is the walked minimum of its own route, and every
      port is proven to open at least two hours a cycle at the worst neaps. */
  function ingestPorts(doc) {
    var carved = 0;
    W.PORTS = doc.ports.map(function (p) {
      var pr = Geo.project(p.lon, p.lat);
      p.x = pr.x; p.y = pr.y;
      p.desc = '';
      /* a pool at the berth, so she always floats alongside near HW */
      W.addChannel([[p.lon, p.lat], [p.lon + 1e-5, p.lat + 1e-5]], p.r * 0.5, p.pool, p.name);
      (p.channels || []).forEach(function (c) {
        W.addChannel(c.pts, c.hw, c.d, p.name + ' approach');
        carved++;
      });
      return p;
    });
    (doc.marks || []).forEach(function (r) {
      var q = Geo.project(r[1], r[2]);
      W.marks.push({ t: r[0], lon: r[1], lat: r[2], x: q.x, y: q.y,
                     n: r[3], cat: r[4], lt: r[5] || '', col: r[6] || '' });
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
      A.progress('Choosing ports of call', 0.85);
      return json(u('uk-ports.json'));
    }).then(function (pd) {
      var carved = ingestPorts(pd);
      W.buildMarkGrid();
      A.progress('Planning passages', 0.93);
      var nodes = buildRoutes(W.PORTS);
      W.ready = true;
      A.stats = { ports: W.PORTS.length, marks: W.marks.length, carved: carved,
                  dropped: (pd.dropped || []).length, nodes: nodes, ms: Date.now() - t0 };
      A.progress('Ready', 1);
      return A.stats;
    });
  };

})(window.SCS);
