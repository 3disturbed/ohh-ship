/* chart.js — the nautical chart.  (SDD §29, §44)
   A working instrument, not a minimap: soundings, contours, drying heights,
   buoyage, tidal stream, range and bearing, waypoints. */
(function (S) {
  'use strict';
  var U = S.U, W = S.World, E = S.Env;
  var C = S.Chart = {};

  var cv, ctx, dpr = 1, cw = 0, ch = 0;
  var base = null;                     // pre-rendered static chart
  var BASE_PPM = 0.1;                  // 10 metres per pixel on the base image

  C.cam = { x: 8000, y: 6000, scale: 0.06 };
  C.mode = 'inspect';                  // inspect | measure | waypoint
  C.follow = true;
  C.showStream = false;
  C.measure = [];
  C.wp = function () { var v = S.Game && S.Game.vessel; return v ? v.waypoint : null; };
  C.info = null;

  var PAPER = '#f3ead6';
  var BANDS = [
    { d: 0,   c: [201, 222, 191] },    // drying
    { d: 0.01,c: [138, 190, 214] },
    { d: 2,   c: [168, 208, 227] },
    { d: 5,   c: [206, 227, 236] },
    { d: 10,  c: [230, 236, 231] },
    { d: 20,  c: [243, 234, 214] }
  ];
  function bandColour(d) {
    if (d < 0) return BANDS[0].c;
    for (var i = BANDS.length - 1; i >= 1; i--) if (d >= BANDS[i].d) return BANDS[i].c;
    return BANDS[1].c;
  }

  C.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    C.buildBase();
    C.resize();
  };

  C.resize = function () {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = cv.clientWidth; ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  };

  /* ---------- static layers, rendered once ---------- */
  C.buildBase = function () {
    var bw = Math.round(W.WIDTH * BASE_PPM), bh = Math.round(W.HEIGHT * BASE_PPM);
    base = document.createElement('canvas');
    base.width = bw; base.height = bh;
    var b = base.getContext('2d');

    /* soft depth bands from the grid */
    var small = document.createElement('canvas');
    small.width = W.NX; small.height = W.NY;
    var sctx = small.getContext('2d');
    var img = sctx.createImageData(W.NX, W.NY), d = W.depthArray(), px = img.data;
    for (var i = 0; i < d.length; i++) {
      var c = bandColour(d[i]);
      px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    b.imageSmoothingEnabled = true;
    b.drawImage(small, 0, 0, bw, bh);

    function tx(x) { return x * BASE_PPM; }

    /* depth contours */
    var levels = [{ l: 0, c: '#5f8a53', w: 1.4 }, { l: 2, c: '#4a7f9c', w: 1.1 },
                  { l: 5, c: '#6b9ab2', w: 1.0 }, { l: 10, c: '#8fb3c4', w: 0.9 },
                  { l: 20, c: '#a8bfc9', w: 0.9 }];
    levels.forEach(function (lv) {
      var segs = W.contours[lv.l];
      if (!segs) return;
      b.strokeStyle = lv.c; b.lineWidth = lv.w;
      b.beginPath();
      for (var k = 0; k < segs.length; k += 4) {
        b.moveTo(tx(segs[k]), tx(segs[k + 1]));
        b.lineTo(tx(segs[k + 2]), tx(segs[k + 3]));
      }
      b.stroke();
    });

    /* drying areas: green stipple between the 0 m contour and the coast */
    b.fillStyle = 'rgba(96,142,84,.35)';
    for (var gy = 0; gy < W.NY; gy += 1) {
      for (var gx = 0; gx < W.NX; gx += 1) {
        var dd = d[gy * W.NX + gx];
        if (dd < 0 && dd > -2.2 && ((gx + gy) % 2 === 0)) {
          b.fillRect(tx(gx * W.CELL) - 1, tx(gy * W.CELL) - 1, 1.6, 1.6);
        }
      }
    }

    /* land */
    b.lineJoin = 'round';
    for (var p = 0; p < W.LAND.length; p++) {
      var pts = W.LAND[p].pts;
      b.beginPath(); b.moveTo(tx(pts[0][0]), tx(pts[0][1]));
      for (var q = 1; q < pts.length; q++) b.lineTo(tx(pts[q][0]), tx(pts[q][1]));
      b.closePath();
      b.fillStyle = '#e6d9b8'; b.fill();
      b.strokeStyle = '#7d6a44'; b.lineWidth = 1.6; b.stroke();
    }
    /* land hatching */
    b.save(); b.globalAlpha = 0.16; b.strokeStyle = '#8a744a'; b.lineWidth = 0.7;
    for (var hgy = 0; hgy < W.NY; hgy++) for (var hgx = 0; hgx < W.NX; hgx++) {
      if (d[hgy * W.NX + hgx] < -1.6 && (hgx * 7 + hgy * 3) % 11 === 0) {
        var lx = tx(hgx * W.CELL), ly = tx(hgy * W.CELL);
        b.beginPath(); b.moveTo(lx - 3, ly + 3); b.lineTo(lx + 3, ly - 3); b.stroke();
      }
    }
    b.restore();
  };

  /* ---------- transforms ---------- */
  function sx(x) { return (x - C.cam.x) * C.cam.scale + cw / 2; }
  function sy(y) { return (y - C.cam.y) * C.cam.scale + ch / 2; }
  C.toWorld = function (px, py) {
    return { x: (px - cw / 2) / C.cam.scale + C.cam.x, y: (py - ch / 2) / C.cam.scale + C.cam.y };
  };

  /* ---------- dynamic overlay ---------- */
  function drawSoundings() {
    var spacing = 200;                       // keep soundings legible, not crowded
    while (spacing * C.cam.scale < 52) spacing *= 2;
    var x0 = Math.floor((C.cam.x - cw / 2 / C.cam.scale) / spacing) * spacing;
    var y0 = Math.floor((C.cam.y - ch / 2 / C.cam.scale) / spacing) * spacing;
    var nx = Math.ceil(cw / C.cam.scale / spacing) + 1, ny = Math.ceil(ch / C.cam.scale / spacing) + 1;
    if (nx * ny > 2600) return;
    ctx.font = '9.5px ui-monospace,Menlo,monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var j = 0; j <= ny; j++) for (var i = 0; i <= nx; i++) {
      var wx = x0 + i * spacing, wy = y0 + j * spacing;
      if (wx < 0 || wy < 0 || wx > W.WIDTH || wy > W.HEIGHT) continue;
      if (W.isLand(wx, wy)) continue;
      var d = W.getChartedDepth(wx, wy);
      if (d < -3.5) continue;
      var px = sx(wx), py = sy(wy);
      if (d >= 0) {
        ctx.fillStyle = d < 10 ? '#2e4a5c' : '#7793a3';
        ctx.fillText(d < 10 ? d.toFixed(1) : String(Math.round(d)), px, py);
      } else {
        ctx.fillStyle = '#3f6b39';
        var s = (-d).toFixed(1);
        ctx.fillText(s, px, py);
        ctx.strokeStyle = '#3f6b39'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(px - 7, py + 6); ctx.lineTo(px + 7, py + 6); ctx.stroke();
      }
    }
  }

  var MARKCOL = { port: '#c0392b', stbd: '#1e7f45', safe: '#c0392b', danger: '#1a1a1a',
                  north: '#1a1a1a', south: '#1a1a1a', east: '#1a1a1a', west: '#1a1a1a',
                  light: '#8e44ad', tower: '#6b4a1f' };
  function drawMarks() {
    var showLabels = C.cam.scale > 0.035;
    ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (var i = 0; i < W.MARKS.length; i++) {
      var m = W.MARKS[i], px = sx(m.x), py = sy(m.y);
      if (px < -20 || py < -20 || px > cw + 20 || py > ch + 20) continue;
      ctx.fillStyle = MARKCOL[m.t] || '#333';
      ctx.strokeStyle = '#222'; ctx.lineWidth = 0.7;
      if (m.t === 'light' || m.t === 'tower') {
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, U.TAU); ctx.fill();
        /* light flare */
        ctx.strokeStyle = '#8e44ad'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 9, py - 9);
        ctx.arc(px, py, 12.7, -Math.PI / 4 - 0.35, -Math.PI / 4 + 0.35); ctx.closePath(); ctx.stroke();
      } else if (m.t === 'port') {
        ctx.fillRect(px - 2.4, py - 4.5, 4.8, 9); ctx.strokeRect(px - 2.4, py - 4.5, 4.8, 9);
      } else if (m.t === 'stbd') {
        ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 3, py + 4); ctx.lineTo(px - 3, py + 4);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (m.t === 'safe') {
        ctx.beginPath(); ctx.arc(px, py, 3.2, 0, U.TAU); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(px, py - 5.5); ctx.lineTo(px + 3.4, py + 3); ctx.lineTo(px - 3.4, py + 3);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8b400';
        ctx.fillRect(px - 3, py + 3, 6, 2);
      }
      if (showLabels) {
        ctx.fillStyle = '#33506080';
        ctx.fillText(m.n + (m.lt ? ' ' + m.lt : ''), px + 6, py - 5);
      }
    }
    /* harbours */
    for (var p = 0; p < W.PORTS.length; p++) {
      var pt = W.PORTS[p], qx = sx(pt.x), qy = sy(pt.y);
      ctx.fillStyle = '#8e2f8e';
      ctx.beginPath(); ctx.arc(qx, qy, 4, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#2b1a3a'; ctx.font = 'bold 11px ui-rounded,system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pt.name, qx, qy - 9);
      ctx.textAlign = 'left'; ctx.font = '9px ui-monospace,Menlo,monospace';
    }
  }

  function drawStream() {
    var step = U.clamp(52 / C.cam.scale, 400, 3000);
    for (var wy = step / 2; wy < W.HEIGHT; wy += step) {
      for (var wx = step / 2; wx < W.WIDTH; wx += step) {
        var px = sx(wx), py = sy(wy);
        if (px < -20 || py < -20 || px > cw + 20 || py > ch + 20) continue;
        var c = E.current(wx, wy), sp = U.len(c.x, c.y);
        if (sp < 0.06) continue;
        var a = Math.atan2(c.y, c.x), l = Math.min(46, 12 + sp * 40);
        ctx.strokeStyle = 'rgba(24,90,140,.85)'; ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
        ctx.stroke();
        /* feathers indicate the rate, as on a tidal stream atlas */
        var kn = sp * U.MS2KN, full = Math.floor(kn), half = kn - full >= 0.5;
        var ex = px + Math.cos(a) * l, ey = py + Math.sin(a) * l;
        ctx.beginPath();
        for (var f = 0; f < full; f++) {
          var t = 1 - f * 0.22, bx = px + Math.cos(a) * l * t, by = py + Math.sin(a) * l * t;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a - 2.4) * 7, by + Math.sin(a - 2.4) * 7);
        }
        if (half) {
          var t2 = 1 - full * 0.22, hx = px + Math.cos(a) * l * t2, hy = py + Math.sin(a) * l * t2;
          ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a - 2.4) * 4, hy + Math.sin(a - 2.4) * 4);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(24,90,140,.9)'; ctx.font = '8.5px ui-monospace,Menlo,monospace';
        ctx.fillText(kn.toFixed(1), ex + 3, ey + 3);
      }
    }
  }

  function drawScale() {
    var targets = [0.1, 0.25, 0.5, 1, 2, 5, 10];
    var nm = targets[0];
    for (var i = 0; i < targets.length; i++) { if (targets[i] * U.NM * C.cam.scale < cw * 0.32) nm = targets[i]; }
    var px = nm * U.NM * C.cam.scale;
    var x = 14, y = ch - 74;
    ctx.strokeStyle = '#2e4a5c'; ctx.lineWidth = 1.6; ctx.fillStyle = '#2e4a5c';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + px, y);
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
    ctx.moveTo(x + px, y - 5); ctx.lineTo(x + px, y + 5); ctx.stroke();
    ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left';
    ctx.fillText(nm + ' NM', x + px + 6, y + 4);
    /* compass rose */
    var rx = cw - 46, ry = 92, rr = 26;
    ctx.strokeStyle = '#2e4a5c99'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(rx, ry, rr, 0, U.TAU); ctx.stroke();
    for (var a = 0; a < 360; a += 30) {
      var ar = U.rad(a), i1 = a % 90 === 0 ? rr - 8 : rr - 4;
      ctx.beginPath();
      ctx.moveTo(rx + Math.sin(ar) * i1, ry - Math.cos(ar) * i1);
      ctx.lineTo(rx + Math.sin(ar) * rr, ry - Math.cos(ar) * rr); ctx.stroke();
    }
    ctx.fillStyle = '#b03a2e';
    ctx.beginPath(); ctx.moveTo(rx, ry - rr + 2); ctx.lineTo(rx - 4, ry + 4); ctx.lineTo(rx + 4, ry + 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2e4a5c'; ctx.textAlign = 'center';
    ctx.fillText('N', rx, ry - rr - 5);
  }

  /* ---------- public draw ---------- */
  C.frame = function (v, player) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cw, ch);

    var sc = C.cam.scale / BASE_PPM;
    ctx.imageSmoothingEnabled = C.cam.scale < 0.12;
    ctx.drawImage(base, sx(0), sy(0), base.width * sc, base.height * sc);

    drawSoundings();
    if (C.showStream) drawStream();
    drawMarks();

    /* own ship: exact with a plotter, otherwise the dead-reckoning estimate */
    var known = v.has('plotter') || v.has('gps');
    var ox = known ? v.x : v.dr.x, oy = known ? v.y : v.dr.y;
    var px = sx(ox), py = sy(oy);
    if (known || player.everFixed) {
      ctx.save(); ctx.translate(px, py); ctx.rotate(v.hdg);
      ctx.fillStyle = v.has('plotter') ? '#1a3f8c' : '#8c4a1a';
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(5.5, 8); ctx.lineTo(0, 5); ctx.lineTo(-5.5, 8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      /* course and speed vector: where she will be in six minutes */
      if (v.sog > 0.15) {
        var f = U.hvec(v.cog), d = v.sog * 360 * C.cam.scale;
        ctx.strokeStyle = '#1a3f8c'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + f.x * d, py + f.y * d); ctx.stroke();
        for (var t6 = 1; t6 <= 1; t6++) {
          ctx.beginPath();
          ctx.arc(px + f.x * d, py + f.y * d, 2.4, 0, U.TAU); ctx.fill();
        }
      }
      if (!known) {
        var r = Math.max(6, (140 + v.dr.err * 1.6) * C.cam.scale);
        ctx.strokeStyle = 'rgba(140,74,26,.6)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(px, py, r, 0, U.TAU); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    /* ground tackle and the swinging circle */
    var anc = v.anchor;
    if (anc.down) {
      var ax = sx(anc.x), ay = sy(anc.y);
      var rr = Math.sqrt(Math.max(0, anc.veer * anc.veer - anc.depth * anc.depth)) * C.cam.scale;
      ctx.strokeStyle = 'rgba(40,90,140,.8)'; ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(ax, ay, Math.max(3, rr), 0, U.TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#1a3f8c';
      ctx.beginPath(); ctx.arc(ax, ay, 3, 0, U.TAU); ctx.fill();
    }
    /* the rest of the fleet */
    if (S.Game && S.Game.fleet) S.Game.fleet.forEach(function (b) {
      if (b === v) return;
      var fx = sx(b.x), fy = sy(b.y);
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(b.hdg);
      ctx.fillStyle = '#7a5a1a';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4, 6); ctx.lineTo(0, 4); ctx.lineTo(-4, 6);
      ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#5c4412'; ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      ctx.fillText(b.spec.name, fx, fy + 16);
    });

    /* waypoint and the leg to it */
    var wpt = C.wp();
    if (wpt) {
      var wx = sx(wpt.x), wy = sy(wpt.y);
      ctx.strokeStyle = '#8e2f8e'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(wx, wy, 7, 0, U.TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx - 11, wy); ctx.lineTo(wx + 11, wy);
      ctx.moveTo(wx, wy - 11); ctx.lineTo(wx, wy + 11); ctx.stroke();
      if (known || player.everFixed) {
        ctx.setLineDash([7, 5]); ctx.strokeStyle = 'rgba(142,47,142,.75)';
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(wx, wy); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    /* measuring */
    if (C.measure.length) {
      var a = C.measure[0], ax = sx(a.x), ay = sy(a.y);
      ctx.fillStyle = '#b03a2e';
      ctx.beginPath(); ctx.arc(ax, ay, 3.5, 0, U.TAU); ctx.fill();
      if (C.measure.length > 1) {
        var b2 = C.measure[1], bx = sx(b2.x), by = sy(b2.y);
        ctx.strokeStyle = '#b03a2e'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, U.TAU); ctx.fill();
      }
    }

    drawScale();
  };

  /* ---------- interaction (§44) ---------- */
  C.tap = function (px, py, v) {
    var w = C.toWorld(px, py);
    if (C.mode === 'waypoint') {
      if (S.Game.vessel) S.Game.vessel.waypoint = { x: w.x, y: w.y };
      C.info = null; return;
    }
    if (C.mode === 'measure') {
      if (C.measure.length >= 2) C.measure = [];
      C.measure.push(w);
      C.info = null;
      return;
    }
    /* inspect */
    var d = W.getChartedDepth(w.x, w.y);
    var ti = E.tideInfo(w.x, w.y);
    var nm = W.nearestMark(w.x, w.y), np = W.nearestPort(w.x, w.y);
    C.info = {
      x: w.x, y: w.y, charted: d, tide: ti.height, actual: d + ti.height,
      bottom: W.getBottom(w.x, w.y),
      mark: nm.dist < Math.max(150, 14 / C.cam.scale) ? nm.mark : null,
      port: np.dist < 400 ? np.port : null
    };
  };
  C.measureInfo = function () {
    if (C.measure.length < 2) return null;
    var a = C.measure[0], b = C.measure[1];
    return { dist: U.len(b.x - a.x, b.y - a.y), brg: U.bearingOf(b.x - a.x, b.y - a.y) };
  };
  C.centreOn = function (x, y) { C.cam.x = x; C.cam.y = y; };
  C.zoom = function (mult, cx, cy) {
    var before = C.toWorld(cx, cy);
    C.cam.scale = U.clamp(C.cam.scale * mult, 0.012, 0.42);
    var after = C.toWorld(cx, cy);
    C.cam.x += before.x - after.x; C.cam.y += before.y - after.y;
    C.cam.x = U.clamp(C.cam.x, 0, W.WIDTH); C.cam.y = U.clamp(C.cam.y, 0, W.HEIGHT);
  };
  C.pan = function (dx, dy) {
    C.cam.x = U.clamp(C.cam.x - dx / C.cam.scale, -1000, W.WIDTH + 1000);
    C.cam.y = U.clamp(C.cam.y - dy / C.cam.scale, -1000, W.HEIGHT + 1000);
  };

})(window.SCS);
