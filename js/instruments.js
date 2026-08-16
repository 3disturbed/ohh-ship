/* instruments.js — the instrument cluster.  (SDD §30, §43)
   What is displayed depends entirely on what is fitted to the boat. */
(function (S) {
  'use strict';
  var U = S.U, E = S.Env, W = S.World;
  var I = S.Inst = {};

  var cv, ctx, dpr = 1, cw = 0, ch = 0;
  var zones = [];

  var INK = '#dcecf3', DIM = '#6c93a6', ACC = '#f2b134', CY = '#4fd1c5', BAD = '#ef5b5b';

  I.init = function (canvas) { cv = canvas; ctx = cv.getContext('2d'); I.resize(); };
  I.resize = function () {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = cv.clientWidth; ch = cv.clientHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  };
  I.hit = function (x, y) {
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z.id;
    }
    return null;
  };

  function label(text, x, y) {
    ctx.fillStyle = DIM; ctx.font = '9px ui-monospace,Menlo,monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }
  function big(text, x, y, size, col) {
    ctx.fillStyle = col || INK;
    ctx.font = '600 ' + size + 'px ui-monospace,Menlo,monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }
  function frameBox(x, y, w, h) {
    ctx.strokeStyle = '#1b3c4c'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }

  /* ---------- compass card (§30) ---------- */
  function compass(x, y, size, v, wpBrg) {
    var cx = x + size / 2, cy = y + size / 2, r = size * 0.40;
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = '#07161d'; ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = '#1b3c4c'; ctx.lineWidth = 1; ctx.stroke();

    ctx.save(); ctx.rotate(-v.hdg);
    for (var a = 0; a < 360; a += 10) {
      var ar = U.rad(a), major = a % 30 === 0;
      ctx.strokeStyle = major ? INK : '#2d5566';
      ctx.lineWidth = major ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.sin(ar) * (r - (major ? 8 : 4)), -Math.cos(ar) * (r - (major ? 8 : 4)));
      ctx.lineTo(Math.sin(ar) * r, -Math.cos(ar) * r);
      ctx.stroke();
    }
    var pts = ['N', 'E', 'S', 'W'];
    ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var p = 0; p < 4; p++) {
      var pr = p * Math.PI / 2;
      ctx.fillStyle = p === 0 ? '#ef5b5b' : INK;
      ctx.save();
      ctx.translate(Math.sin(pr) * (r - 15), -Math.cos(pr) * (r - 15));
      ctx.rotate(v.hdg);
      ctx.fillText(pts[p], 0, 0);
      ctx.restore();
    }
    /* course over ground and bearing to waypoint bugs */
    if (v.has('gps') && v.sog > 0.2) {
      ctx.strokeStyle = CY; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.sin(v.cog) * (r - 3), -Math.cos(v.cog) * (r - 3));
      ctx.lineTo(Math.sin(v.cog) * (r + 5), -Math.cos(v.cog) * (r + 5));
      ctx.stroke();
    }
    if (wpBrg !== null && wpBrg !== undefined) {
      ctx.fillStyle = '#c86ec8';
      ctx.beginPath();
      ctx.moveTo(Math.sin(wpBrg) * (r + 6), -Math.cos(wpBrg) * (r + 6));
      ctx.lineTo(Math.sin(wpBrg + 0.10) * (r - 2), -Math.cos(wpBrg + 0.10) * (r - 2));
      ctx.lineTo(Math.sin(wpBrg - 0.10) * (r - 2), -Math.cos(wpBrg - 0.10) * (r - 2));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    /* lubber line and digital heading */
    ctx.strokeStyle = ACC; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -r - 7); ctx.lineTo(0, -r + 5); ctx.stroke();
    var fs = U.clamp(size * 0.135, 11, 15);
    ctx.fillStyle = INK; ctx.font = '600 ' + fs.toFixed(0) + 'px ui-monospace,Menlo,monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(U.brgStr(v.hdg), 0, 1);
    ctx.fillStyle = DIM; ctx.font = '8px ui-monospace,Menlo,monospace';
    ctx.fillText('HDG', 0, fs + 1);
    ctx.restore();
    zones.push({ id: 'compass', x: x, y: y, w: size, h: size });
  }

  /* ---------- wind dial (§13) ---------- */
  function windDial(x, y, size, v) {
    var cx = x + size / 2, cy = y + size / 2, r = size * 0.40;
    var known = v.has('windinst');
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = '#07161d'; ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = '#1b3c4c'; ctx.lineWidth = 1; ctx.stroke();

    /* no-go shading, and the gybe-danger band astern */
    ctx.fillStyle = 'rgba(239,91,91,.16)';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, -Math.PI / 2 - U.rad(38), -Math.PI / 2 + U.rad(38));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(242,177,52,.12)';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, Math.PI / 2 - U.rad(14), Math.PI / 2 + U.rad(14));
    ctx.closePath(); ctx.fill();

    for (var a = 0; a < 360; a += 30) {
      var ar = U.rad(a);
      ctx.strokeStyle = '#2d5566'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.sin(ar) * (r - 4), -Math.cos(ar) * (r - 4));
      ctx.lineTo(Math.sin(ar) * r, -Math.cos(ar) * r);
      ctx.stroke();
    }
    /* boat outline */
    ctx.strokeStyle = '#3d6a7d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.20, r * 0.45);
    ctx.lineTo(-r * 0.20, r * 0.45); ctx.closePath(); ctx.stroke();

    /* apparent wind needle */
    var aw = U.rad(v.awa);
    ctx.strokeStyle = ACC; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(Math.sin(aw) * r, -Math.cos(aw) * r);
    ctx.lineTo(Math.sin(aw) * r * 0.30, -Math.cos(aw) * r * 0.30);
    ctx.stroke();
    ctx.fillStyle = ACC;
    ctx.beginPath();
    ctx.moveTo(Math.sin(aw) * r * 0.30, -Math.cos(aw) * r * 0.30);
    ctx.lineTo(Math.sin(aw + 0.22) * r * 0.55, -Math.cos(aw + 0.22) * r * 0.55);
    ctx.lineTo(Math.sin(aw - 0.22) * r * 0.55, -Math.cos(aw - 0.22) * r * 0.55);
    ctx.closePath(); ctx.fill();
    /* true wind needle, if a wind unit is fitted */
    if (known) {
      var tw = U.wrapPI(v.twd - v.hdg);
      ctx.strokeStyle = CY; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(Math.sin(tw) * r * 0.92, -Math.cos(tw) * r * 0.92);
      ctx.lineTo(Math.sin(tw) * r * 0.62, -Math.cos(tw) * r * 0.62);
      ctx.stroke();
      /* beat-angle targets: the closest useful course each side of the wind */
      var beat = U.rad(S.POLARS ? S.POLARS.beatAt(v.tws * U.MS2KN) : 45);
      [tw - beat, tw + beat].forEach(function (bug) {
        ctx.fillStyle = CY;
        ctx.beginPath();
        ctx.moveTo(Math.sin(bug) * (r + 5), -Math.cos(bug) * (r + 5));
        ctx.lineTo(Math.sin(bug + 0.09) * (r - 3), -Math.cos(bug + 0.09) * (r - 3));
        ctx.lineTo(Math.sin(bug - 0.09) * (r - 3), -Math.cos(bug - 0.09) * (r - 3));
        ctx.closePath(); ctx.fill();
      });
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var wfs = U.clamp(size * 0.118, 9, 13);
    if (known) {
      ctx.fillStyle = INK; ctx.font = '600 ' + wfs.toFixed(0) + 'px ui-monospace,Menlo,monospace';
      ctx.fillText(Math.round(Math.abs(v.awa)) + '°' + (v.awa >= 0 ? 'S' : 'P'), 0, -2);
      ctx.fillStyle = ACC; ctx.font = '600 ' + (wfs - 2).toFixed(0) + 'px ui-monospace,Menlo,monospace';
      ctx.fillText((v.aws * U.MS2KN).toFixed(1) + 'kn', 0, wfs);
    } else {
      ctx.fillStyle = DIM; ctx.font = '8px ui-monospace,Menlo,monospace';
      ctx.fillText('BURGEE', 0, 2);
      ctx.fillText('no instr.', 0, 12);
    }
    ctx.restore();
    zones.push({ id: 'wind', x: x, y: y, w: size, h: size });
  }

  /* ---------- digital cells ----------
     Layout: label top-left, big value bottom-left, two small lines on the
     right, and a bar pinned to the bottom edge. */
  var SMALL = false;      // set per frame from the cell size
  function cell(x, y, w, h, id) {
    frameBox(x, y, w, h);
    zones.push({ id: id, x: x, y: y, w: w, h: h });
    SMALL = (w < 122 || h < 60);
    var pad = SMALL ? 5 : 7;
    return SMALL
      ? { bx: x + pad, by: y + h - 11, rx: x + w - pad, r1: y + h - 22, r2: y + h - 11,
          barX: x + pad, barY: y + h - 6, barW: w - pad * 2, big: 16, two: false }
      : { bx: x + pad, by: y + h - 14, rx: x + w - pad, r1: y + h - 27, r2: y + h - 15,
          barX: x + pad, barY: y + h - 8, barW: w - pad * 2, big: 19, two: true };
  }
  function right(text, x, y, col, weight) {
    ctx.fillStyle = col || DIM;
    ctx.font = (weight || '') + ' ' + (SMALL ? 8.5 : 9.5) + 'px ui-monospace,Menlo,monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }
  function bar(c, frac, col) {
    ctx.fillStyle = '#08171f'; ctx.fillRect(c.barX, c.barY, c.barW, 3);
    ctx.fillStyle = col;
    ctx.fillRect(c.barX, c.barY, c.barW * U.clamp(frac, 0, 1), 3);
  }

  function cellDepth(x, y, w, h, v) {
    var c = cell(x, y, w, h, 'ukc');
    label('DEPTH m', x + 6, y + 4);
    var warn = v.ukc < 0.8, bad = v.ukc <= 0;
    var col = bad ? BAD : warn ? ACC : INK;
    big(v.depth > 40 ? '--' : v.depth.toFixed(1), c.bx, c.by, c.big, col);
    right('UKC ' + (v.ukc > 40 ? '--' : v.ukc.toFixed(1)), c.rx, c.r1, col, '600');
    if (c.two) right('draft ' + v.draft().toFixed(2), c.rx, c.r2);
    bar(c, v.ukc / 4, bad ? BAD : warn ? ACC : CY);
  }
  function cellSpeed(x, y, w, h, v, wpBrg) {
    var c = cell(x, y, w, h, 'speed');
    label('SPEED kn', x + 6, y + 4);
    big((v.stw * U.MS2KN).toFixed(1), c.bx, c.by, c.big, INK);
    /* VMG: to the waypoint when one is set; to windward when beating.
       Needs the wind unit — reading it off the water IS the lesson. */
    var vmg = null;
    if (v.has('windinst') && v.sailArea().total > 0.5) {
      if (wpBrg !== null && wpBrg !== undefined && v.sog > 0.15)
        vmg = v.sog * Math.cos(U.angDiff(v.cog, wpBrg)) * U.MS2KN;
      else {
        var twaR = U.wrapPI(v.twd - v.hdg);
        if (Math.abs(U.deg(twaR)) < 90 && v.stw > 0.15) vmg = v.stw * Math.cos(twaR) * U.MS2KN;
      }
    }
    if (v.has('gps')) {
      right((v.sog * U.MS2KN).toFixed(1) + ' SOG', c.rx, c.r1, CY, '600');
      if (c.two) right(vmg !== null ? 'VMG ' + vmg.toFixed(1) : 'COG ' + U.brgStr(v.cog), c.rx, c.r2,
        vmg !== null && vmg < 0 ? BAD : DIM);
    } else {
      right(vmg !== null ? 'VMG ' + vmg.toFixed(1) : 'STW · hull ' + v.hullSpeedKn.toFixed(1), c.rx, c.r1,
        vmg !== null && vmg < 0 ? BAD : DIM);
      if (c.two) right('log ' + (v.log / U.NM).toFixed(1) + ' NM', c.rx, c.r2);
    }
    bar(c, (v.stw * U.MS2KN) / v.hullSpeedKn, (v.stw * U.MS2KN) > v.hullSpeedKn * 0.94 ? ACC : CY);
  }
  function cellEngine(x, y, w, h, v) {
    var c = cell(x, y, w, h, 'fuel');
    label('FUEL L', x + 6, y + 4);
    var pct = v.fuel / v.fuelCapacity();
    var col = pct < 0.15 ? BAD : pct < 0.3 ? ACC : INK;
    big(v.fuel.toFixed(1), c.bx, c.by, c.big, col);
    if (v.engine.running) {
      right(Math.round(v.engine.rpm) + ' rpm', c.rx, c.r1, v.engine.temp > 98 ? BAD : INK, '600');
      if (c.two) right(v.rangeEstimate().lph.toFixed(1) + ' L/h · ' + Math.round(v.engine.temp) + '°C', c.rx, c.r2);
    } else {
      right('engine off', c.rx, c.r1);
      if (c.two) right(v.cargo.length ? v.cargo.length + ' in hold' : 'hold empty', c.rx, c.r2);
    }
    bar(c, pct, pct < 0.15 ? BAD : pct < 0.3 ? ACC : CY);
  }
  function cellTide(x, y, w, h, v) {
    var c = cell(x, y, w, h, 'tide');
    var ti = E.tideInfo(v.x, v.y);
    label('TIDE m', x + 6, y + 4);
    big(ti.height.toFixed(2), c.bx, c.by, c.big, INK);
    ctx.fillStyle = ti.rising ? CY : ACC;
    ctx.font = '600 ' + (c.big - 5) + 'px ui-monospace,Menlo,monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(ti.rising ? '\u25b2' : '\u25bc', c.bx + c.big * 2.5, c.by);
    if (v.has('almanac')) {
      right('HW ' + U.hhmm(ti.nextHW), c.rx, c.r1);
      if (c.two) right('LW ' + U.hhmm(ti.nextLW) + ' ' + ti.nextLWHeight.toFixed(1), c.rx, c.r2);
    } else {
      right(ti.rising ? 'flooding' : 'ebbing', c.rx, c.r1);
      if (c.two) right((Math.abs(ti.rate) * 60).toFixed(1) + ' m/h', c.rx, c.r2);
    }
    bar(c, (ti.height - (ti.nextLWHeight)) / Math.max(0.4, ti.range), ti.rising ? CY : ACC);
  }

  /* ---------- frame ---------- */
  I.frame = function (v, player, wpBrg) {
    if (!ctx) return;
    zones = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#091820'; ctx.fillRect(0, 0, cw, ch);

    /* Dials take a share of the width, never a fixed size, so the digital
       cells always have room to be legible on a phone. */
    var gap = 4;
    var dials = cw > 300 ? 2 : 1;
    var dialSize = Math.min(ch, Math.max(64, cw * (dials === 2 ? 0.235 : 0.30)));
    var dx = 2;
    compass(dx, (ch - dialSize) / 2, dialSize, v, wpBrg);
    dx += dialSize + gap;
    if (dials > 1) { windDial(dx, (ch - dialSize) / 2, dialSize, v); dx += dialSize + gap; }

    var restW = cw - dx - 2, restH = ch - 6;
    var colW = restW / 2, rowH = restH / 2;
    cellDepth(dx, 3, colW - gap, rowH - gap / 2, v);
    cellSpeed(dx + colW, 3, colW - gap, rowH - gap / 2, v, wpBrg);
    cellEngine(dx, 3 + rowH, colW - gap, rowH - gap / 2, v);
    cellTide(dx + colW, 3 + rowH, colW - gap, rowH - gap / 2, v);
  };

  /* which handbook page an instrument belongs to */
  I.PAGE = { compass: 'passage_planning', wind: 'apparent_wind', ukc: 'ukc',
             speed: 'stw_sog', fuel: 'engine_range', tide: 'tidal_height' };

})(window.SCS);
