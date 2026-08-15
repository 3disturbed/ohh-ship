/* render.js — the top-down world view.  (SDD §40)
   Stylised sea, honest geography: everything drawn here comes from the same
   bathymetry and environment data the simulation uses. */
(function (S) {
  'use strict';
  var U = S.U, W = S.World, E = S.Env;
  var R = S.Render = {};

  var cv, ctx, dpr = 1, cw = 0, ch = 0;
  var depthCv = null, depthCtx = null, depthTide = -99;
  var wake = [];

  R.cam = { x: 2500, y: 2760, scale: 0.30, minScale: 0.10, maxScale: 1.6 };

  R.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    depthCv = document.createElement('canvas');
    depthCv.width = W.NX; depthCv.height = W.NY;
    depthCtx = depthCv.getContext('2d');
    R.resize();
    /* one-off scenery detail so land does not look like flat paint */
    var rng = U.mulberry32(90210);
    R.scenery = [];
    for (var i = 0; i < 900; i++) {
      var x = rng() * W.WIDTH, y = rng() * W.HEIGHT;
      if (W.getChartedDepth(x, y) < -1.2) R.scenery.push({ x: x, y: y, r: 40 + rng() * 220, k: rng() });
    }
  };

  R.resize = function () {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = cv.clientWidth; ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  };
  R.size = function () { return { w: cw, h: ch }; };

  /* ---------- depth shading, rebuilt when the tide has moved ---------- */
  function depthColour(d, out, o) {
    var r, g, b;
    if (d <= -0.02) {                       // above water
      var h = U.clamp(-d / 6, 0, 1);
      r = 108 - h * 34; g = 112 - h * 26; b = 78 - h * 22;
    } else if (d < 0.4) { r = 138; g = 150; b = 128; }
    else if (d < 1.2) { var t = (d - 0.4) / 0.8; r = 96 - t * 30; g = 156 - t * 8; b = 152 + t * 12; }
    else if (d < 3) { var t2 = (d - 1.2) / 1.8; r = 66 - t2 * 20; g = 148 - t2 * 22; b = 164 + t2 * 4; }
    else if (d < 7) { var t3 = (d - 3) / 4; r = 46 - t3 * 18; g = 126 - t3 * 32; b = 168 - t3 * 12; }
    else if (d < 14) { var t4 = (d - 7) / 7; r = 28 - t4 * 10; g = 94 - t4 * 28; b = 156 - t4 * 26; }
    else { var t5 = U.clamp((d - 14) / 16, 0, 1); r = 18 - t5 * 6; g = 66 - t5 * 20; b = 130 - t5 * 34; }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
  }
  function rebuildDepth(tide) {
    var img = depthCtx.createImageData(W.NX, W.NY), d = W.depthArray(), px = img.data;
    for (var i = 0; i < d.length; i++) depthColour(d[i] + tide, px, i * 4);
    depthCtx.putImageData(img, 0, 0);
    depthTide = tide;
  }

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

  function drawLand(t) {
    var i;
    ctx.save();
    ctx.beginPath();
    for (i = 0; i < W.LAND.length; i++) {
      var pts = W.LAND[i].pts;
      ctx.moveTo(sx(pts[0][0]), sy(pts[0][1]));
      for (var q = 1; q < pts.length; q++) ctx.lineTo(sx(pts[q][0]), sy(pts[q][1]));
      ctx.closePath();
    }
    ctx.fillStyle = '#6b6f52'; ctx.fill();
    ctx.clip();                       /* keep fields and hedges ashore */
    ctx.globalAlpha = 0.4;
    for (i = 0; i < R.scenery.length; i++) {
      var s = R.scenery[i], px = sx(s.x), py = sy(s.y), pr = s.r * R.cam.scale;
      if (pr < 1.2 || px < -pr || py < -pr || px > cw + pr || py > ch + pr) continue;
      ctx.fillStyle = s.k > 0.6 ? '#7c8158' : (s.k > 0.3 ? '#5d6246' : '#888c66');
      ctx.beginPath(); ctx.ellipse(px, py, pr, pr * 0.7, s.k * 6, 0, U.TAU); ctx.fill();
    }
    ctx.restore();
    /* surf line */
    var surf = 0.45 + 0.25 * Math.sin(t * 1.4);
    ctx.lineWidth = Math.max(1.5, 9 * R.cam.scale);
    ctx.strokeStyle = 'rgba(226,244,248,' + (0.30 + 0.2 * surf) + ')';
    for (i = 0; i < W.LAND.length; i++) { pathPoly(W.LAND[i].pts); ctx.stroke(); }
    ctx.lineWidth = Math.max(1, 2 * R.cam.scale);
    ctx.strokeStyle = 'rgba(30,42,30,.55)';
    for (i = 0; i < W.LAND.length; i++) { pathPoly(W.LAND[i].pts); ctx.stroke(); }
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
  function drawMark(m, t, night) {
    var px = sx(m.x), py = sy(m.y);
    if (px < -40 || py < -40 || px > cw + 40 || py > ch + 40) return;
    var s = U.clamp(R.cam.scale * 30, 6, 18);
    ctx.save(); ctx.translate(px, py);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    if (m.t === 'light' || m.t === 'tower') {
      ctx.fillStyle = '#efe8d4';
      ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.6); ctx.lineTo(-s * 0.28, -s);
      ctx.lineTo(s * 0.28, -s); ctx.lineTo(s * 0.45, s * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b83c2c';
      ctx.fillRect(-s * 0.36, -s * 0.45, s * 0.72, s * 0.38);
    } else if (m.t === 'danger') {
      ctx.fillStyle = '#141414';
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.5, s * 0.5); ctx.lineTo(-s * 0.5, s * 0.5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c0392b'; ctx.fillRect(-s * 0.34, -s * 0.15, s * 0.68, s * 0.3);
    } else if (m.t === 'north' || m.t === 'south' || m.t === 'east' || m.t === 'west') {
      ctx.fillStyle = '#f0c419';
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.46, s * 0.55); ctx.lineTo(-s * 0.46, s * 0.55); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#141414';
      if (m.t === 'north') ctx.fillRect(-s * 0.4, -s, s * 0.8, s * 0.75);
      else if (m.t === 'south') ctx.fillRect(-s * 0.44, -s * 0.1, s * 0.88, s * 0.65);
      else if (m.t === 'east') { ctx.fillRect(-s * 0.42, -s * 0.9, s * 0.84, s * 0.42); ctx.fillRect(-s * 0.44, s * 0.15, s * 0.88, s * 0.4); }
      else ctx.fillRect(-s * 0.43, -s * 0.42, s * 0.86, s * 0.62);
    } else if (m.t === 'port') {
      ctx.fillStyle = MARK_COL.port;
      ctx.beginPath(); ctx.rect(-s * 0.42, -s * 0.75, s * 0.84, s * 1.35); ctx.fill(); ctx.stroke();
    } else if (m.t === 'stbd') {
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
        var col = m.t === 'port' ? '#ff5a4a' : m.t === 'stbd' ? '#54ff8a' : '#fff2b0';
        var g = ctx.createRadialGradient(0, -s * 0.4, 0, 0, -s * 0.4, s * 3.2);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 0.85 * night; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, -s * 0.4, s * 3.2, 0, U.TAU); ctx.fill();
      }
    }
    ctx.restore();
    if (R.cam.scale > 0.22) {
      ctx.fillStyle = 'rgba(240,248,252,.72)';
      ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      ctx.fillText(m.n, px, py + s + 11);
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
  /** a sail seen from above: a curved surface with belly, not a flat triangle */
  function sailShape(tx, ty, cx, cy, belly, thick, luff, t) {
    var dx = cx - tx, dy = cy - ty, len = U.len(dx, dy);
    if (len < 0.5) return;
    var nx = -dy / len, ny = dx / len;            // perpendicular
    if (nx * belly + ny * belly === 0) { /* keep sign handling explicit below */ }
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
  }

  function drawBoat(v, t) {
    var px = sx(v.x), py = sy(v.y);
    var loaPx = Math.max(46, v.spec.loa_m * R.cam.scale);
    var k = loaPx / v.spec.loa_m;                 // px per metre for the boat symbol
    var L = v.spec.loa_m * k, B = v.spec.beam_m * k;
    var heel = v.heel + v.roll;
    var mastY = -L * 0.08;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(v.hdg);                            // +y is now astern

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

    /* sails — drawn where the boom actually is, not where the sheet is set */
    var area = v.sailArea();
    if (area.jib > 0.05) {
      var js = U.rad(v.jibAngle);
      var jl = L * 0.40 * (0.45 + 0.55 * v.jibOut);
      var jcx = Math.sin(js) * jl, jcy = -L * 0.44 + Math.cos(js) * jl;
      sailShape(0, -L * 0.48, jcx, jcy, (js >= 0 ? 1 : -1) * jl * 0.46, 0.30, v.luffJib, t);
    }
    if (area.main > 0.05) {
      var ms = U.rad(v.boomAngle);
      var boom = L * 0.46 * (1 - 0.15 * v.mainReef);
      var mcx = Math.sin(ms) * boom, mcy = mastY + Math.cos(ms) * boom;
      /* boom */
      ctx.beginPath();
      ctx.moveTo(0, mastY); ctx.lineTo(mcx, mcy);
      ctx.strokeStyle = '#585d5a'; ctx.lineWidth = Math.max(1.2, L * 0.024);
      ctx.lineCap = 'round'; ctx.stroke();
      sailShape(0, mastY, mcx, mcy, (ms >= 0 ? 1 : -1) * boom * 0.50, 0.28, v.luffMain, t);
    }
    /* mast */
    ctx.beginPath(); ctx.arc(0, mastY, Math.max(1.6, L * 0.026), 0, U.TAU);
    ctx.fillStyle = '#aeb4b8'; ctx.fill();
    ctx.strokeStyle = '#5b6168'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    /* rudder */
    ctx.save();
    ctx.translate(0, L * 0.45);
    ctx.rotate(U.rad(v.rudder));
    ctx.fillStyle = '#2f3d45';
    ctx.fillRect(-L * 0.014, 0, L * 0.028, L * 0.11);
    ctx.restore();

    /* masthead burgee — points with the apparent wind */
    ctx.save();
    ctx.translate(0, mastY);
    ctx.rotate(U.rad(v.awa) + Math.PI);
    ctx.fillStyle = '#f2b134';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-L * 0.045, L * 0.17); ctx.lineTo(L * 0.045, L * 0.17);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.restore();
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
    if (Math.abs(tide - depthTide) > 0.12) rebuildDepth(tide);

    /* seabed */
    ctx.imageSmoothingEnabled = true;
    var x0 = sx(-W.CELL / 2), y0 = sy(-W.CELL / 2);
    ctx.drawImage(depthCv, x0, y0, W.WIDTH * R.cam.scale + W.CELL * R.cam.scale,
                  W.HEIGHT * R.cam.scale + W.CELL * R.cam.scale);

    var wind = E.wind(v.x, v.y), wx = E.weather(), night = 1 - E.daylight();
    var sea = v._sea || { hs: 0.3 };
    drawWaves(t, sea.hs, wind.dir);
    if (opts.showStream) drawStream(t);
    drawLand(t);

    for (var i = 0; i < W.PORTS.length; i++) drawPort(W.PORTS[i]);
    for (var j = 0; j < W.MARKS.length; j++) drawMark(W.MARKS[j], t, night);

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
