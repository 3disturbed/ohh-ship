/* world.js — the United Kingdom.

   Depths come from the EMODnet Bathymetry DTM: a national raster at about a
   kilometre, and finer rasters over the cruising areas. Both ship as 16-bit
   heightmap PNGs holding elevation in metres above mean sea level, which the
   browser decodes for us.

   Two things turn a survey into something you can sail. Elevation above mean
   sea level becomes depth below chart datum, using the tidal model's Z0. And
   where a real channel is narrower than the survey can see, it is carved back
   in — see data/SOURCES.md.

   NOT FOR NAVIGATION. */
(function (S) {
  'use strict';
  var U = S.U, Geo = S.Geo;
  var W = S.World = {};

  W.rasters = [];
  W.marks = [];
  W.harbours = [];
  W.ready = false;

  /* ---------------- raster ---------------- */
  function Raster(meta, rgb) {
    this.lon0 = meta.lon0; this.lat0 = meta.lat0;
    this.lon1 = meta.lon1; this.lat1 = meta.lat1;
    this.nx = meta.nx; this.ny = meta.ny;
    this.id = meta.id || 'national';
    this.name = meta.name || 'United Kingdom';
    this.dlon = (this.lon1 - this.lon0) / (this.nx - 1);
    this.dlat = (this.lat1 - this.lat0) / (this.ny - 1);
    this.cell = this.dlat * 111320;              // metres, for picking the finest
    var n = this.nx * this.ny, e = this.elev = new Float32Array(n);
    var sc = meta.scale, bi = meta.bias;
    for (var i = 0; i < n; i++)
      e[i] = ((rgb[i * 4] << 8 | rgb[i * 4 + 1]) - bi) * sc;
  }
  /** elevation in metres above mean sea level, bilinear; NaN outside */
  Raster.prototype.at = function (lon, lat) {
    var fx = (lon - this.lon0) / this.dlon;
    var fy = (this.lat1 - lat) / this.dlat;         // row 0 is the north edge
    if (fx < 0 || fy < 0 || fx > this.nx - 1.001 || fy > this.ny - 1.001) return NaN;
    var i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, o = j * this.nx + i;
    return U.lerp(U.lerp(this.elev[o], this.elev[o + 1], tx),
                  U.lerp(this.elev[o + this.nx], this.elev[o + this.nx + 1], tx), ty);
  };
  Raster.prototype.contains = function (lon, lat) {
    return lon >= this.lon0 && lon <= this.lon1 && lat >= this.lat0 && lat <= this.lat1;
  };
  W.Raster = Raster;

  W.addRaster = function (meta, rgb) {
    var r = new Raster(meta, rgb);
    W.rasters.push(r);
    W.rasters.sort(function (a, b) { return b.cell - a.cell; });   // coarsest first
    return r;
  };
  /** the finest raster covering this position */
  function rasterAt(lon, lat) {
    for (var i = W.rasters.length - 1; i >= 0; i--)
      if (W.rasters[i].contains(lon, lat)) return W.rasters[i];
    return null;
  }
  W.rasterAt = rasterAt;
  /** the finest raster overlapping a projected point, for rendering */
  W.regionAt = function (x, y) {
    var g = Geo.unproject(x, y);
    var r = rasterAt(g.lon, g.lat);
    return (r && r.id !== 'national') ? r : null;
  };

  /* ---------------- elevation -> charted depth ---------------- */
  W.chartDatumOffset = function (lon, lat) {
    return S.Tide ? S.Tide.z0(lon, lat) : 2.5;
  };
  /** charted depth in metres below chart datum; negative dries, or is land */
  W.depthAtGeo = function (lon, lat) {
    var r = rasterAt(lon, lat);
    if (!r) return -60;
    var e = r.at(lon, lat);
    if (e !== e) return -60;
    return carve(lon, lat, -e - W.chartDatumOffset(lon, lat));
  };
  W.getChartedDepth = function (x, y) {
    var g = Geo.unproject(x, y);
    return W.depthAtGeo(g.lon, g.lat);
  };

  /* ---------------- carved channels ---------------- */
  W.CHANNELS = [];
  function segDistM(lon, lat, x1, y1, x2, y2) {
    var kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 111320;
    return U.distToSeg(lon * kx, lat * ky, x1 * kx, y1 * ky, x2 * kx, y2 * ky);
  }
  function carve(lon, lat, d) {
    var ch = W.CHANNELS;
    for (var i = 0; i < ch.length; i++) {
      var c = ch[i];
      if (lon < c.bb[0] || lon > c.bb[2] || lat < c.bb[1] || lat > c.bb[3]) continue;
      var best = Infinity, p = c.pts;
      for (var k = 1; k < p.length; k++) {
        var dd = segDistM(lon, lat, p[k - 1][0], p[k - 1][1], p[k][0], p[k][1]);
        if (dd < best) best = dd;
      }
      if (best < c.hw * 2.2) {
        var w = U.smooth(1 - best / (c.hw * 2.2));
        var target = c.depth * (0.4 + 0.6 * w);
        if (target > d) d = U.lerp(d, target, Math.min(1, w * 1.8));
      }
    }
    return d;
  }
  W.addChannel = function (pts, halfWidthM, depth, name) {
    var bb = [999, 999, -999, -999], pad = halfWidthM * 2.4 / 60000;
    pts.forEach(function (p) {
      bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]);
      bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]);
    });
    W.CHANNELS.push({ pts: pts, hw: halfWidthM, depth: depth, name: name,
                      bb: [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad] });
  };

  /* ---------------- bottom type ----------------
     No national sediment layer ships with the game, so the bottom is inferred
     from depth and slope: rock under steep ground, mud in the quiet shallows,
     sand in between. It is an educated guess and the handbook says so. */
  W.getBottom = function (x, y) {
    var g = Geo.unproject(x, y), e = 0.004;
    var d = W.depthAtGeo(g.lon, g.lat);
    var s = Math.abs(W.depthAtGeo(g.lon + e, g.lat) - W.depthAtGeo(g.lon - e, g.lat)) +
            Math.abs(W.depthAtGeo(g.lon, g.lat + e) - W.depthAtGeo(g.lon, g.lat - e));
    if (s > 16) return 'rock';
    if (d < 2.5 && s < 2.0) return 'mud';
    if (s > 8) return 'gravel';
    return 'sand';
  };
  /** bearing towards deeper water */
  W.deepwardBearing = function (x, y) {
    var e = 260;
    return U.bearingOf(W.getChartedDepth(x + e, y) - W.getChartedDepth(x - e, y),
                       W.getChartedDepth(x, y + e) - W.getChartedDepth(x, y - e));
  };

  /* ---------------- world bounds ---------------- */
  var bd = null;
  function bounds() { return bd || (bd = Geo.bounds()); }
  W.bounds = bounds;
  Object.defineProperty(W, 'WIDTH', { get: function () { return bounds().w; } });
  Object.defineProperty(W, 'HEIGHT', { get: function () { return bounds().h; } });
  W.clampPos = function (v) {
    var b = bounds();
    v.x = U.clamp(v.x, b.x0 + 50, b.x1 - 50);
    v.y = U.clamp(v.y, b.y0 + 50, b.y1 - 50);
  };

  /* ---------------- ports and marks ---------------- */
  W.PORTS = [];
  W.port = function (id) {
    for (var i = 0; i < W.PORTS.length; i++) if (W.PORTS[i].id === id) return W.PORTS[i];
    return null;
  };
  W.nearestPort = function (x, y) {
    var best = null, b2 = Infinity;
    for (var i = 0; i < W.PORTS.length; i++) {
      var p = W.PORTS[i], d = U.len(x - p.x, y - p.y);
      if (d < b2) { b2 = d; best = p; }
    }
    return { port: best, dist: b2 };
  };
  W.portsWithin = function (x, y, r) {
    var out = [];
    for (var i = 0; i < W.PORTS.length; i++) {
      var p = W.PORTS[i];
      if (U.len(x - p.x, y - p.y) <= r) out.push(p);
    }
    return out;
  };
  W.nearestMark = function (x, y) {
    var best = null, b2 = Infinity, l = [];
    W.marksIn(x - 6000, y - 6000, x + 6000, y + 6000, l);
    for (var i = 0; i < l.length; i++) {
      var d = U.len(x - l[i].x, y - l[i].y);
      if (d < b2) { b2 = d; best = l[i]; }
    }
    return { mark: best, dist: best ? b2 : Infinity };
  };
  /** marks inside a projected box — the national list is long, so it is bucketed */
  W.marksIn = function (x0, y0, x1, y1, out) {
    out.length = 0;
    var g = W._mgrid;
    if (!g) return out;
    var i0 = Math.floor((x0 - g.x0) / g.cell), i1 = Math.floor((x1 - g.x0) / g.cell);
    var j0 = Math.floor((y0 - g.y0) / g.cell), j1 = Math.floor((y1 - g.y0) / g.cell);
    for (var j = Math.max(0, j0); j <= Math.min(g.ny - 1, j1); j++)
      for (var i = Math.max(0, i0); i <= Math.min(g.nx - 1, i1); i++) {
        var b = g.cells[j * g.nx + i];
        if (b) for (var k = 0; k < b.length; k++) out.push(b[k]);
      }
    return out;
  };
  W.buildMarkGrid = function () {
    var b = bounds(), cell = 15000;
    var nx = Math.ceil(b.w / cell) + 1, ny = Math.ceil(b.h / cell) + 1;
    var g = { x0: b.x0, y0: b.y0, cell: cell, nx: nx, ny: ny, cells: new Array(nx * ny) };
    W.marks.forEach(function (m) {
      var i = Math.floor((m.x - b.x0) / cell), j = Math.floor((m.y - b.y0) / cell);
      if (i < 0 || j < 0 || i >= nx || j >= ny) return;
      var o = j * nx + i;
      (g.cells[o] || (g.cells[o] = [])).push(m);
    });
    W._mgrid = g;
  };

  /* ---------------- contours ---------------- */
  /** marching squares over part of a raster; returns segments in game metres */
  W.contour = function (r, level, lon0, lat0, lon1, lat1, stride) {
    stride = Math.max(1, stride || 1);
    var segs = [];
    var i0 = Math.max(0, Math.floor((lon0 - r.lon0) / r.dlon) - 1);
    var i1 = Math.min(r.nx - 1 - stride, Math.ceil((lon1 - r.lon0) / r.dlon) + 1);
    var j0 = Math.max(0, Math.floor((r.lat1 - lat1) / r.dlat) - 1);
    var j1 = Math.min(r.ny - 1 - stride, Math.ceil((r.lat1 - lat0) / r.dlat) + 1);
    var el = r.elev, nx = r.nx;
    function push(px, py, qx, qy) {
      var a = Geo.project(px, py), b = Geo.project(qx, qy);
      segs.push(a.x, a.y, b.x, b.y);
    }
    function ix(a, b, va, vb) { return a + (b - a) * U.clamp((level - va) / (vb - va), 0, 1); }
    for (var j = j0; j <= j1; j += stride) {
      for (var i = i0; i <= i1; i += stride) {
        var d0 = -el[j * nx + i], d1 = -el[j * nx + i + stride];
        var d2 = -el[(j + stride) * nx + i + stride], d3 = -el[(j + stride) * nx + i];
        var m = (d0 > level ? 1 : 0) | (d1 > level ? 2 : 0) |
                (d2 > level ? 4 : 0) | (d3 > level ? 8 : 0);
        if (m === 0 || m === 15) continue;
        var xa = r.lon0 + i * r.dlon, xb = r.lon0 + (i + stride) * r.dlon;
        var ya = r.lat1 - j * r.dlat, yb = r.lat1 - (j + stride) * r.dlat;
        var Tx = ix(xa, xb, d0, d1), Ry = ix(ya, yb, d1, d2);
        var Bx = ix(xb, xa, d2, d3), Ly = ix(yb, ya, d3, d0);
        switch (m) {
          case 1: case 14: push(xa, Ly, Tx, ya); break;
          case 2: case 13: push(Tx, ya, xb, Ry); break;
          case 3: case 12: push(xa, Ly, xb, Ry); break;
          case 4: case 11: push(xb, Ry, Bx, yb); break;
          case 6: case 9:  push(Tx, ya, Bx, yb); break;
          case 7: case 8:  push(xa, Ly, Bx, yb); break;
          case 5:  push(xa, Ly, Tx, ya); push(xb, Ry, Bx, yb); break;
          case 10: push(Tx, ya, xb, Ry); push(xa, Ly, Bx, yb); break;
        }
      }
    }
    return new Float32Array(segs);
  };

  /* ---------------- passages ---------------- */
  W.clearWater = function (ax, ay, bx, by, minDepth) {
    var n = Math.ceil(U.len(bx - ax, by - ay) / 800);
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      if (W.getChartedDepth(ax + (bx - ax) * t, ay + (by - ay) * t) < minDepth) return false;
    }
    return true;
  };
  W.routeTable = null;
  W.passageDistance = function (a, b) {
    var t = W.routeTable;
    if (t && t[a.id] && isFinite(t[a.id][b.id])) return t[a.id][b.id];
    return U.len(b.x - a.x, b.y - a.y) * 1.25;
  };

})(window.SCS);
