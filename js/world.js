/* world.js — geography, bathymetry, harbours, navigation marks.  (SDD §27–29)
   The visible world is stylised; the navigation data underneath is coherent.

   Coordinate system: metres. +x east, +y south. Depths are metres below
   chart datum (negative = drying height above datum, or dry land). */
(function (S) {
  'use strict';
  var U = S.U;
  var W = S.World = {};

  W.WIDTH = 24000;
  W.HEIGHT = 18000;
  W.CELL = 100;
  W.NX = W.WIDTH / W.CELL + 1;   // 241 nodes
  W.NY = W.HEIGHT / W.CELL + 1;  // 181 nodes

  /* ===================== coastline ===================== */
  /* Traversed so that the enclosed interior is land. Bays and inlets are
     notches in the outline, which keeps the rendered coastline crisp. */
  W.LAND = [
    { name: 'mainland', bottom: 'sand', pts: [
      [-2000, -2000], [26000, -2000], [26000, 2300],
      [23400, 2500], [22900, 2800], [22500, 3200],
      /* Kellan Cove */ [22320, 3130], [22050, 3260], [21880, 3520], [22120, 3660], [22380, 3560],
      [22150, 3800], [21850, 3900], [21600, 4200], [21500, 4400], [20900, 5400],
      [20300, 5000], [19900, 4200], [19500, 3500], [19050, 3200],
      /* Saint Mary's estuary — east bank, head, west bank */
      [18850, 2600], [19050, 2000], [19350, 1500], [19550, 1000], [19450, 600],
      [19000, 430], [18500, 620], [18200, 1120], [17700, 1520], [17300, 2020], [17100, 2520], [16900, 3060],
      [16200, 2950], [15200, 3050], [14200, 3350], [13200, 3500], [12200, 3400],
      [11200, 3100], [10200, 2900], [9400, 3000], [8700, 3350], [8100, 3900],
      [7500, 4300], [6800, 4500], [6250, 4400],
      /* Ferry Hard */ [6080, 4130], [5720, 4090], [5620, 4420], [5380, 4300],
      [5220, 3950], [5000, 3650], [4400, 3550], [3900, 3600],
      /* Westhaven Bay */ [3400, 3350], [3300, 2600], [2600, 2150], [1900, 2350], [1750, 3150], [1600, 3550],
      [1000, 3700], [300, 3500], [-2000, 3300]
    ] },
    { name: 'sker', bottom: 'rock', pts: [
      [9600, 10300], [10200, 9650], [10600, 9600],
      /* Sker Creek */ [10680, 10000], [10900, 10250], [11050, 10000],
      [11150, 9600], [11250, 9550], [12050, 10050], [12250, 11000],
      [11600, 11750], [10550, 11850], [9750, 11300]
    ] },
    { name: 'cormorant', bottom: 'mud', pts: [
      [-2000, 8800], [900, 8900], [2000, 9500], [2500, 10400],
      /* Cormorant Cove */ [2100, 10500], [1500, 10600], [1250, 10850], [1600, 11150], [2200, 11150],
      [2300, 11300], [1500, 12100], [400, 12500], [-2000, 12700]
    ] },
    { name: 'gullrock', bottom: 'rock', pts: [
      [15250, 12550], [15750, 12400], [16050, 12750], [15700, 13100], [15250, 12950]
    ] }
  ];

  /* Shoals and banks. 'top' is the depth at the shallowest point
     (negative = dries that many metres above chart datum). */
  W.BANKS = [
    { name: 'Sker Bank',     x: 13900, y: 8300,  rx: 2300, ry: 1250, rot: -0.35, top: 0.4,  bottom: 'sand' },
    { name: 'Sker Spit',     x: 9250,  y: 9550,  rx: 950,  ry: 520,  rot: -0.6,  top: 0.6,  bottom: 'sand' },
    { name: 'The Whaleback', x: 20050, y: 6250,  rx: 850,  ry: 460,  rot: 0.5,   top: -0.5, bottom: 'rock' },
    { name: 'Middle Ground', x: 6900,  y: 6600,  rx: 1550, ry: 900,  rot: 0.2,   top: 1.6,  bottom: 'sand' },
    { name: 'St Mary Bar',   x: 17950, y: 3000,  rx: 1150, ry: 380,  rot: 0.05,  top: 0.5,  bottom: 'sand' },
    { name: 'East Mud',      x: 18800, y: 1950,  rx: 480,  ry: 1150, rot: 0.0,   top: -1.2, bottom: 'mud' },
    { name: 'West Mud',      x: 17450, y: 2150,  rx: 430,  ry: 1250, rot: 0.0,   top: -0.9, bottom: 'mud' },
    { name: 'Quay Flats',    x: 19080, y: 900,   rx: 620,  ry: 480,  rot: 0.0,   top: -1.0, bottom: 'mud' },
    { name: 'Creek Bar',     x: 10880, y: 9720,  rx: 480,  ry: 330,  rot: 0.0,   top: -0.7, bottom: 'mud' },
    { name: 'Cormorant Bar', x: 2420,  y: 10870, rx: 260,  ry: 470,  rot: 0.0,   top: 1.0,  bottom: 'sand' },
    { name: 'Gull Ledge',    x: 15300, y: 13300, rx: 700,  ry: 400,  rot: 0.3,   top: 0.9,  bottom: 'rock' },
    { name: 'Kellan Ledge',  x: 21150, y: 4700,  rx: 420,  ry: 300,  rot: 0.0,   top: 1.2,  bottom: 'rock' }
  ];

  /* Dredged / natural channels. Depth is raised (never lowered) to 'depth'
     along the centreline, tapering to the natural bottom at the edge. */
  W.CHANNELS = [
    { name: 'St Mary Approach', hw: 250, depth: 3.0, bottom: 'sand',
      pts: [[17800, 5400], [17850, 4400], [17900, 3600], [17980, 3050]] },
    { name: 'Kellan Approach', hw: 120, depth: 3.0, bottom: 'rock',
      pts: [[22880, 3860], [22560, 3600], [22280, 3450], [22140, 3405]] },
    { name: 'St Mary Channel', hw: 130, depth: 0.1, bottom: 'mud',
      pts: [[17980, 3050], [18120, 2600], [18320, 2050], [18620, 1500], [18980, 1050], [19150, 820]] },
    { name: 'Sker Creek', hw: 75, depth: 0.15, bottom: 'mud',
      pts: [[10820, 9420], [10850, 9700], [10870, 9950], [10880, 10140]] },
    { name: 'Cormorant Entrance', hw: 110, depth: 2.2, bottom: 'mud',
      pts: [[2700, 10850], [2200, 10820], [1750, 10840], [1520, 10860]] },
    { name: 'Westhaven Approach', hw: 180, depth: 3.0, bottom: 'mud',
      pts: [[2500, 4300], [2500, 3500], [2500, 3000], [2500, 2780]] }
  ];

  /* ===================== harbours ===================== */
  W.PORTS = [
    { id: 'westhaven', name: 'Westhaven', x: 2500, y: 2760, basin: 3.0, r: 240,
      berth: 24, fuel: 0.98, yard: true, chandler: true, size: 1.0, bottom: 'mud',
      desc: 'The home port. Deep enough at any state of the tide, sheltered from everything but a southerly.' },
    { id: 'ferryhard', name: 'Ferry Hard', x: 5880, y: 4300, basin: 2.4, r: 110,
      berth: 8, fuel: 0, yard: false, chandler: false, size: 0.5, bottom: 'sand',
      desc: 'A stone quay on the Ferry peninsula, three miles across the bay. A good first job.' },
    { id: 'stmarys', name: "Saint Mary's Quay", x: 19150, y: 820, basin: 0.6, r: 130,
      berth: 14, fuel: 0, yard: false, chandler: true, size: 0.8, bottom: 'mud',
      desc: 'Four miles up a drying estuary. Pays well because most skippers cannot get in.' },
    { id: 'kellan', name: 'Kellan Point', x: 22120, y: 3400, basin: 3.2, r: 140,
      berth: 16, fuel: 0.98, yard: false, chandler: true, size: 0.75, bottom: 'rock',
      desc: 'Deep water in the cove, but the approach past the Whaleback and the race is no place to be careless.' },
    { id: 'skercreek', name: 'Sker Creek', x: 10880, y: 10150, basin: 0.7, r: 95,
      berth: 6, fuel: 0, yard: false, chandler: false, size: 0.45, bottom: 'mud',
      desc: 'An island creek behind a drying bar. Fish out, everything else in.' },
    { id: 'cormorant', name: 'Cormorant Cove', x: 1500, y: 10850, basin: 2.2, r: 150,
      berth: 9, fuel: 0.9, yard: false, chandler: false, size: 0.6, bottom: 'mud',
      desc: 'A quiet cove under the western headland. Bar at the entrance, then good water inside.' }
  ];
  W.port = function (id) {
    for (var i = 0; i < W.PORTS.length; i++) if (W.PORTS[i].id === id) return W.PORTS[i];
    return null;
  };

  /* ===================== navigation marks (§29) ===================== */
  /* type: safe | port | stbd | north | south | east | west | danger | light | tower */
  W.MARKS = [
    { n: 'Westhaven',   t: 'safe',  x: 2500,  y: 4500,  lt: 'LFl.10s' },
    { n: 'WH No.1',     t: 'port',  x: 2160,  y: 3480,  lt: 'Fl.R.4s' },
    { n: 'WH No.2',     t: 'stbd',  x: 2900,  y: 3450,  lt: 'Fl.G.4s' },
    { n: 'Westhaven Lt',t: 'tower', x: 3380,  y: 3320,  lt: 'Oc.WR.6s' },

    { n: 'Middle Grd S',t: 'south', x: 6900,  y: 7750,  lt: 'Q(6)+LFl.15s' },
    { n: 'Middle Grd W',t: 'west',  x: 5200,  y: 6600,  lt: 'Q(9)15s' },
    { n: 'Ferry Hard',  t: 'stbd',  x: 5800,  y: 4720,  lt: 'Fl.G.5s' },

    { n: 'Sker Bank N', t: 'north', x: 13900, y: 6850,  lt: 'Q' },
    { n: 'Sker Bank W', t: 'west',  x: 11450, y: 8150,  lt: 'Q(9)15s' },
    { n: 'Sker Bank E', t: 'east',  x: 16400, y: 8500,  lt: 'Q(3)10s' },
    { n: 'Sker Creek',  t: 'stbd',  x: 10820, y: 9280,  lt: 'Fl.G.3s' },
    { n: 'Sker Lt',     t: 'light', x: 12180, y: 10120, lt: 'Fl(2)WR.10s' },

    { n: 'St Mary',     t: 'safe',  x: 17780, y: 5750,  lt: 'LFl.10s' },
    { n: 'Bar No.1',    t: 'stbd',  x: 18110, y: 4600,  lt: 'Fl.G.4s' },
    { n: 'Bar No.2',    t: 'port',  x: 17600, y: 4300,  lt: 'Fl.R.4s' },
    { n: 'Bar No.3',    t: 'stbd',  x: 18140, y: 3450,  lt: 'Fl(2)G.6s' },
    { n: 'Bar No.4',    t: 'port',  x: 17720, y: 3150,  lt: 'Fl(2)R.6s' },
    { n: 'Perch A',     t: 'stbd',  x: 18230, y: 2500 },
    { n: 'Perch B',     t: 'port',  x: 18190, y: 2100 },
    { n: 'Perch C',     t: 'stbd',  x: 18740, y: 1420 },
    { n: 'St Mary Ch',  t: 'tower', x: 19000, y: 380,   lt: 'church spire' },

    { n: 'Whaleback',   t: 'danger',x: 20050, y: 6250,  lt: 'Fl(2)5s' },
    { n: 'Kellan W',    t: 'west',  x: 19700, y: 6350,  lt: 'Q(9)15s' },
    { n: 'Kellan Head', t: 'light', x: 20870, y: 5330,  lt: 'Fl.WR.7s' },
    { n: 'Kellan No.1', t: 'stbd',  x: 22540, y: 3390,  lt: 'Fl.G.4s' },
    { n: 'Kellan No.2', t: 'port',  x: 22470, y: 3660,  lt: 'Fl.R.4s' },

    { n: 'Cormorant',   t: 'stbd',  x: 2860,  y: 10830, lt: 'Fl.G.5s' },
    { n: 'Cormorant Pt',t: 'light', x: 2450,  y: 9900,  lt: 'Fl.5s' },
    { n: 'Gull Rock',   t: 'south', x: 15400, y: 13750, lt: 'Q(6)+LFl.15s' }
  ];

  /* ===================== tidal stream fields (§21) ===================== */
  /* dir: compass direction the FLOOD stream sets towards (degrees).
     rate: spring rate in knots.  lag: hours after HW that the flood peaks. */
  W.STREAMS = [
    { n: 'Offshore',   x: 12000, y: 14500, rx: 15000, ry: 6000, dir: 82,  rate: 0.9, lag: -3.1 },
    { n: 'Sker Sound', x: 11000, y: 6900,  rx: 6200,  ry: 2700, dir: 74,  rate: 2.2, lag: -3.1 },
    { n: 'Sker Gap',   x: 8600,  y: 9200,  rx: 2200,  ry: 2000, dir: 120, rate: 1.6, lag: -3.1 },
    { n: 'Kellan Race',x: 20500, y: 6100,  rx: 2500,  ry: 1900, dir: 38,  rate: 3.2, lag: -3.0 },
    { n: 'St Mary App',x: 17850, y: 4700,  rx: 1100,  ry: 1500, dir: 356, rate: 2.0, lag: -2.6 },
    { n: 'St Mary Ch', x: 18450, y: 2100,  rx: 1300,  ry: 1900, dir: 340, rate: 3.0, lag: -2.2 },
    { n: 'Westhaven',  x: 2500,  y: 3500,  rx: 1700,  ry: 1500, dir: 8,   rate: 0.6, lag: -3.0 },
    { n: 'Creek',      x: 10860, y: 9800,  rx: 450,   ry: 900,  dir: 176, rate: 1.7, lag: -2.4 },
    { n: 'Cormorant',  x: 2100,  y: 10850, rx: 1300,  ry: 700,  dir: 272, rate: 1.2, lag: -2.6 }
  ];

  /* ===================== bathymetry build (§28) ===================== */
  var depth = null;      // Float32Array of charted depth at grid nodes
  var bottom = null;     // Uint8Array bottom type index
  var landMask = null;   // Uint8Array, 1 where the node is inside a coastline
  var BOTTOMS = ['sand', 'mud', 'gravel', 'rock'];
  W.BOTTOMS = BOTTOMS;

  function bbox(pts) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (var i = 0; i < pts.length; i++) {
      b.x0 = Math.min(b.x0, pts[i][0]); b.x1 = Math.max(b.x1, pts[i][0]);
      b.y0 = Math.min(b.y0, pts[i][1]); b.y1 = Math.max(b.y1, pts[i][1]);
    }
    return b;
  }
  function bboxDist(b, x, y) {
    var dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1);
    return U.len(dx, dy);
  }

  /** signed distance to the coast: >0 in water, <0 inside land */
  function signedLand(x, y) {
    var best = Infinity, inside = false;
    for (var i = 0; i < W.LAND.length; i++) {
      var L = W.LAND[i];
      if (bboxDist(L._bb, x, y) < best) best = Math.min(best, U.distToPoly(x, y, L.pts));
      if (!inside && U.pointInPoly(x, y, L.pts)) inside = true;
    }
    return inside ? -best : best;
  }
  W.signedLand = signedLand;

  function ellipseWeight(b, x, y) {
    var dx = x - b.x, dy = y - b.y, c = Math.cos(-b.rot), s = Math.sin(-b.rot);
    var u = (dx * c - dy * s) / b.rx, v = (dx * s + dy * c) / b.ry;
    var r = Math.sqrt(u * u + v * v);
    return r >= 1 ? 0 : U.smooth(1 - r);
  }

  W.build = function () {
    var i, j, k;
    for (i = 0; i < W.LAND.length; i++) W.LAND[i]._bb = bbox(W.LAND[i].pts);
    for (i = 0; i < W.CHANNELS.length; i++) W.CHANNELS[i]._bb = bbox(W.CHANNELS[i].pts);

    depth = new Float32Array(W.NX * W.NY);
    bottom = new Uint8Array(W.NX * W.NY);
    landMask = new Uint8Array(W.NX * W.NY);

    for (j = 0; j < W.NY; j++) {
      var y = j * W.CELL;
      for (i = 0; i < W.NX; i++) {
        var x = i * W.CELL, idx = j * W.NX + i;
        var sd = signedLand(x, y), d, bt = 0;

        if (sd < 0) {
          /* dry land — steep so that a big tide does not flood the country */
          d = -(0.4 + 0.018 * -sd);
          if (d < -16) d = -16;
        } else {
          /* offshore profile: shelving beach, then a gently deepening bay */
          d = 22 * (1 - Math.exp(-sd / 2600)) + 0.0016 * sd;
          d += (U.fbm(x / 1400, y / 1400, 3, 11) - 0.5) * Math.min(2.2, 0.35 + d * 0.09);
          if (sd > 2500) bt = 2;
        }

        /* banks & shoals */
        for (k = 0; k < W.BANKS.length; k++) {
          var b = W.BANKS[k], w = ellipseWeight(b, x, y);
          if (w > 0) {
            var t = w * w;
            d = U.lerp(d, b.top + (1 - w) * 1.4, t);
            if (t > 0.25) bt = BOTTOMS.indexOf(b.bottom);
          }
        }

        /* rocky ground around the island and the headlands */
        if (sd > 0 && sd < 500) {
          if (U.pointInPoly(x, y, W.LAND[1].pts) || U.len(x - 10900, y - 10700) < 2400 ||
              U.len(x - 20900, y - 5400) < 1800 || U.len(x - 15650, y - 12800) < 1400) bt = 3;
        }

        /* channels — raise the bottom's water depth along the centreline */
        for (k = 0; k < W.CHANNELS.length; k++) {
          var c = W.CHANNELS[k];
          if (bboxDist(c._bb, x, y) > c.hw * 2.2) continue;
          var dc = U.distToPath(x, y, c.pts);
          if (dc < c.hw * 2.0) {
            var wt = U.smooth(1 - dc / (c.hw * 2.0));
            var target = c.depth * (0.35 + 0.65 * wt);
            if (target > d) { d = U.lerp(d, target, Math.min(1, wt * 1.6)); bt = BOTTOMS.indexOf(c.bottom); }
          }
        }

        /* harbour basins */
        for (k = 0; k < W.PORTS.length; k++) {
          var p = W.PORTS[k], dp = U.len(x - p.x, y - p.y);
          if (dp < p.r * 2.2) {
            var wp = U.smooth(1 - dp / (p.r * 2.2));
            if (p.basin > d) d = U.lerp(d, p.basin, wp);
            if (wp > 0.4) bt = BOTTOMS.indexOf(p.bottom);
          }
        }

        depth[idx] = d;
        bottom[idx] = bt < 0 ? 0 : bt;
        landMask[idx] = sd < 0 ? 1 : 0;
      }
    }

    /* sanity: every harbour must actually be in water */
    for (k = 0; k < W.PORTS.length; k++) {
      var pt = W.PORTS[k];
      if (signedLand(pt.x, pt.y) < 0) console.warn('Harbour on dry land:', pt.name);
    }
    W.contours = {};
    [0, 2, 5, 10, 20].forEach(function (lv) { W.contours[lv] = marchingSquares(lv); });
    return W;
  };

  /* ---- queries ---- */
  /** charted depth in metres below chart datum, bilinear (§28) */
  W.getChartedDepth = function (x, y) {
    var fx = U.clamp(x / W.CELL, 0, W.NX - 1.001), fy = U.clamp(y / W.CELL, 0, W.NY - 1.001);
    var i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, o = j * W.NX + i;
    var a = depth[o], b = depth[o + 1], c = depth[o + W.NX], d = depth[o + W.NX + 1];
    return U.lerp(U.lerp(a, b, tx), U.lerp(c, d, tx), ty);
  };
  W.getBottom = function (x, y) {
    var i = U.clamp(Math.round(x / W.CELL), 0, W.NX - 1), j = U.clamp(Math.round(y / W.CELL), 0, W.NY - 1);
    return BOTTOMS[bottom[j * W.NX + i]];
  };
  W.depthArray = function () { return depth; };
  W.landArray = function () { return landMask; };
  /** true if this position is inside a coastline (cheap grid lookup) */
  W.isLand = function (x, y) {
    var i = U.clamp(Math.round(x / W.CELL), 0, W.NX - 1), j = U.clamp(Math.round(y / W.CELL), 0, W.NY - 1);
    return landMask[j * W.NX + i] === 1;
  };
  /** steepest-descent direction away from shallow water (for warnings) */
  W.deepwardBearing = function (x, y) {
    var e = 220;
    var gx = W.getChartedDepth(x + e, y) - W.getChartedDepth(x - e, y);
    var gy = W.getChartedDepth(x, y + e) - W.getChartedDepth(x, y - e);
    return U.bearingOf(gx, gy);
  };
  W.nearestPort = function (x, y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < W.PORTS.length; i++) {
      var d = U.len(x - W.PORTS[i].x, y - W.PORTS[i].y);
      if (d < bd) { bd = d; best = W.PORTS[i]; }
    }
    return { port: best, dist: bd };
  };
  W.nearestMark = function (x, y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < W.MARKS.length; i++) {
      var d = U.len(x - W.MARKS[i].x, y - W.MARKS[i].y);
      if (d < bd) { bd = d; best = W.MARKS[i]; }
    }
    return { mark: best, dist: bd };
  };
  /* ---- passage routing (§27 Routes) ----
     A small graph of offshore waypoints. Contract distances and deadlines are
     worked out along navigable water, not through the middle of a headland. */
  W.NODES = [
    [2500, 4900], [4300, 6300], [5900, 5000], [3050, 8300], [2950, 10850],
    [7300, 9400], [8700, 7100], [10820, 9150], [9200, 12600], [12000, 4900],
    [13900, 6300], [15600, 8200], [15000, 11200], [17800, 5900], [19700, 7000],
    [21800, 4700], [20400, 9200], [12500, 15000], [5000, 14000], [18500, 12000]
  ];
  var graph = null;

  /** is there navigable water all the way along this line? */
  function clear(ax, ay, bx, by, minDepth) {
    var n = Math.ceil(U.len(bx - ax, by - ay) / 120);
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      if (W.getChartedDepth(ax + (bx - ax) * t, ay + (by - ay) * t) < minDepth) return false;
    }
    return true;
  }
  W.clearWater = clear;

  function buildGraph() {
    var nodes = [], i, j;
    for (i = 0; i < W.NODES.length; i++) nodes.push({ x: W.NODES[i][0], y: W.NODES[i][1], port: null });
    for (i = 0; i < W.PORTS.length; i++) nodes.push({ x: W.PORTS[i].x, y: W.PORTS[i].y, port: W.PORTS[i].id });
    var edges = nodes.map(function () { return []; });
    for (i = 0; i < nodes.length; i++) {
      for (j = i + 1; j < nodes.length; j++) {
        var d = U.len(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
        if (d > 9000) continue;
        /* harbour legs may cross the bar; open-water legs must be properly deep */
        var lim = (nodes[i].port || nodes[j].port) ? 0.0 : 2.5;
        if (!clear(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y, lim)) continue;
        edges[i].push({ to: j, d: d }); edges[j].push({ to: i, d: d });
      }
    }
    graph = { nodes: nodes, edges: edges };
  }

  function dijkstra(from) {
    var n = graph.nodes.length, dist = new Float64Array(n).fill(Infinity), seen = new Uint8Array(n);
    dist[from] = 0;
    for (var k = 0; k < n; k++) {
      var best = -1, bd = Infinity;
      for (var i = 0; i < n; i++) if (!seen[i] && dist[i] < bd) { bd = dist[i]; best = i; }
      if (best < 0) break;
      seen[best] = 1;
      graph.edges[best].forEach(function (e) {
        if (dist[best] + e.d < dist[e.to]) dist[e.to] = dist[best] + e.d;
      });
    }
    return dist;
  }

  /** sailing distance between two harbours, in metres */
  W.passageDistance = function (a, b) {
    if (!graph) buildGraph();
    if (!a.id || !b.id) return U.len(b.x - a.x, b.y - a.y);
    if (!W.routeTable) {
      W.routeTable = {};
      for (var i = 0; i < graph.nodes.length; i++) {
        var nd = graph.nodes[i];
        if (!nd.port) continue;
        var dist = dijkstra(i);
        W.routeTable[nd.port] = {};
        for (var j = 0; j < graph.nodes.length; j++) {
          if (graph.nodes[j].port) W.routeTable[nd.port][graph.nodes[j].port] = dist[j];
        }
      }
    }
    var d = W.routeTable[a.id] && W.routeTable[a.id][b.id];
    if (d === undefined || !isFinite(d)) return U.len(b.x - a.x, b.y - a.y) * 1.35;
    return d;
  };

  /* ---- marching squares: depth contours (§29) ---- */
  function marchingSquares(level) {
    var segs = [], nx = W.NX, ny = W.NY, c = W.CELL;
    function ix(a, b, va, vb) { var t = (level - va) / (vb - va); return a + (b - a) * U.clamp(t, 0, 1); }
    for (var j = 0; j < ny - 1; j++) {
      for (var i = 0; i < nx - 1; i++) {
        var o = j * nx + i;
        var d0 = depth[o], d1 = depth[o + 1], d2 = depth[o + nx + 1], d3 = depth[o + nx];
        var m = (d0 > level ? 1 : 0) | (d1 > level ? 2 : 0) | (d2 > level ? 4 : 0) | (d3 > level ? 8 : 0);
        if (m === 0 || m === 15) continue;
        var x0 = i * c, y0 = j * c, x1 = x0 + c, y1 = y0 + c;
        var T = { x: ix(x0, x1, d0, d1), y: y0 }, R = { x: x1, y: ix(y0, y1, d1, d2) },
            B = { x: ix(x1, x0, d2, d3), y: y1 }, L = { x: x0, y: ix(y1, y0, d3, d0) };
        function push(a, b) { segs.push(a.x, a.y, b.x, b.y); }
        switch (m) {
          case 1: case 14: push(L, T); break;
          case 2: case 13: push(T, R); break;
          case 3: case 12: push(L, R); break;
          case 4: case 11: push(R, B); break;
          case 6: case 9:  push(T, B); break;
          case 7: case 8:  push(L, B); break;
          case 5:  push(L, T); push(R, B); break;
          case 10: push(T, R); push(L, B); break;
        }
      }
    }
    return new Float32Array(segs);
  }
  W.marchingSquares = marchingSquares;

})(window.SCS);
