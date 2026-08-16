/* render.js — the top-down world view.  (SDD §40)
   Stylised sea, honest geography: everything drawn here comes from the same
   bathymetry and environment data the simulation uses. */
(function (S) {
  'use strict';
  var U = S.U, W = S.World, E = S.Env;
  var R = S.Render = {};

  var cv, ctx, dpr = 1, cw = 0, ch = 0;
  var depthTide = -99;
  var wake = [];
  var markBuf = [];

  R.cam = { x: 0, y: 900000, scale: 0.30, minScale: 0.0008, maxScale: 2.5 };

  R.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    R.resize();
  };

  R.resize = function () {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = cv.clientWidth; ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  };
  R.size = function () { return { w: cw, h: ch }; };

  /* ---------- seabed shading ----------
     The national raster is resampled once into projected space, so it can be
     blitted like any other image. A cruising region is small enough that the
     projection over it is very nearly affine, so those are drawn with a
     transform instead of being resampled. */
  function depthColour(d) {
    var r, g, b;
    if (d <= -0.02) {
      var h = U.clamp(-d / 90, 0, 1), s2 = U.clamp(-d / 6, 0, 1);
      r = 96 + s2 * 24 - h * 46; g = 104 + s2 * 20 - h * 34; b = 74 + s2 * 10 - h * 30;
    }
    else if (d < 0.4) { r = 138; g = 150; b = 128; }
    else if (d < 1.2) { var t = (d - 0.4) / 0.8; r = 96 - t * 30; g = 156 - t * 8; b = 152 + t * 12; }
    else if (d < 3) { var t2 = (d - 1.2) / 1.8; r = 66 - t2 * 20; g = 148 - t2 * 22; b = 164 + t2 * 4; }
    else if (d < 7) { var t3 = (d - 3) / 4; r = 46 - t3 * 18; g = 126 - t3 * 32; b = 168 - t3 * 12; }
    else if (d < 14) { var t4 = (d - 7) / 7; r = 28 - t4 * 10; g = 94 - t4 * 28; b = 156 - t4 * 26; }
    else { var t5 = U.clamp((d - 14) / 40, 0, 1); r = 18 - t5 * 8; g = 66 - t5 * 26; b = 130 - t5 * 44; }
    return [r, g, b];
  }

  var natCv = null, natBox = null, natTide = -99;
  function buildNational(tide) {
    var b = W.bounds();
    var px = 900, py = Math.round(px * b.h / b.w);
    if (!natCv) { natCv = document.createElement('canvas'); natCv.width = px; natCv.height = py; }
    var cx = natCv.getContext('2d');
    var img = cx.createImageData(px, py), o = img.data;
    for (var j = 0; j < py; j++) {
      var wy = b.y0 + b.h * (j + 0.5) / py;
      for (var i = 0; i < px; i++) {
        var wx = b.x0 + b.w * (i + 0.5) / px;
        var c = depthColour(W.getChartedDepth(wx, wy) + tide);
        var k = (j * px + i) * 4;
        o[k] = c[0]; o[k + 1] = c[1]; o[k + 2] = c[2]; o[k + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    natBox = b; natTide = tide;
  }

  var regCache = {};
  function regionCanvas(r, tide) {
    var e = regCache[r.id];
    if (e && Math.abs(e.tide - tide) < 0.25) return e;
    var cv2 = (e && e.cv) || document.createElement('canvas');
    cv2.width = r.nx; cv2.height = r.ny;
    var cx = cv2.getContext('2d');
    var img = cx.createImageData(r.nx, r.ny), o = img.data;
    for (var j = 0; j < r.ny; j++) {
      var lat = r.lat1 - j * r.dlat;
      for (var i = 0; i < r.nx; i++) {
        var lon = r.lon0 + i * r.dlon;
        var c = depthColour(W.depthAtGeo(lon, lat) + tide);
        var k = (j * r.nx + i) * 4;
        o[k] = c[0]; o[k + 1] = c[1]; o[k + 2] = c[2]; o[k + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    /* affine that maps raster pixels to projected metres, from three corners */
    var p00 = U.rad ? null : null;
    var A = S.Geo.project(r.lon0, r.lat1);
    var B = S.Geo.project(r.lon1, r.lat1);
    var C = S.Geo.project(r.lon0, r.lat0);
    var m = { a: (B.x - A.x) / r.nx, b: (B.y - A.y) / r.nx,
              c: (C.x - A.x) / r.ny, d: (C.y - A.y) / r.ny, e: A.x, f: A.y };
    e = regCache[r.id] = { cv: cv2, m: m, tide: tide, r: r };
    return e;
  }
  R.dropRegionCache = function () { regCache = {}; natTide = -99; };

  /* ---------- coastline ---------- */
  var coastCache = {};
  function coastFor(r, lon0, lat0, lon1, lat1, level) {
    var key = r.id + '|' + lon0.toFixed(2) + ',' + lat0.toFixed(2) + ',' +
              lon1.toFixed(2) + ',' + lat1.toFixed(2) + '|' + level.toFixed(1);
    if (coastCache[key]) return coastCache[key];
    var stride = r.id === 'national' ? 1 : Math.max(1, Math.round(240 / r.cell));
    var segs = W.contour(r, level, lon0, lat0, lon1, lat1, stride);
    if (Object.keys(coastCache).length > 40) coastCache = {};
    coastCache[key] = segs;
    return segs;
  }
  R.dropCoastCache = function () { coastCache = {}; };

  /* ---------- transforms ---------- */
  function sx(x) { return (x - R.cam.x) * R.cam.scale + cw / 2; }
  function sy(y) { return (y - R.cam.y) * R.cam.scale + ch / 2; }
  R.toScreen = function (x, y) { return { x: sx(x), y: sy(y) }; };
  R.toWorld = function (px, py) {
    return { x: (px - cw / 2) / R.cam.scale + R.cam.x, y: (py - ch / 2) / R.cam.scale + R.cam.y };
  };

  /* ---------- land ---------- */
  function pathPoly(pts) {
    ctx.beginPath();
    ctx.moveTo(sx(pts[0][0]), sy(pts[0][1]));
    for (var i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i][0]), sy(pts[i][1]));
    ctx.closePath();
  }

  function drawCoast(t, tide) {
    var g0 = S.Geo.unproject(R.cam.x - cw / 2 / R.cam.scale, R.cam.y - ch / 2 / R.cam.scale);
    var g1 = S.Geo.unproject(R.cam.x + cw / 2 / R.cam.scale, R.cam.y + ch / 2 / R.cam.scale);
    var lon0 = Math.min(g0.lon, g1.lon) - 0.02, lon1 = Math.max(g0.lon, g1.lon) + 0.02;
    var lat0 = Math.min(g0.lat, g1.lat) - 0.02, lat1 = Math.max(g0.lat, g1.lat) + 0.02;
    var r = W.rasterAt((lon0 + lon1) / 2, (lat0 + lat1) / 2);
    if (!r) return;
    /* the shoreline is where the water runs out, so it moves with the tide */
    var z0 = W.chartDatumOffset((lon0 + lon1) / 2, (lat0 + lat1) / 2);
    var segs = coastFor(r, lon0, lat0, lon1, lat1, Math.round((z0 - tide) * 2) / 2);
    if (!segs.length) return;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(226,244,248,' + (0.34 + 0.16 * Math.sin(t * 1.4)) + ')';
    ctx.lineWidth = Math.max(1.5, 8 * R.cam.scale);
    ctx.beginPath();
    for (var i = 0; i < segs.length; i += 4) {
      ctx.moveTo(sx(segs[i]), sy(segs[i + 1]));
      ctx.lineTo(sx(segs[i + 2]), sy(segs[i + 3]));
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(28,40,30,.65)';
    ctx.lineWidth = Math.max(1, 2.2 * R.cam.scale);
    ctx.stroke();
  }

  /* ---------- sea surface ---------- */
  function drawWaves(t, hs, windDir) {
    var step = U.clamp(46 / R.cam.scale, 60, 900);
    var x0 = Math.floor((R.cam.x - cw / 2 / R.cam.scale) / step) * step;
    var y0 = Math.floor((R.cam.y - ch / 2 / R.cam.scale) / step) * step;
    var nx = Math.ceil(cw / R.cam.scale / step) + 2, ny = Math.ceil(ch / R.cam.scale / step) + 2;
    var v = U.hvec(windDir + Math.PI);      // waves travel downwind
    var amp = U.clamp(hs / 1.4, 0.08, 1);
    var len = Math.max(5, 26 * R.cam.scale * (0.6 + amp));
    ctx.lineCap = 'round';
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        var wx = x0 + i * step, wy = y0 + j * step;
        var h = U.hash2(i + (x0 / step | 0), j + (y0 / step | 0), 7);
        var drift = (t * (2.2 + hs * 1.8) + h * 90) % 260;
        var px = sx(wx + v.x * drift + h * step * 0.7), py = sy(wy + v.y * drift + h * step * 0.6);
        if (px < -30 || py < -30 || px > cw + 30 || py > ch + 30) continue;
        var ph = Math.sin(t * 2.4 + h * 6.28);
        if (ph < -0.1) continue;
        ctx.strokeStyle = 'rgba(215,240,248,' + (0.05 + 0.22 * amp * ph) + ')';
        ctx.lineWidth = Math.max(0.8, 1.6 * R.cam.scale * 3);
        var ang = Math.atan2(v.y, v.x) + Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(ang) * len / 2, py - Math.sin(ang) * len / 2);
        ctx.lineTo(px + Math.cos(ang) * len / 2, py + Math.sin(ang) * len / 2);
        ctx.stroke();
      }
    }
  }

  /* ---------- tidal stream arrows ---------- */
  function drawStream(t) {
    var step = U.clamp(90 / R.cam.scale, 200, 1400);
    var x0 = Math.floor((R.cam.x - cw / 2 / R.cam.scale) / step) * step;
    var y0 = Math.floor((R.cam.y - ch / 2 / R.cam.scale) / step) * step;
    var nx = Math.ceil(cw / R.cam.scale / step) + 2, ny = Math.ceil(ch / R.cam.scale / step) + 2;
    ctx.lineWidth = 1.4;
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      var wx = x0 + i * step, wy = y0 + j * step;
      var c = E.current(wx, wy), sp = U.len(c.x, c.y);
      if (sp < 0.05) continue;
      var ph = ((t * 0.35 + U.hash2(i, j, 3)) % 1);
      var px = sx(wx + c.x * 220 * ph), py = sy(wy + c.y * 220 * ph);
      var l = Math.min(40, 8 + sp * 34);
      var a = Math.atan2(c.y, c.x);
      ctx.strokeStyle = 'rgba(120,235,255,' + (0.42 * Math.sin(ph * Math.PI)) + ')';
      ctx.beginPath();
      ctx.moveTo(px - Math.cos(a) * l / 2, py - Math.sin(a) * l / 2);
      ctx.lineTo(px + Math.cos(a) * l / 2, py + Math.sin(a) * l / 2);
      ctx.stroke();
    }
  }

  /* ---------- navigation marks ---------- */
  var MARK_COL = {
    port: '#d0342c', stbd: '#25a35a', safe: '#d8443c', danger: '#111',
    north: '#111', south: '#111', east: '#111', west: '#111', light: '#e8e2d0', tower: '#e8e2d0'
  };
  var KIND = { L: 'lat', l: 'lat', C: 'card', c: 'card', W: 'safe', w: 'safe',
               D: 'danger', d: 'danger', M: 'light', m: 'light', V: 'light', K: 'light' };
  function drawMark(m, t, night) {
    var px = sx(m.x), py = sy(m.y);
    if (px < -40 || py < -40 || px > cw + 40 || py > ch + 40) return;
    var s = U.clamp(R.cam.scale * 30, 6, 18);
    ctx.save(); ctx.translate(px, py);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    var kind = KIND[m.t] || 'lat';
    if (kind === 'light') {
      ctx.fillStyle = '#efe8d4';
      ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.6); ctx.lineTo(-s * 0.28, -s);
      ctx.lineTo(s * 0.28, -s); ctx.lineTo(s * 0.45, s * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b83c2c';
      ctx.fillRect(-s * 0.36, -s * 0.45, s * 0.72, s * 0.38);
    } else if (kind === 'danger') {
      ctx.fillStyle = '#141414';
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.5, s * 0.5); ctx.lineTo(-s * 0.5, s * 0.5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c0392b'; ctx.fillRect(-s * 0.34, -s * 0.15, s * 0.68, s * 0.3);
    } else if (kind === 'card') {
      ctx.fillStyle = '#f0c419';
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.46, s * 0.55); ctx.lineTo(-s * 0.46, s * 0.55); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#141414';
      if (m.cat === 'n') ctx.fillRect(-s * 0.4, -s, s * 0.8, s * 0.75);
      else if (m.cat === 'S') ctx.fillRect(-s * 0.44, -s * 0.1, s * 0.88, s * 0.65);
      else if (m.cat === 'e') { ctx.fillRect(-s * 0.42, -s * 0.9, s * 0.84, s * 0.42); ctx.fillRect(-s * 0.44, s * 0.15, s * 0.88, s * 0.4); }
      else ctx.fillRect(-s * 0.43, -s * 0.42, s * 0.86, s * 0.62);
    } else if (kind === 'lat' && m.cat === 'p') {
      ctx.fillStyle = MARK_COL.port;
      ctx.beginPath(); ctx.rect(-s * 0.42, -s * 0.75, s * 0.84, s * 1.35); ctx.fill(); ctx.stroke();
    } else if (kind === 'lat' && m.cat === 's') {
      ctx.fillStyle = MARK_COL.stbd;
      ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.lineTo(s * 0.46, s * 0.6); ctx.lineTo(-s * 0.46, s * 0.6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {  /* safe water */
      ctx.fillStyle = '#d8443c';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, U.TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.22;
      ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.14); ctx.lineTo(s * 0.6, -s * 0.14); ctx.stroke();
    }
    /* light characteristic at night */
    if (night > 0.35 && m.lt) {
      var per = m.lt.indexOf('LFl') >= 0 ? 10 : m.lt.indexOf('Q') >= 0 ? 1 : 4.5;
      var on = (E.t % per) / per < (per > 6 ? 0.22 : 0.16);
      if (on) {
        var col = m.cat === 'p' ? '#ff5a4a' : m.cat === 's' ? '#54ff8a' : '#fff2b0';
        var g = ctx.createRadialGradient(0, -s * 0.4, 0, 0, -s * 0.4, s * 3.2);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 0.85 * night; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, -s * 0.4, s * 3.2, 0, U.TAU); ctx.fill();
      }
    }
    ctx.restore();
    if (R.cam.scale > 0.35 && m.n) {
      ctx.fillStyle = 'rgba(240,248,252,.72)';
      ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      if (m.n) ctx.fillText(m.n, px, py + s + 11);
    }
  }

  /* ---------- harbours ---------- */
  function drawPort(p) {
    var px = sx(p.x), py = sy(p.y), s = R.cam.scale;
    if (px < -120 || py < -120 || px > cw + 120 || py > ch + 120) return;
    var q = Math.max(7, p.r * 0.55 * s);
    ctx.save(); ctx.translate(px, py);
    ctx.fillStyle = '#7a7259';
    ctx.fillRect(-q, -q * 0.35, q * 2, q * 0.7);
    ctx.strokeStyle = '#3b3a2c'; ctx.lineWidth = 1; ctx.strokeRect(-q, -q * 0.35, q * 2, q * 0.7);
    ctx.fillStyle = '#8e8468';
    for (var i = -1; i <= 1; i++) ctx.fillRect(i * q * 0.65 - q * 0.22, -q * 1.15, q * 0.44, q * 0.75);
    ctx.fillStyle = 'rgba(240,248,252,.9)';
    ctx.font = 'bold 11px ui-rounded,system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(p.name, 0, q * 1.9);
    ctx.restore();
  }

  /* ---------- the boat ---------- */
  /** a sail seen from above: a curved surface with belly, not a flat triangle.
      st is the sail's physics state {luff, stall, backed} — when the boat is
      drawn big enough it grows telltales that read from it. */
  function sailShape(tx, ty, cx, cy, belly, thick, luff, t, st) {
    var dx = cx - tx, dy = cy - ty, len = U.len(dx, dy);
    if (len < 0.5) return;
    var nx = -dy / len, ny = dx / len;            // perpendicular
    var mx = (tx + cx) / 2, my = (ty + cy) / 2;
    var flap = luff > 0.15 ? Math.sin(t * 16) * luff * len * 0.16 : 0;
    var side = belly < 0 ? -1 : 1, mag = Math.abs(belly);
    var b1 = side * (mag + flap), b2 = side * (mag * thick + flap * 0.5);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(mx + nx * b1, my + ny * b1, cx, cy);
    ctx.quadraticCurveTo(mx + nx * b2, my + ny * b2, tx, ty);
    ctx.closePath();
    var g = ctx.createLinearGradient(mx + nx * b2, my + ny * b2, mx + nx * b1, my + ny * b1);
    g.addColorStop(0, luff > 0.4 ? 'rgba(198,206,208,.85)' : '#c9d0d2');
    g.addColorStop(1, luff > 0.4 ? 'rgba(240,242,240,.85)' : '#fdfdfa');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(52,64,70,.85)'; ctx.lineWidth = Math.max(0.9, len * 0.022);
    ctx.stroke();

    /* telltales: red to windward, green to leeward, on the drawn surface.
       Windward lifts and spins when she luffs; leeward droops when stalled. */
    if (st && len > 30) {
      var cpx = mx + nx * b1, cpy = my + ny * b1;
      var stalled = st.stall > 0.55 && !st.backed && luff < 0.2;
      var ln = len * 0.085, lw = Math.max(0.8, len * 0.013);
      for (var k = 0; k < 2; k++) {
        var u = k === 0 ? 0.38 : 0.72, iu = 1 - u;
        var px = iu * iu * tx + 2 * u * iu * cpx + u * u * cx;
        var py = iu * iu * ty + 2 * u * iu * cpy + u * u * cy;
        var tvx = iu * (cpx - tx) + u * (cx - cpx);          // tangent, luff -> leech
        var tvy = iu * (cpy - ty) + u * (cy - cpy);
        var tl = U.len(tvx, tvy) || 1; tvx /= tl; tvy /= tl;
        var qx = -tvy, qy = tvx;                             // curve normal
        var out = (qx * nx + qy * ny) * side >= 0 ? 1 : -1;  // towards the belly (leeward)
        var flick = luff > 0.12 ? Math.sin(t * 15 + k * 2.1) * (0.7 + luff) : 0;
        ctx.lineWidth = lw;
        ctx.beginPath();                                      // windward, red
        var wx = px - qx * out * len * 0.02, wy = py - qy * out * len * 0.02;
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + (tvx - qx * out * flick) * ln, wy + (tvy - qy * out * flick) * ln);
        ctx.strokeStyle = 'rgba(226,74,64,.95)'; ctx.stroke();
        ctx.beginPath();                                      // leeward, green
        var gx = px + qx * out * len * 0.02, gy = py + qy * out * len * 0.02;
        var droop = stalled ? 0.85 + 0.35 * Math.sin(t * 6 + k) : 0;
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + (tvx * (1 - droop) + qx * out * droop) * ln,
                   gy + (tvy * (1 - droop) + qy * out * droop) * ln);
        ctx.strokeStyle = 'rgba(88,204,106,.95)'; ctx.stroke();
      }
    }
  }

  function drawBoat(v, t) {
    var px = sx(v.x), py = sy(v.y);
    var loaPx = Math.max(46, v.spec.loa_m * R.cam.scale);
    var k = loaPx / v.spec.loa_m;                 // px per metre for the boat symbol
    var L = v.spec.loa_m * k, B = v.spec.beam_m * k;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(v.hdg);                            // +y is now astern
    drawBoatLocal(v, t, L, B);
    ctx.restore();
  }

  /** hull, sails, rudder and burgee in the boat's own frame (+y astern).
      Used at world scale by drawBoat, and magnified by the sail inset. */
  function drawBoatLocal(v, t, L, B) {
    var heel = v.heel + v.roll;
    var mastY = -L * 0.08;

    /* heel: the deck foreshortens and the hull leans to leeward */
    var hs = Math.cos(heel);
    ctx.save();
    ctx.translate(Math.sin(heel) * B * 0.22, 0);
    ctx.scale(hs * 0.4 + 0.6, 1);

    /* hull */
    ctx.beginPath();
    ctx.moveTo(0, -L * 0.5);
    ctx.bezierCurveTo(B * 0.46, -L * 0.26, B * 0.52, L * 0.14, B * 0.40, L * 0.45);
    ctx.lineTo(-B * 0.40, L * 0.45);
    ctx.bezierCurveTo(-B * 0.52, L * 0.14, -B * 0.46, -L * 0.26, 0, -L * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#efe9da'; ctx.fill();
    ctx.lineWidth = Math.max(1, L * 0.022); ctx.strokeStyle = '#22333b'; ctx.stroke();

    /* sheer line and deck */
    ctx.beginPath();
    ctx.moveTo(0, -L * 0.43);
    ctx.bezierCurveTo(B * 0.30, -L * 0.20, B * 0.33, L * 0.10, B * 0.25, L * 0.35);
    ctx.lineTo(-B * 0.25, L * 0.35);
    ctx.bezierCurveTo(-B * 0.33, L * 0.10, -B * 0.30, -L * 0.20, 0, -L * 0.43);
    ctx.closePath();
    ctx.fillStyle = '#c3b696'; ctx.fill();

    /* coachroof */
    ctx.beginPath();
    ctx.ellipse(0, L * 0.02, B * 0.21, L * 0.17, 0, 0, U.TAU);
    ctx.fillStyle = '#e6dcc6'; ctx.fill();
    ctx.strokeStyle = '#5b6168'; ctx.lineWidth = Math.max(0.7, L * 0.012); ctx.stroke();
    /* cockpit */
    ctx.beginPath();
    ctx.ellipse(0, L * 0.30, B * 0.19, L * 0.10, 0, 0, U.TAU);
    ctx.fillStyle = '#42525a'; ctx.fill();

    /* sails — drawn where the boom actually is, not where the sheet is set.
       The cloth bellies to the low-pressure side the physics computed, so a
       drawing sail bellies to leeward and a backed one bellies inboard. */
    var area = v.sailArea();
    var sst = v.sailState;
    if (area.jib > 0.05) {
      var js = U.rad(v.jibAngle);
      var jSgn = sst ? sst.jib.sgn : ((Math.sin(U.rad(v.jibAngle + v.awa)) >= 0) ? 1 : -1);
      var jl = L * 0.40 * (0.45 + 0.55 * v.jibOut);
      var jcx = Math.sin(js) * jl, jcy = -L * 0.44 + Math.cos(js) * jl;
      sailShape(0, -L * 0.48, jcx, jcy, jSgn * jl * 0.46, 0.30, v.luffJib, t, sst && sst.jib);
    }
    if (area.main > 0.05) {
      var ms = U.rad(v.boomAngle);
      var mSgn = sst ? sst.main.sgn : ((Math.sin(U.rad(v.boomAngle + v.awa)) >= 0) ? 1 : -1);
      var boom = L * 0.46 * (1 - 0.15 * v.mainReef);
      var mcx = Math.sin(ms) * boom, mcy = mastY + Math.cos(ms) * boom;
      /* boom */
      ctx.beginPath();
      ctx.moveTo(0, mastY); ctx.lineTo(mcx, mcy);
      ctx.strokeStyle = '#585d5a'; ctx.lineWidth = Math.max(1.2, L * 0.024);
      ctx.lineCap = 'round'; ctx.stroke();
      sailShape(0, mastY, mcx, mcy, mSgn * boom * 0.50, 0.28, v.luffMain, t, sst && sst.main);
    }
    /* mast */
    ctx.beginPath(); ctx.arc(0, mastY, Math.max(1.6, L * 0.026), 0, U.TAU);
    ctx.fillStyle = '#aeb4b8'; ctx.fill();
    ctx.strokeStyle = '#5b6168'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    /* rudder — helm to starboard cocks the blade's trailing edge to starboard */
    ctx.save();
    ctx.translate(0, L * 0.45);
    ctx.rotate(-U.rad(v.rudder));
    ctx.fillStyle = '#2f3d45';
    ctx.fillRect(-L * 0.014, 0, L * 0.028, L * 0.11);
    ctx.restore();

    /* masthead burgee — a pennant streams away downwind */
    ctx.save();
    ctx.translate(0, mastY);
    ctx.rotate(U.rad(v.awa));
    ctx.fillStyle = '#f2b134';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-L * 0.045, L * 0.17); ctx.lineTo(L * 0.045, L * 0.17);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** day-charter bays: the circle the guests want to swing in (world view) */
  function drawTourBays() {
    var p = S.Game && S.Game.player;
    if (!p || !p.contracts || !p.contracts.length) return;
    p.contracts.forEach(function (c) {
      if (!c.tour) return;
      var tx = sx(c.tour.x), ty = sy(c.tour.y), tr = c.tour.r * R.cam.scale;
      if (tx < -tr || ty < -tr || tx > cw + tr || ty > ch + tr) return;
      ctx.strokeStyle = c.tour.done ? 'rgba(99,212,113,.5)' : 'rgba(200,110,200,.55)';
      ctx.setLineDash([9, 7]); ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(tx, ty, Math.max(8, tr), 0, U.TAU); ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  /** a magnified live view of your own rig — the boat is small on screen,
      the trim should not be (§15 visible feedback) */
  function drawSailInset(v, t) {
    var area = v.sailArea();
    if (area.total <= 0.05) return;
    var box = Math.min(132, Math.max(104, cw * 0.14));
    var x0 = 8, y0 = 46;
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, box, box, 10);
    else ctx.rect(x0, y0, box, box);
    ctx.fillStyle = 'rgba(7,22,29,.72)'; ctx.fill();
    ctx.strokeStyle = '#1b3c4c'; ctx.lineWidth = 1; ctx.stroke();
    ctx.clip();
    /* the boat, heading-up, filling the box */
    ctx.save();
    ctx.translate(x0 + box / 2, y0 + box / 2 + box * 0.04);
    var L = box * 0.74, B = L * (v.spec.beam_m / v.spec.loa_m);
    drawBoatLocal(v, t, L, B);
    ctx.restore();
    /* the apparent wind, blowing in from the rim */
    var aw = U.rad(v.awa);
    ctx.save();
    ctx.translate(x0 + box / 2, y0 + box / 2);
    ctx.rotate(aw);
    ctx.fillStyle = '#f2b134';
    ctx.beginPath();
    ctx.moveTo(0, -box * 0.34);
    ctx.lineTo(-5, -box * 0.34 - 10);
    ctx.lineTo(5, -box * 0.34 - 10);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = '#6c93a6'; ctx.font = '8px ui-monospace,Menlo,monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('RIG', x0 + 7, y0 + 5);
  }

  /* anchor, chain and the circle she can swing through */
  function drawGroundTackle(v) {
    var a = v.anchor;
    if (!a.down) return;
    var ax = sx(a.x), ay = sy(a.y), bx = sx(v.x), by = sy(v.y);
    var rad = Math.sqrt(Math.max(0, a.veer * a.veer - a.depth * a.depth)) * R.cam.scale;
    ctx.strokeStyle = a.dragging > 0.3 ? 'rgba(255,90,80,.5)' : 'rgba(120,235,255,.32)';
    ctx.setLineDash([6, 6]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(ax, ay, rad, 0, U.TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = a.tension > 10 ? 'rgba(230,240,245,.85)' : 'rgba(200,220,230,.45)';
    ctx.lineWidth = Math.max(1.2, 2 * R.cam.scale * 3);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke();
    var s = Math.max(6, 12 * R.cam.scale * 2);
    ctx.strokeStyle = a.dragging > 0.3 ? '#ff6a5a' : '#cfd8dc';
    ctx.lineWidth = Math.max(1.4, s * 0.16);
    ctx.beginPath();
    ctx.moveTo(ax, ay - s * 0.8); ctx.lineTo(ax, ay + s * 0.7);
    ctx.moveTo(ax - s * 0.45, ay - s * 0.4); ctx.lineTo(ax + s * 0.45, ay - s * 0.4);
    ctx.moveTo(ax - s * 0.6, ay + s * 0.2);
    ctx.quadraticCurveTo(ax, ay + s * 1.1, ax + s * 0.6, ay + s * 0.2);
    ctx.stroke();
  }

  function drawWake(v, t) {
    if (wake.length < 2) return;
    ctx.lineCap = 'round';
    for (var i = 1; i < wake.length; i++) {
      var a = wake[i - 1], b = wake[i];
      var age = 1 - i / wake.length;
      ctx.strokeStyle = 'rgba(226,244,250,' + (0.30 * age * Math.min(1, v.stw / 1.6)) + ')';
      ctx.lineWidth = U.clamp(v.spec.beam_m * R.cam.scale * 0.45, 1.5, 14) * (0.35 + 0.65 * age);
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
    }
  }

  /* ---------- weather overlays ---------- */
  function drawWeather(t, wx, night, bx, by) {
    if (night > 0.02) {
      ctx.fillStyle = 'rgba(6,16,40,' + (0.62 * night) + ')';
      ctx.fillRect(0, 0, cw, ch);
    }
    if (wx.rain > 0.06) {
      ctx.strokeStyle = 'rgba(190,215,235,' + (0.18 * wx.rain) + ')';
      ctx.lineWidth = 1;
      var n = Math.round(wx.rain * 260);
      var wind = U.hvec(E.regionalWind().dir + Math.PI);
      for (var i = 0; i < n; i++) {
        var h = U.hash2(i, 0, 17), h2 = U.hash2(i, 1, 17);
        var px = ((h * cw + t * 260 * wind.x) % cw + cw) % cw;
        var py = ((h2 * ch + t * 520) % ch + ch) % ch;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + wind.x * 11, py + 13); ctx.stroke();
      }
    }
    /* visibility: you can see a certain distance, and no further */
    if (wx.visibility < 9000) {
      var r1 = wx.visibility * R.cam.scale, r0 = r1 * 0.45;
      var g2 = ctx.createRadialGradient(bx, by, r0, bx, by, Math.max(r0 + 1, r1));
      var col = night > 0.5 ? '20,30,44' : '198,209,214';
      g2.addColorStop(0, 'rgba(' + col + ',0)');
      g2.addColorStop(0.75, 'rgba(' + col + ',0.55)');
      g2.addColorStop(1, 'rgba(' + col + ',0.94)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  /* ---------- main draw ---------- */
  R.frame = function (v, t, opts) {
    if (!ctx) return;
    opts = opts || {};
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    var tide = E.tideHeight(v.x, v.y);
    if (Math.abs(tide - natTide) > 0.3 || !natCv) buildNational(tide);

    /* national seabed */
    ctx.imageSmoothingEnabled = true;
    var nb = natBox;
    ctx.drawImage(natCv, sx(nb.x0), sy(nb.y0),
                  nb.w * R.cam.scale, nb.h * R.cam.scale);

    /* the cruising region under the boat, in its own detail */
    var reg = W.regionAt(v.x, v.y);
    if (reg && R.cam.scale > 0.004) {
      var rc = regionCanvas(reg, tide), m = rc.m;
      ctx.save();
      ctx.translate(sx(0), sy(0));
      ctx.scale(R.cam.scale, R.cam.scale);
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.drawImage(rc.cv, 0, 0);
      ctx.restore();
    }

    var wind = E.wind(v.x, v.y), wx = E.weather(), night = 1 - E.daylight();
    var sea = v._sea || { hs: 0.3 };
    drawWaves(t, sea.hs, wind.dir);
    if (opts.showStream) drawStream(t);
    drawCoast(t, tide);

    var vx0 = R.cam.x - cw / 2 / R.cam.scale, vx1 = R.cam.x + cw / 2 / R.cam.scale;
    var vy0 = R.cam.y - ch / 2 / R.cam.scale, vy1 = R.cam.y + ch / 2 / R.cam.scale;
    var pl = W.portsWithin((vx0 + vx1) / 2, (vy0 + vy1) / 2,
                           U.len(vx1 - vx0, vy1 - vy0) / 2 + 4000);
    for (var i = 0; i < pl.length; i++) drawPort(pl[i]);
    if (R.cam.scale > 0.02) {
      W.marksIn(vx0, vy0, vx1, vy1, markBuf);
      for (var j = 0; j < markBuf.length && j < 400; j++) drawMark(markBuf[j], t, night);
    }

    /* the player's own waypoint, if set on the chart */
    if (opts.waypoint) {
      var wpx = sx(opts.waypoint.x), wpy = sy(opts.waypoint.y);
      ctx.strokeStyle = '#f2b134'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(wpx, wpy, 10, 0, U.TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wpx - 15, wpy); ctx.lineTo(wpx + 15, wpy);
      ctx.moveTo(wpx, wpy - 15); ctx.lineTo(wpx, wpy + 15); ctx.stroke();
    }

    /* your other boats, wherever they are (§37) */
    if (opts.fleet) for (var fi = 0; fi < opts.fleet.length; fi++) {
      var other = opts.fleet[fi];
      if (other === v) continue;
      var ox = sx(other.x), oy = sy(other.y);
      if (ox < -60 || oy < -60 || ox > cw + 60 || oy > ch + 60) continue;
      ctx.globalAlpha = 0.85; drawBoat(other, t); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(240,248,252,.75)';
      ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      ctx.fillText(other.spec.name, ox, oy + 34);
    }

    drawTourBays();
    drawGroundTackle(v);
    drawWake(v, t);
    drawBoat(v, t);

    /* shallow-water halo */
    if (v.ukc < 1.2) {
      var bad = v.ukc <= 0;
      ctx.strokeStyle = bad ? 'rgba(255,70,70,.85)' : 'rgba(240,180,40,' + (0.35 + 0.3 * Math.sin(t * 7)) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(sx(v.x), sy(v.y), Math.max(26, v.spec.loa_m * R.cam.scale * 1.4), 0, U.TAU);
      ctx.stroke();
    }

    drawWeather(t, wx, night, sx(v.x), sy(v.y));
    drawSailInset(v, t);
  };

  R.pushWake = function (v) {
    wake.push({ x: v.x, y: v.y });
    if (wake.length > 70) wake.shift();
  };
  R.clearWake = function () { wake.length = 0; };

  R.follow = function (v, dt) {
    /* look ahead in the direction of travel */
    var lead = Math.min(1, v.sog / 3) * 90 / R.cam.scale;
    var f = U.hvec(v.hdg);
    var tx = v.x + f.x * lead, ty = v.y + f.y * lead;
    var k = Math.min(1, dt * 2.6);
    R.cam.x += (tx - R.cam.x) * k; R.cam.y += (ty - R.cam.y) * k;
  };
  R.zoom = function (mult, cx, cy) {
    var before = R.toWorld(cx, cy);
    R.cam.scale = U.clamp(R.cam.scale * mult, R.cam.minScale, R.cam.maxScale);
    var after = R.toWorld(cx, cy);
    R.cam.x += before.x - after.x; R.cam.y += before.y - after.y;
  };

})(window.SCS);
