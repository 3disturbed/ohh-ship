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

  C.cam = { x: 0, y: 900000, scale: 0.0009 };
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
    C.resize();
  };

  C.resize = function () {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = cv.clientWidth; ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  };

  /* ---------- base layers ----------
     There is no pre-rendered base any more: the chart is drawn from the same
     rasters the depths come from, so it works at any scale from the whole
     country down to a harbour entrance. */
  /* Chart convention: deep water is white paper, the shallows step through
     blue, what dries is green, and the land above high water is buff. */
  function bandColour(d, z0) {
    if (d < -z0) {
      var h = U.clamp((-d - z0) / 120, 0, 1);
      return [232 - h * 34, 219 - h * 40, 182 - h * 44];
    }
    if (d < 0) return [201, 222, 191];
    if (d >= 20) return [243, 240, 230];
    if (d >= 10) return [226, 235, 234];
    if (d >= 5) return [201, 225, 235];
    if (d >= 2) return [163, 206, 227];
    return [130, 186, 214];
  }
  var baseCv = null, baseKey = '';
  function buildBase() {
    var px = Math.min(1100, Math.max(360, Math.round(cw)));
    var py = Math.round(px * ch / cw);
    var key = [Math.round(C.cam.x), Math.round(C.cam.y),
               C.cam.scale.toFixed(5), px, py].join(',');
    if (baseKey === key && baseCv) return;
    if (!baseCv) baseCv = document.createElement('canvas');
    baseCv.width = px; baseCv.height = py;
    var x = baseCv.getContext('2d');
    var img = x.createImageData(px, py), o = img.data;
    var wpx = cw / C.cam.scale / px, wpy = ch / C.cam.scale / py;
    var gz = S.Geo.unproject(C.cam.x, C.cam.y);
    var z0 = W.chartDatumOffset(gz.lon, gz.lat);
    var x0 = C.cam.x - cw / 2 / C.cam.scale, y0 = C.cam.y - ch / 2 / C.cam.scale;
    for (var j = 0; j < py; j++) {
      var wy = y0 + (j + 0.5) * wpy;
      for (var i = 0; i < px; i++) {
        var c = bandColour(W.getChartedDepth(x0 + (i + 0.5) * wpx, wy), z0);
        var k = (j * px + i) * 4;
        o[k] = c[0]; o[k + 1] = c[1]; o[k + 2] = c[2]; o[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    baseKey = key;
  }
  C.buildBase = function () { baseKey = ''; };

  function drawContours() {
    var g0 = C.toWorld(0, 0), g1 = C.toWorld(cw, ch);
    var a0 = S.Geo.unproject(g0.x, g0.y), a1 = S.Geo.unproject(g1.x, g1.y);
    var lon0 = Math.min(a0.lon, a1.lon) - 0.02, lon1 = Math.max(a0.lon, a1.lon) + 0.02;
    var lat0 = Math.min(a0.lat, a1.lat) - 0.02, lat1 = Math.max(a0.lat, a1.lat) + 0.02;
    var r = W.rasterAt((lon0 + lon1) / 2, (lat0 + lat1) / 2);
    if (!r) return;
    var z0 = W.chartDatumOffset((lon0 + lon1) / 2, (lat0 + lat1) / 2);
    var span = Math.max(lon1 - lon0, lat1 - lat0);
    var stride = Math.max(1, Math.round(span * 111320 / r.cell / 700));
    var levels = span > 1.2 ? [{ l: 0, c: '#5f8a53', w: 1.3 }]
      : [{ l: 0, c: '#5f8a53', w: 1.3 }, { l: 2, c: '#4a7f9c', w: 1.0 },
         { l: 5, c: '#6b9ab2', w: 0.9 }, { l: 10, c: '#8fb3c4', w: 0.8 },
         { l: 20, c: '#a8bfc9', w: 0.8 }];
    levels.forEach(function (lv) {
      var segs = W.contour(r, lv.l + z0, lon0, lat0, lon1, lat1, stride);
      if (!segs.length) return;
      ctx.strokeStyle = lv.c; ctx.lineWidth = lv.w;
      ctx.beginPath();
      for (var k = 0; k < segs.length; k += 4) {
        ctx.moveTo(sx(segs[k]), sy(segs[k + 1]));
        ctx.lineTo(sx(segs[k + 2]), sy(segs[k + 3]));
      }
      ctx.stroke();
    });
  }

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
      
      var d = W.getChartedDepth(wx, wy);
      if (d < -3.0 || d > 300) continue;
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
  var buf = [];
  function drawMarks() {
    var showLabels = C.cam.scale > 0.05;
    ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var g0 = C.toWorld(0, 0), g1 = C.toWorld(cw, ch);
    W.marksIn(g0.x, g0.y, g1.x, g1.y, buf);
    if (buf.length > 900) buf.length = 900;
    for (var i = 0; i < buf.length; i++) {
      var m = buf[i], px = sx(m.x), py = sy(m.y);
      if (px < -20 || py < -20 || px > cw + 20 || py > ch + 20) continue;
      var kind = m.t;
      ctx.fillStyle = kind === 'L' || kind === 'l' ? (m.cat === 'p' ? '#c0392b' : '#1e7f45')
                    : kind === 'M' || kind === 'm' ? '#8e44ad' : '#1a1a1a';
      ctx.strokeStyle = '#222'; ctx.lineWidth = 0.7;
      if (kind === 'M' || kind === 'm' || kind === 'V' || kind === 'K') {
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, U.TAU); ctx.fill();
        /* light flare */
        ctx.strokeStyle = '#8e44ad'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 9, py - 9);
        ctx.arc(px, py, 12.7, -Math.PI / 4 - 0.35, -Math.PI / 4 + 0.35); ctx.closePath(); ctx.stroke();
      } else if ((kind === 'L' || kind === 'l') && m.cat === 'p') {
        ctx.fillRect(px - 2.4, py - 4.5, 4.8, 9); ctx.strokeRect(px - 2.4, py - 4.5, 4.8, 9);
      } else if ((kind === 'L' || kind === 'l') && m.cat === 's') {
        ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 3, py + 4); ctx.lineTo(px - 3, py + 4);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (kind === 'W' || kind === 'w') {
        ctx.beginPath(); ctx.arc(px, py, 3.2, 0, U.TAU); ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(px, py - 5.5); ctx.lineTo(px + 3.4, py + 3); ctx.lineTo(px - 3.4, py + 3);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8b400';
        ctx.fillRect(px - 3, py + 3, 6, 2);
      }
      if (showLabels) {
        ctx.fillStyle = '#33506080';
        if (m.n) ctx.fillText(m.n + (m.lt ? ' ' + m.lt : ''), px + 6, py - 5);
      }
    }
    /* harbours */
    var pv = W.portsWithin(C.cam.x, C.cam.y, Math.max(cw, ch) / C.cam.scale);
    var shown = [];
    for (var p = 0; p < pv.length; p++) {
      var pt = pv[p], qx = sx(pt.x), qy = sy(pt.y);
      if (qx < -40 || qy < -40 || qx > cw + 40 || qy > ch + 40) continue;
      ctx.fillStyle = '#8e2f8e';
      ctx.beginPath(); ctx.arc(qx, qy, 4, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      var clash = false;
      for (var q2 = 0; q2 < shown.length; q2++)
        if (Math.abs(shown[q2][0] - qx) < 76 && Math.abs(shown[q2][1] - qy) < 13) { clash = true; break; }
      if (!clash) {
        shown.push([qx, qy]);
        ctx.fillStyle = '#2b1a3a'; ctx.font = 'bold 11px ui-rounded,system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(pt.name, qx, qy - 9);
      }
      ctx.textAlign = 'left'; ctx.font = '9px ui-monospace,Menlo,monospace';
    }
  }

  function drawStream() {
    var step = U.clamp(52 / C.cam.scale, 400, 3000);
    var gx0 = C.cam.x - cw / 2 / C.cam.scale, gy0 = C.cam.y - ch / 2 / C.cam.scale;
    var gx1 = C.cam.x + cw / 2 / C.cam.scale, gy1 = C.cam.y + ch / 2 / C.cam.scale;
    for (var wy = Math.floor(gy0 / step) * step; wy < gy1; wy += step) {
      for (var wx = Math.floor(gx0 / step) * step; wx < gx1; wx += step) {
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
    buildBase();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(baseCv, 0, 0, cw, ch);
    drawContours();

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

    /* day-charter bays: the circle the guests want to swing in */
    if (player && player.contracts) player.contracts.forEach(function (c) {
      if (!c.tour) return;
      var tx = sx(c.tour.x), ty = sy(c.tour.y), tr = c.tour.r * C.cam.scale;
      ctx.strokeStyle = c.tour.done ? 'rgba(30,120,60,.8)' : 'rgba(142,47,142,.8)';
      ctx.setLineDash([6, 5]); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(tx, ty, Math.max(6, tr), 0, U.TAU); ctx.stroke();
      ctx.setLineDash([]);
      /* their time at anchor, as a filling arc */
      if (c.tour.stayed > 0 && !c.tour.done) {
        ctx.strokeStyle = 'rgba(142,47,142,.9)'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(6, tr), -Math.PI / 2,
          -Math.PI / 2 + U.TAU * Math.min(1, c.tour.stayed / c.tour.staySec));
        ctx.stroke();
      }
      ctx.fillStyle = c.tour.done ? '#1e783c' : '#8e2f8e';
      ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
      ctx.fillText(c.tour.done ? 'homeward' : 'guests: anchor here', tx, ty - Math.max(6, tr) - 4);
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
    C.cam.scale = U.clamp(C.cam.scale * mult, 0.00035, 0.5);
    var after = C.toWorld(cx, cy);
    C.cam.x += before.x - after.x; C.cam.y += before.y - after.y;

  };
  C.pan = function (dx, dy) {
    C.cam.x -= dx / C.cam.scale;
    C.cam.y -= dy / C.cam.scale;
  };

})(window.SCS);
