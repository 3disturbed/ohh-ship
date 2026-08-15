/* ui.js — screens, controls, port business.  (SDD §40–§44) */
(function (S) {
  'use strict';
  var U = S.U, W = S.World, E = S.Env, D = S.DATA, Ec = S.Econ, R = S.Render, C = S.Chart, I = S.Inst;
  var UI = S.UI = {};

  var G = null;                 // set by game.js
  var el = {};
  UI.portTab = 'jobs';
  UI.bookSel = null;
  UI.arrival = null;

  function $(id) { return document.getElementById(id); }
  function on(node, ev, fn) { node.addEventListener(ev, fn, { passive: ev !== 'wheel' && ev !== 'touchmove' }); }

  UI.init = function (game) {
    G = game;
    ['topbar','tbClock','tbMoney','tbWind','tbTide','btnRate','btnChart','btnBook','btnMenu',
     'alerts','toasts','btnMoor','cargoTag','deck','sheetMain','sheetJib','throttle','lblMain',
     'lblJib','lblRpm','lblHelm','btnHoist','btnReef','btnFurl','btnTack','btnStart','btnPilot',
     'tillerTrack','tillerKnob','chartView','chartCanvas','chartClose','chartFollow','chartTide',
     'chartMeasure','chartRoute','chartClear','chartInfo','chartReadout','portView','portName',
     'portSub','portClose','portTabs','portBody','bookView','bookClose','bookList','bookPage',
     'bookSub','menuView','menuClose','menuBody','world','instruments',
     'btnAnchor','btnFleet','anchorPanel','fleetPanel'].forEach(function (id) { el[id] = $(id); });

    bindDeck();
    bindTiller();
    bindTop();
    bindChart();
    bindPort();
    bindBook();
    bindKeys();
    bindWorldGestures();
    bindAnchor();
  };

  /* ================= deck controls (§41, §42) ================= */
  function bindDeck() {
    var v = function () { return G.vessel; };
    on(el.sheetMain, 'input', function () { v().mainSheet = +el.sheetMain.value; });
    on(el.sheetJib, 'input', function () { v().jibSheet = +el.sheetJib.value; });
    on(el.throttle, 'input', function () { v().engine.throttle = +el.throttle.value / 100; });

    on(el.btnHoist, 'click', function () {
      var b = v(); b.hoistMain(b.mainHoist < 0.5 || b._hoistTo === 0);
      UI.toast('Main', b._hoistTo ? 'Hoisting main' : 'Dropping main');
    });
    on(el.btnFurl, 'click', function () {
      var b = v();
      if (b.has('furler')) {
        var next = b.jibOut > 0.85 ? 0.6 : b.jibOut > 0.5 ? 0.3 : b.jibOut > 0.1 ? 0 : 1;
        b.setJib(next);
      } else b.setJib(b.jibOut > 0.5 ? 0 : 1);
    });
    on(el.btnReef, 'click', function () {
      var b = v(), next = (b.mainReef + 1) > b.spec.reefs ? 0 : b.mainReef + 1;
      if (b.setReef(next)) UI.toast('Reefing', next === 0 ? 'Shaking out the reefs' : 'Taking in reef ' + next);
      else UI.toast('Reefing', 'Already working on it');
    });
    on(el.btnTack, 'click', function () {
      var b = v();
      /* a tack mirrors your course about the true wind — not the apparent,
         which always reads closer to the bow than the wind really is */
      if (b.sailArea().total < 0.5) { UI.toast('Helm', 'No sail set — nothing to tack'); return; }
      var through = Math.abs(b.awa) > 90;
      G.autoTack = { target: U.wrap(2 * b.twd - b.hdg), gybe: through };
      UI.toast('Helm', through ? 'Gybe-oh — heads down' : 'Lee-oh');
    });
    on(el.btnStart, 'click', function () {
      var b = v();
      if (b.engine.running) { b.stopEngine(); }
      else { var r = b.startEngine(); if (r) UI.alert('No fuel', 2500); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('.gear'), function (g) {
      on(g, 'click', function () {
        var b = v();
        b.engine.gear = +g.dataset.gear;
        Array.prototype.forEach.call(document.querySelectorAll('.gear'), function (o) {
          o.classList.toggle('on', +o.dataset.gear === b.engine.gear);
        });
      });
    });
    on(el.btnPilot, 'click', function () {
      var b = v();
      if (!b.has('autopilot')) return;
      if (b.autopilot.on) { b.autopilot.on = false; }
      else if (b.waypoint) { b.autopilot.on = true; b.autopilot.mode = 'wpt'; }
      else { b.autopilot.on = true; b.autopilot.mode = 'hdg'; b.autopilot.target = b.hdg; }
      el.btnPilot.classList.toggle('on', b.autopilot.on);
      UI.toast('Autopilot', !b.autopilot.on ? 'Off'
        : b.autopilot.mode === 'wpt' ? 'Steering for the waypoint' : 'Holding ' + U.brgStr(b.hdg));
    });
  }

  /* tiller: drag, or click the middle to centre */
  function bindTiller() {
    var drag = false;
    function setFrom(e) {
      var r = el.tillerTrack.getBoundingClientRect();
      var t = (e.clientX - r.left) / r.width * 2 - 1;
      G.vessel.rudderCmd = U.clamp(t, -1, 1) * 35;
      G.vessel.autopilot.on = false;
      el.btnPilot.classList.remove('on');
    }
    on(el.tillerTrack, 'pointerdown', function (e) {
      drag = true; el.tillerTrack.setPointerCapture(e.pointerId); setFrom(e);
    });
    on(el.tillerTrack, 'pointermove', function (e) { if (drag) setFrom(e); });
    function up() {
      if (!drag) return; drag = false;
      if (G.settings.springHelm) G.vessel.rudderCmd = 0;
    }
    on(el.tillerTrack, 'pointerup', up);
    on(el.tillerTrack, 'pointercancel', up);
    on(el.tillerTrack, 'dblclick', function () { G.vessel.rudderCmd = 0; });
  }

  function bindTop() {
    on(el.btnRate, 'click', function () { G.cycleRate(); });
    on(el.btnChart, 'click', function () { UI.showChart(true); });
    on(el.btnBook, 'click', function () { UI.showBook(true); });
    on(el.btnMenu, 'click', function () { UI.showMenu(true); });
    on(el.btnMoor, 'click', function () {
      if (el.btnMoor.dataset.mode === 'slip') G.slipLines(); else G.tryMoor();
    });
    on(el.instruments, 'click', function (e) {
      var r = el.instruments.getBoundingClientRect();
      var id = I.hit(e.clientX - r.left, e.clientY - r.top);
      var page = id && I.PAGE[id];
      if (page && G.player.unlocked.indexOf(page) >= 0) { UI.bookSel = page; UI.showBook(true); }
      else if (id === 'compass' && C.wp()) UI.toast('Waypoint', 'Bearing ' + U.brgStr(bearingToWp()));
    });
  }

  /* pinch and wheel zoom on the world view */
  function bindWorldGestures() {
    var pts = {}, lastD = 0;
    on(el.world, 'wheel', function (e) { e.preventDefault(); R.zoom(e.deltaY > 0 ? 0.9 : 1.11, e.offsetX, e.offsetY); });
    on(el.world, 'pointerdown', function (e) { pts[e.pointerId] = e; });
    on(el.world, 'pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = e;
      var k = Object.keys(pts);
      if (k.length === 2) {
        var a = pts[k[0]], b = pts[k[1]];
        var d = U.len(a.clientX - b.clientX, a.clientY - b.clientY);
        if (lastD) R.zoom(d / lastD, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
        lastD = d;
      }
    });
    function end(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) lastD = 0; }
    on(el.world, 'pointerup', end); on(el.world, 'pointercancel', end);
  }

  function bindKeys() {
    var held = {};
    on(window, 'keydown', function (e) {
      if (e.repeat) return;
      var b = G.vessel, k = e.key.toLowerCase();
      held[k] = true;
      if (k === 'c') UI.showChart(el.chartView.classList.contains('hidden'));
      else if (k === 'h') UI.showBook(el.bookView.classList.contains('hidden'));
      else if (k === 'escape') { UI.showChart(false); UI.showBook(false); UI.showMenu(false); }
      else if (k === 'e') el.btnStart.click();
      else if (k === 'm') el.btnHoist.click();
      else if (k === 'j') el.btnFurl.click();
      else if (k === 'r') el.btnReef.click();
      else if (k === 't') el.btnTack.click();
      else if (k === 'f') G.fix();
      else if (k === 'l') { if (G.vessel.moored) G.slipLines(); else G.tryMoor(); }
      else if (k === 'tab') { e.preventDefault(); G.nextVessel(); }
      else if (k === 'q') UI.toggleAnchor();
      else if (k === ' ') { b.rudderCmd = 0; e.preventDefault(); }
      else if (k === '1' || k === '2' || k === '3') {
        b.engine.gear = k === '1' ? 1 : k === '2' ? 0 : -1;
        Array.prototype.forEach.call(document.querySelectorAll('.gear'), function (o) {
          o.classList.toggle('on', +o.dataset.gear === b.engine.gear);
        });
      }
    });
    on(window, 'keyup', function (e) { held[e.key.toLowerCase()] = false; });
    UI.keys = held;
  }

  /* ================= topbar / HUD ================= */
  UI.hud = function (v, player) {
    el.tbClock.textContent = U.clockStr(E.t);
    el.tbMoney.textContent = U.money(player.money);
    var w = E.wind(v.x, v.y);
    el.tbWind.textContent = U.cardinal(w.dir) + ' ' + U.brgStr(w.dir) + ' ' +
      (w.speed * U.MS2KN).toFixed(0) + 'kn F' + beaufort(w.speed * U.MS2KN);
    var ti = E.tideInfo(v.x, v.y);
    el.tbTide.textContent = 'Tide ' + ti.height.toFixed(1) + 'm ' + (ti.rising ? '▲' : '▼') +
      (ti.springs > 0.82 ? ' springs' : ti.springs < 0.55 ? ' neaps' : '');
    el.btnRate.textContent = G.rate + '×';

    /* deck labels */
    if (v.sheetsHanded) {
      v.sheetsHanded = false;
      el.sheetMain.value = Math.round(v.mainSheet);
      el.sheetJib.value = Math.round(v.jibSheet);
    }
    var side = function (a) { return a > 2 ? ' stbd' : a < -2 ? ' port' : ' mid'; };
    el.lblMain.textContent = (v.mainHoist < 0.05 ? 'stowed' :
      (v.mainHoist < 0.99 ? Math.round(v.mainHoist * 100) + '%' : (v.mainReef ? 'reef ' + v.mainReef : 'full'))) +
      (v.mainHoist > 0.05 ? ' ' + Math.abs(Math.round(v.boomAngle)) + '\u00b0' + side(v.boomAngle) : '');
    el.lblJib.textContent = v._jibSwap ? 'crossing…'
      : (v.jibOut < 0.05 ? 'furled' : Math.round(v.jibOut * 100) + '%') +
        (v.jibOut > 0.05 ? ' ' + Math.abs(Math.round(v.jibAngle)) + '\u00b0' + side(v.jibAngle) : '');
    el.lblRpm.textContent = v.engine.running ? Math.round(v.engine.rpm) + '  ' +
      (v.engine.gear > 0 ? 'ahd' : v.engine.gear < 0 ? 'ast' : 'neu') : 'off';
    el.lblHelm.textContent = v.moored ? 'alongside'
      : (v.rudder > 0.5 ? 'S' : v.rudder < -0.5 ? 'P' : '') + Math.abs(v.rudder).toFixed(0) + '°';
    el.btnReef.textContent = v._reefing > 0 ? '…' + Math.ceil(v._reefing) + 's' : 'Reef ' + v.mainReef;
    el.btnHoist.textContent = v.mainHoist > 0.5 ? 'Drop' : 'Hoist';
    el.btnFurl.textContent = v.jibOut > 0.5 ? (v.has('furler') ? 'Roll in' : 'Furl') : 'Unfurl';
    el.btnPilot.classList.toggle('hidden', !v.has('autopilot'));
    var kx = (v.rudder / 35) * 0.5 + 0.5;
    el.tillerKnob.style.marginLeft = (kx * (el.tillerTrack.clientWidth - 42) - el.tillerTrack.clientWidth / 2) + 'px';

    /* ground tackle and fleet buttons */
    el.btnAnchor.classList.toggle('on', v.anchor.down);
    el.btnAnchor.classList.toggle('alarm', v.anchor.dragging > 0.4);
    el.btnFleet.classList.toggle('hidden', G.fleet.length < 2);
    if (!el.anchorPanel.classList.contains('hidden')) UI.renderAnchor();
    if (!el.fleetPanel.classList.contains('hidden')) UI.renderFleet();

    /* cargo tag */
    if (v.cargo.length) {
      var lines = v.cargo.map(function (c) {
        var ct = player.contracts.filter(function (x) { return x.id === c.contract; })[0];
        var dest = ct ? W.port(ct.dest).name : '?';
      if (ct && ct.round && ct.stage === 2) dest = 'home to ' + dest;
        var left = ct ? ct.deadline - E.t : 0;
        return '<b>' + D.CARGO[c.type].name + '</b> → ' + dest +
          (ct ? '  ' + (left < 0 ? 'LATE ' + U.durStr(-left) : U.durStr(left)) : '');
      });
      el.cargoTag.innerHTML = lines.join('<br>');
      el.cargoTag.classList.remove('hidden');
    } else el.cargoTag.classList.add('hidden');
  };

  function beaufort(kn) {
    var b = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
    for (var i = 0; i < b.length; i++) if (kn < b[i]) return i;
    return 12;
  }

  /* ================= alerts & toasts ================= */
  var alerts = {};
  UI.alert = function (text, ms, cls) {
    if (alerts[text]) { alerts[text].until = performance.now() + (ms || 2000); return; }
    var n = document.createElement('div');
    n.className = 'alert ' + (cls || '');
    n.textContent = text;
    el.alerts.appendChild(n);
    alerts[text] = { node: n, until: performance.now() + (ms || 2000) };
  };
  UI.persistentAlert = function (key, text, cls) {
    if (alerts[key]) { alerts[key].until = performance.now() + 900; alerts[key].node.textContent = text; return; }
    var n = document.createElement('div');
    n.className = 'alert ' + (cls || '');
    n.textContent = text;
    el.alerts.appendChild(n);
    alerts[key] = { node: n, until: performance.now() + 900 };
  };
  UI.tickAlerts = function () {
    var now = performance.now();
    for (var k in alerts) if (alerts[k].until < now) { alerts[k].node.remove(); delete alerts[k]; }
  };
  UI.toast = function (title, text, bookId) {
    var n = document.createElement('div');
    n.className = 'toast';
    n.innerHTML = '<b>' + U.esc(title) + '</b><span>' + U.esc(text) + (bookId ? ' — tap to read' : '') + '</span>';
    if (bookId) n.style.pointerEvents = 'auto';
    if (bookId) n.onclick = function () { UI.bookSel = bookId; UI.showBook(true); n.remove(); };
    el.toasts.appendChild(n);
    setTimeout(function () { n.style.transition = 'opacity .4s'; n.style.opacity = 0;
      setTimeout(function () { n.remove(); }, 420); }, bookId ? 7000 : 3200);
  };

  /* ================= chart view ================= */
  function bindChart() {
    on(el.chartClose, 'click', function () { UI.showChart(false); });
    on(el.chartFollow, 'click', function () {
      C.follow = !C.follow; el.chartFollow.classList.toggle('on', C.follow);
    });
    on(el.chartTide, 'click', function () {
      C.showStream = !C.showStream; el.chartTide.classList.toggle('on', C.showStream);
    });
    on(el.chartMeasure, 'click', function () { setChartMode(C.mode === 'measure' ? 'inspect' : 'measure'); });
    on(el.chartRoute, 'click', function () { setChartMode(C.mode === 'waypoint' ? 'inspect' : 'waypoint'); });
    on(el.chartClear, 'click', function () {
      C.measure = []; if (G.vessel) G.vessel.waypoint = null; C.info = null;
    });

    var down = null, moved = 0, pts = {}, lastD = 0;
    on(el.chartCanvas, 'pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      down = { x: e.clientX, y: e.clientY }; moved = 0;
      el.chartCanvas.setPointerCapture(e.pointerId);
    });
    on(el.chartCanvas, 'pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      var prev = pts[e.pointerId];
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var keys = Object.keys(pts);
      if (keys.length === 2) {
        var a = pts[keys[0]], b = pts[keys[1]];
        var d = U.len(a.x - b.x, a.y - b.y);
        var r = el.chartCanvas.getBoundingClientRect();
        if (lastD) C.zoom(d / lastD, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        lastD = d; C.follow = false; el.chartFollow.classList.remove('on');
        return;
      }
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) { C.pan(dx, dy); C.follow = false; el.chartFollow.classList.remove('on'); }
    });
    function up(e) {
      delete pts[e.pointerId];
      if (Object.keys(pts).length < 2) lastD = 0;
      if (down && moved < 7) {
        var r = el.chartCanvas.getBoundingClientRect();
        C.tap(e.clientX - r.left, e.clientY - r.top, G.vessel);
      }
      down = null;
    }
    on(el.chartCanvas, 'pointerup', up);
    on(el.chartCanvas, 'pointercancel', up);
    on(el.chartCanvas, 'wheel', function (e) {
      e.preventDefault();
      var r = el.chartCanvas.getBoundingClientRect();
      C.zoom(e.deltaY > 0 ? 0.88 : 1.14, e.clientX - r.left, e.clientY - r.top);
      C.follow = false; el.chartFollow.classList.remove('on');
    });
  }
  function setChartMode(m) {
    C.mode = m;
    el.chartMeasure.classList.toggle('on', m === 'measure');
    el.chartRoute.classList.toggle('on', m === 'waypoint');
  }
  UI.showChart = function (show) {
    el.chartView.classList.toggle('hidden', !show);
    if (show) {
      C.resize();
      var v = G.vessel, known = v.has('gps');
      if (C.follow) C.centreOn(known ? v.x : v.dr.x, known ? v.y : v.dr.y);
    }
  };
  UI.chartHud = function (v, player) {
    var lines = [];
    if (C.info) {
      var i = C.info;
      lines.push('Charted ' + (i.charted < 0 ? 'dries ' + (-i.charted).toFixed(1) : i.charted.toFixed(1) + ' m'));
      lines.push('Tide ' + i.tide.toFixed(2) + ' m → <b>' + i.actual.toFixed(1) + ' m</b> now');
      lines.push('Bottom: ' + i.bottom);
      if (i.mark) lines.push('Mark: ' + i.mark.n + (i.mark.lt ? ' ' + i.mark.lt : ''));
      if (i.port) {
        var win = Ec.accessWindow(i.port.id, v.draft(), E.t, 0.3);
        lines.push('<b>' + i.port.name + '</b> gate ' + Ec.gate(i.port.id).toFixed(1) + ' m');
        lines.push(win.always ? 'Entry at any state of tide'
          : win.nowOpen ? 'Open now until ' + U.hhmm(win.shut)
          : win.never ? 'No access at this draft' : 'Opens ' + U.hhmm(win.open) + '–' + U.hhmm(win.shut));
      }
    } else if (C.mode === 'measure') lines.push('Tap two points to measure');
    else if (C.mode === 'waypoint') lines.push('Tap to place a waypoint');
    else lines.push('Tap the chart to inspect');
    el.chartInfo.innerHTML = lines.join('<br>');

    var out = [];
    var mi = C.measureInfo();
    if (mi) out.push('<b>' + U.nmStr(mi.dist) + '</b>  ' + U.brgStr(mi.brg));
    if (v.waypoint) {
      var known = v.has('gps');
      var ox = known ? v.x : v.dr.x, oy = known ? v.y : v.dr.y;
      var dx = v.waypoint.x - ox, dy = v.waypoint.y - oy;
      var d = U.len(dx, dy), brg = U.bearingOf(dx, dy);
      out.push('WPT ' + U.nmStr(d) + ' ' + U.brgStr(brg));
      if (v.sog > 0.2) {
        var closing = (v.vx * dx + v.vy * dy) / Math.max(1, d);
        out.push(closing > 0.05 ? 'ETA ' + U.durStr(d / closing) + ' (' + U.hhmm(E.t + d / closing) + ')' : 'not closing');
      }
    }
    if (!v.has('gps')) out.push(player.everFixed ? 'DR only — fix your position' : 'No fix yet');
    el.chartReadout.innerHTML = out.join('<br>');
    el.chartReadout.style.display = out.length ? '' : 'none';
  };
  function bearingToWp() {
    var v = G.vessel, known = v.has('gps');
    if (!v.waypoint) return null;
    var ox = known ? v.x : v.dr.x, oy = known ? v.y : v.dr.y;
    return U.bearingOf(v.waypoint.x - ox, v.waypoint.y - oy);
  }
  UI.bearingToWp = bearingToWp;

  /* ================= handbook ================= */
  function bindBook() {
    on(el.bookClose, 'click', function () { UI.showBook(false); });
  }
  UI.showBook = function (show) {
    el.bookView.classList.toggle('hidden', !show);
    if (show) UI.renderBook();
  };
  UI.renderBook = function () {
    var p = G.player, prog = S.Edu.progress(p);
    el.bookSub.textContent = prog.have + ' of ' + prog.total + ' pages earned — you unlock a page by doing the thing';
    var html = '';
    D.HANDBOOK.forEach(function (e) {
      var un = p.unlocked.indexOf(e.id) >= 0;
      html += '<div class="book-item' + (un ? '' : ' locked') + (UI.bookSel === e.id ? ' on' : '') +
        '" data-b="' + e.id + '">' + (un ? U.esc(e.title) : '• • • • •') + '</div>';
    });
    el.bookList.innerHTML = html;
    Array.prototype.forEach.call(el.bookList.children, function (n) {
      n.onclick = function () {
        if (n.className.indexOf('locked') >= 0) return;
        UI.bookSel = n.dataset.b; UI.renderBook();
      };
    });
    if (!UI.bookSel || p.unlocked.indexOf(UI.bookSel) < 0) UI.bookSel = p.unlocked[p.unlocked.length - 1] || null;
    var e = UI.bookSel ? D.entry(UI.bookSel) : null;
    el.bookPage.innerHTML = e ?
      '<h2>' + U.esc(e.title) + '</h2>' + (e.diagram || '') + e.body +
      '<div class="why"><b>Why it matters.</b> ' + U.esc(e.why) + '</div>'
      : '<div class="empty">Nothing here yet.<br><br>Go and sail. The book fills itself as you meet each idea on the water.</div>';
  };

  /* ================= menu ================= */
  UI.showMenu = function (show) {
    el.menuView.classList.toggle('hidden', !show);
    if (!show) return;
    on(el.menuClose, 'click', function () { UI.showMenu(false); });
    var p = G.player, v = G.vessel;
    el.menuBody.innerHTML =
      '<div class="card"><h3>Log book</h3><div class="kv">' +
        kv('Jobs completed', p.stats.jobs) + kv('Delivered late', p.stats.lateJobs) +
        kv('Earned', U.money(p.stats.earned)) + kv('Reputation', p.reputation.toFixed(0) + ' / 100') +
        kv('Distance logged', (v.log / U.NM).toFixed(1) + ' NM') +
        kv('Engine hours', v.engine.hours.toFixed(1)) +
        kv('Groundings', p.stats.groundings) + kv('Tacks', p.stats.tacks) +
        kv('Handbook', S.Edu.progress(p).have + ' / ' + S.Edu.progress(p).total) +
      '</div></div>' +
      '<div class="card"><h3>Settings</h3>' +
        toggleRow('springHelm', 'Tiller springs back to centre', G.settings.springHelm) +
        toggleRow('hints', 'Show handbook prompts', G.settings.hints) +
        '<div class="row"><button class="btn" id="mSave">Save now</button>' +
        '<button class="btn danger" id="mNew">New game</button></div>' +
      '</div>' +
      '<div class="card"><h3>Controls</h3><div class="meta">' +
        'A / D or drag the tiller · SPACE centre helm<br>' +
        'W-S throttle slider · E engine · 1 / 2 / 3 ahead-neutral-astern<br>' +
        'M main · J jib · R reef · T tack · F fix position · L lines<br>' +
        'Q ground tackle · TAB change vessel<br>' +
        'C chart · H handbook · scroll or pinch to zoom' +
      '</div></div>';
    $('mSave').onclick = function () { G.save(); UI.toast('Saved', 'Progress written to this device'); };
    $('mNew').onclick = function () {
      el.menuBody.innerHTML = '<div class="card"><h3>Start again</h3>' +
        '<div class="meta">This erases the current save. How much are you starting with?</div></div>' +
        G.STARTS.map(function (st) {
          return '<div class="card"><h3>' + U.esc(st.name) + '<span class="fee">' + U.money(st.money) +
            '</span></h3><div class="meta">' + U.esc(st.desc) + '</div>' +
            '<div class="row"><button class="btn primary" data-start="' + st.id + '">Begin</button></div></div>';
        }).join('');
      Array.prototype.forEach.call(el.menuBody.querySelectorAll('[data-start]'), function (b) {
        b.onclick = function () { G.newGame(b.dataset.start); UI.showMenu(false); };
      });
    };
    Array.prototype.forEach.call(el.menuBody.querySelectorAll('[data-toggle]'), function (b) {
      b.onclick = function () {
        G.settings[b.dataset.toggle] = !G.settings[b.dataset.toggle];
        UI.showMenu(true);
      };
    });
  };
  function kv(k, v) { return '<span>' + k + '</span><span>' + v + '</span>'; }
  function toggleRow(id, label, on) {
    return '<div class="row"><button class="btn ' + (on ? 'primary' : '') + '" data-toggle="' + id + '">' +
      (on ? 'On' : 'Off') + '</button><span class="meta">' + label + '</span></div>';
  }

  /* ================= port (§32, §35, §38) ================= */
  function bindPort() {
    on(el.portClose, 'click', function () { G.castOff(); });
    Array.prototype.forEach.call(el.portTabs.children, function (t) {
      on(t, 'click', function () {
        UI.portTab = t.dataset.tab;
        Array.prototype.forEach.call(el.portTabs.children, function (o) { o.classList.toggle('on', o === t); });
        UI.renderPort();
      });
    });
  }
  UI.showPort = function (port, arrival) {
    G.atPort = port;
    UI.arrival = arrival || null;
    el.portView.classList.remove('hidden');
    UI.portTab = arrival ? 'jobs' : UI.portTab;
    UI.renderPort();
  };
  UI.hidePort = function () { el.portView.classList.add('hidden'); UI.arrival = null; };

  UI.renderPort = function () {
    var port = G.atPort, v = G.vessel, p = G.player;
    if (!port) return;
    el.portName.textContent = port.name;
    var ti = E.tideInfo(port.x, port.y);
    el.portSub.innerHTML = U.esc(port.desc) + '<br>Berthing ' + U.money(Ec.berthFee(port, v)) +
      ' · Tide ' + ti.height.toFixed(2) + ' m ' +
      (ti.rising ? 'rising' : 'falling') + ' · next HW ' + U.hhmm(ti.nextHW) + ' (' + ti.nextHWHeight.toFixed(1) + ' m)' +
      ' · LW ' + U.hhmm(ti.nextLW) + ' (' + ti.nextLWHeight.toFixed(1) + ' m)';
    var body = '';
    if (UI.arrival) body += arrivalCard(UI.arrival);
    if (UI.portTab === 'jobs') body += tabJobs(port, v, p);
    else if (UI.portTab === 'hold') body += tabHold(port, v, p);
    else if (UI.portTab === 'ship') body += tabShip(port, v, p);
    else body += tabYard(port, v, p);
    el.portBody.innerHTML = body;
    wirePort();
  };

  function arrivalCard(a) {
    var s = '<div class="card"><h3>Arrived at ' + U.esc(a.port) + '<span class="fee">' +
      (a.total > 0 ? '+' + U.money(a.total) : '') + '</span></h3><div class="meta">';
    if (!a.items.length) s += 'Nothing to deliver here.';
    a.items.forEach(function (it) {
      s += '<b>' + U.esc(it.name) + '</b> — ' + U.money(it.pay) +
        (it.rep >= 0 ? ' · reputation +' + it.rep.toFixed(1) : ' · reputation ' + it.rep.toFixed(1)) + '<br>';
      it.notes.forEach(function (n) { s += '&nbsp;&nbsp;· ' + U.esc(n) + '<br>'; });
    });
    if (a.fee) s += 'Berthing fee ' + U.money(-a.fee) + '<br>';
    s += '</div></div>';
    return s;
  }

  function tabJobs(port, v, p) {
    var offers = Ec.offers(port, p);
    var s = '';
    var mine = p.contracts.filter(function (c) { return c.origin === port.id && !isLoaded(v, c); });
    if (mine.length) {
      s += '<h2>Accepted, waiting to load</h2>';
      mine.forEach(function (c) { s += contractCard(c, v, p, 'load'); });
    }
    s += '<h2>Contract board</h2>';
    if (!offers.length) s += '<div class="empty">Nothing on the board. Come back on the next tide.</div>';
    offers.forEach(function (c) { s += contractCard(c, v, p, 'accept'); });
    return s;
  }

  function isLoaded(v, c) {
    return v.cargo.some(function (x) { return x.contract === c.id; });
  }

  function contractCard(c, v, p, action) {
    var cd = D.CARGO[c.type], dest = W.port(c.dest);
    var brg = U.bearingOf(dest.x - W.port(c.origin).x, dest.y - W.port(c.origin).y);
    var left = c.deadline - E.t;
    var win = Ec.accessWindow(c.dest, v.draft(), E.t, 0.3);
    var volLeft = v.spec.cargo_volume_m3 - v.cargoVolume();
    var massLeft = v.spec.max_payload_kg - v.cargoMass();
    var canMass = c.mass <= massLeft, canVol = c.volume <= volLeft;
    var needFridge = c.fridge && !v.has('fridge');
    var ok = canMass && canVol && !needFridge;

    var s = '<div class="card"><h3>' + U.esc(cd.name) + ' → ' + U.esc(dest.name) +
      '<span class="fee">' + U.money(c.reward) + '</span></h3><div class="meta">';
    s += '<b>' + c.mass + ' kg</b> · ' + c.volume.toFixed(2) + ' m³ · <b>' + c.nm.toFixed(1) + ' NM</b> ' + U.brgStr(brg) + '<br>';
    s += 'Due ' + U.clockStr(c.deadline) + ' — ' + (left > 0 ? '<b>' + U.durStr(left) + '</b> from now' : '<b style="color:#ef5b5b">overdue</b>') +
      ' · late ' + U.money(c.latePerMin) + '/min<br>';
    s += 'Gate ' + Ec.gate(c.dest).toFixed(1) + ' m · ' + (win.always ? 'entry at any tide'
      : win.nowOpen ? 'open until <b>' + U.hhmm(win.shut) + '</b>'
      : win.never ? '<b style="color:#ef5b5b">you draw too much</b>'
      : 'opens <b>' + U.hhmm(win.open) + '</b>–' + U.hhmm(win.shut)) + '<br>';
    s += '<span class="tagline' + (c.urgent ? ' hot' : '') + '">' + (c.urgent ? 'urgent' : 'standard') + '</span>';
    if (c.round) s += '<span class="tagline">return charter · ' + (c.ashore / 3600).toFixed(1) + ' h ashore</span>';
    if (c.fridge) s += '<span class="tagline' + (v.has('fridge') ? ' ok' : ' hot') + '">chilled</span>';
    if (c.sensitive) s += '<span class="tagline">condition matters</span>';
    if (c.risk > 0.35) s += '<span class="tagline hot">tricky entry</span>';
    s += '<span class="tagline ok">+' + U.money(c.fuelBonus) + ' under ' + c.fuelAllowance + ' L</span>';
    s += '</div>';
    s += '<div class="row">';
    if (action === 'accept') {
      s += '<button class="btn primary" data-accept="' + c.id + '"' + '>Accept</button>';
    } else {
      s += '<button class="btn primary" data-loadc="' + c.id + '"' + (ok ? '' : ' disabled') + '>Load aboard</button>';
      s += '<button class="btn danger" data-drop="' + c.id + '">Give back</button>';
    }
    s += '<button class="btn" data-wp="' + c.dest + '">Waypoint</button>';
    if (!canMass) s += '<span class="meta" style="color:#ef5b5b">over payload by ' + (c.mass - massLeft) + ' kg</span>';
    else if (!canVol) s += '<span class="meta" style="color:#ef5b5b">no room in the hold</span>';
    else if (needFridge) s += '<span class="meta" style="color:#ef5b5b">no refrigeration fitted</span>';
    s += '</div></div>';
    return s;
  }

  function tabHold(port, v, p) {
    var s = '<div class="card tight"><div class="kv">' +
      kv('Payload', v.cargoMass() + ' / ' + v.spec.max_payload_kg + ' kg') +
      kv('Volume', v.cargoVolume().toFixed(2) + ' / ' + v.spec.cargo_volume_m3 + ' m³') +
      kv('Draft now', v.draft().toFixed(2) + ' m (light ' + v.spec.base_draft_m.toFixed(2) + ')') +
      '</div><div class="bar"><i style="width:' + (v.cargoMass() / v.spec.max_payload_kg * 100).toFixed(0) + '%"></i></div></div>';
    if (!v.cargo.length) return s + '<div class="empty">The hold is empty.</div>';
    v.cargo.forEach(function (c, i) {
      var ct = p.contracts.filter(function (x) { return x.id === c.contract; })[0];
      var cd = D.CARGO[c.type];
      s += '<div class="card"><h3>' + U.esc(cd.name) + (ct ? ' → ' + U.esc(W.port(ct.dest).name) : '') +
        '<span class="fee">' + (ct ? U.money(ct.reward) : '') + '</span></h3><div class="meta">' +
        c.mass + ' kg · condition <b>' + Math.round(c.condition * 100) + '%</b>' +
        (ct ? '<br>Due ' + U.clockStr(ct.deadline) : '') + '</div>' +
        '<div class="bar"><i class="' + (c.condition < 0.6 ? 'bad' : c.condition < 0.85 ? 'warn' : '') +
        '" style="width:' + (c.condition * 100).toFixed(0) + '%"></i></div>' +
        (ct && ct.dest === port.id ? '' :
          '<div class="row"><button class="btn danger" data-unload="' + i + '">Unload here (abandon)</button></div>') +
        '</div>';
    });
    return s;
  }

  function tabShip(port, v, p) {
    var r = v.readout(), cap = v.fuelCapacity();
    var s = '<div class="card"><h3>' + U.esc(v.spec.name) + '</h3><div class="meta">' + U.esc(v.spec.blurb) + '</div>' +
      '<hr class="sep"><div class="kv">' +
      kv('LOA / LWL', v.spec.loa_m + ' / ' + v.spec.lwl_m + ' m') +
      kv('Beam', v.spec.beam_m + ' m') +
      kv('Draft light / now', v.spec.base_draft_m.toFixed(2) + ' / ' + v.draft().toFixed(2) + ' m') +
      kv('Displacement', (v.mass() / 1000).toFixed(2) + ' t loaded') +
      kv('Hull speed', v.hullSpeedKn.toFixed(1) + ' kn') +
      kv('Sail area', (v.spec.sail_area_main_m2 + v.spec.sail_area_headsail_m2) + ' m²') +
      kv('Engine', v.spec.engine_kw + ' kW · ' + v.engine.hours.toFixed(1) + ' h') +
      kv('Payload', v.spec.max_payload_kg + ' kg · ' + v.spec.cargo_volume_m3 + ' m³') +
      '</div></div>';

    /* fuel */
    var price = Ec.fuelPrice(port);
    if (!isFinite(p.money)) p.money = 0;
    s += '<div class="card"><h3>Fuel<span class="fee">' + (port.fuel ? U.money(price) + ' / L' : 'none here') + '</span></h3>' +
      '<div class="meta">Aboard <b>' + v.fuel.toFixed(1) + '</b> of ' + cap.toFixed(0) + ' L' +
      ' · at cruise about ' + (v.maxFuelFlow * 0.55).toFixed(1) + ' L/h' +
      ' → ' + (v.fuel / (v.maxFuelFlow * 0.55)).toFixed(1) + ' h motoring</div>' +
      '<div class="bar"><i style="width:' + (v.fuel / cap * 100).toFixed(0) + '%"></i></div>';
    if (port.fuel) {
      var full = Math.max(0, cap - v.fuel);
      s += '<div class="row">' +
        '<button class="btn" data-fuel="10"' + (full < 1 ? ' disabled' : '') + '>+10 L · ' + U.money(10 * price) + '</button>' +
        '<button class="btn" data-fuel="' + full.toFixed(1) + '"' + (full < 1 ? ' disabled' : '') + '>Fill · ' + U.money(full * price) + '</button>' +
        '</div>';
    }
    s += '</div>';

    /* condition */
    var q = Ec.repairQuote(v), tot = q.hull + q.rig + q.sails + q.engine + q.rudder;
    s += '<div class="card"><h3>Condition' + (port.yard ? '<span class="fee">' + U.money(tot) + ' to put right</span>' : '') + '</h3>';
    ['hull', 'rig', 'sails', 'engine', 'rudder'].forEach(function (k) {
      var d = v.damage[k];
      s += '<div class="meta">' + k[0].toUpperCase() + k.slice(1) + ' — ' + Math.round((1 - d) * 100) + '%' +
        (port.yard && q[k] > 0 ? ' · ' + U.money(q[k]) : '') + '</div>' +
        '<div class="bar"><i class="' + (d > 0.4 ? 'bad' : d > 0.15 ? 'warn' : '') + '" style="width:' +
        ((1 - d) * 100).toFixed(0) + '%"></i></div>';
    });
    if (port.yard && tot > 0) s += '<div class="row"><button class="btn primary" data-repair="1">Repair everything · ' + U.money(tot) + '</button></div>';
    else if (!port.yard) s += '<div class="meta" style="margin-top:6px">No boatyard here.</div>';
    s += '</div>';

    /* fitted equipment */
    s += '<div class="card"><h3>Fitted</h3><div class="meta">' +
      (v.equipment.length ? v.equipment.map(function (id) { return U.esc(D.equip(id).name); }).join(' · ') : 'Compass, log, echo sounder and a paper chart. That is all.') +
      '</div></div>';
    return s;
  }

  function tabYard(port, v, p) {
    var s = '';
    if (!port.chandler && !port.yard) return '<div class="empty">No chandler and no yard here.<br>Try Westhaven.</div>';
    s += '<h2>Chandlery</h2>';
    D.EQUIP.forEach(function (e) {
      var owned = v.has(e.id);
      var needs = e.needs && !v.has(e.needs);
      var afford = p.money >= e.price;
      s += '<div class="card tight"><h3>' + U.esc(e.name) + '<span class="fee">' +
        (owned ? 'fitted' : U.money(e.price)) + '</span></h3>' +
        '<div class="meta">' + U.esc(e.desc) + (needs ? '<br><b style="color:#ef5b5b">needs ' + U.esc(D.equip(e.needs).name) + '</b>' : '') + '</div>' +
        (owned ? '' : '<div class="row"><button class="btn primary" data-buy="' + e.id + '"' +
          (afford && !needs ? '' : ' disabled') + '>Buy and fit</button></div>') +
        '</div>';
    });
    if (port.yard) {
      s += '<h2>Your fleet</h2>';
      G.fleet.forEach(function (b, i) {
        var here = b.moored && U.len(b.x - port.x, b.y - port.y) < port.r * 2.2;
        var val = Ec.tradeIn(b);
        s += '<div class="card tight"><h3>' + U.esc(b.spec.name) + (i === G.active ? ' — aboard' : '') +
          '<span class="fee">' + U.money(val) + '</span></h3><div class="meta">' +
          (here ? 'Alongside here' : b.moored ? 'Moored at ' + U.esc(W.nearestPort(b.x, b.y).port.name)
                : b.anchor.down ? 'At anchor off ' + U.esc(W.nearestPort(b.x, b.y).port.name)
                : 'At sea, ' + U.nmStr(U.len(b.x - port.x, b.y - port.y)) + ' away') +
          ' · draft ' + b.draft().toFixed(2) + ' m · ' + b.cargo.length + ' in the hold' +
          '</div><div class="row">' +
          (i === G.active ? '' : '<button class="btn" data-board="' + i + '"' +
              (here ? '' : ' disabled') + '>Go aboard</button>') +
          (G.fleet.length > 1 && here && !b.cargo.length ?
              '<button class="btn danger" data-sell="' + i + '">Sell for ' + U.money(val) + '</button>' : '') +
          (b.cargo.length ? '<span class="meta">unload her before selling</span>' : '') +
          '</div></div>';
      });

      s += '<h2>Brokerage</h2>';
      D.VESSELS.forEach(function (sp) {
        var owned = G.fleet.filter(function (b) { return b.spec.id === sp.id; }).length;
        var afford = p.money >= sp.price;
        var tin = Ec.tradeIn(v), swap = sp.price - tin;
        s += '<div class="card"><h3>' + U.esc(sp.name) + '<span class="fee">' + U.money(sp.price) + '</span></h3>' +
          '<div class="meta">' + U.esc(sp.blurb) + '<br>' +
          sp.loa_m.toFixed(2) + ' m · draft <b>' + sp.base_draft_m.toFixed(2) + ' m</b>' +
          (sp.bilge ? ' (bilge keels — dries out upright)' : '') + ' · ' +
          sp.max_payload_kg + ' kg · ' + sp.cargo_volume_m3 + ' m³ · ' +
          sp.fuel_capacity_l + ' L · ' + sp.engine_kw + ' kW · hull speed ' +
          (1.34 * Math.sqrt(sp.lwl_m * U.FT)).toFixed(1) + ' kn' +
          (owned ? '<br><b>You own ' + owned + '</b>' : '') + '</div>' +
          '<div class="row">' +
          '<button class="btn primary" data-buy-v="' + sp.id + '"' + (afford ? '' : ' disabled') +
            '>Buy outright ' + U.money(sp.price) + '</button>' +
          (G.fleet.length === 1 && v.spec.id !== sp.id && !v.cargo.length ?
            '<button class="btn" data-swap-v="' + sp.id + '"' + (p.money >= swap ? '' : ' disabled') +
            '>Trade in ' + U.esc(v.spec.name) + (swap > 0 ? ' (+' + U.money(swap) + ')' : ' (get ' + U.money(-swap) + ')') + '</button>' : '') +
          '</div></div>';
      });
    }
    return s;
  }

  /* ---- port button wiring ---- */
  function wirePort() {
    var v = G.vessel, p = G.player, port = G.atPort;
    function q(sel, fn) {
      Array.prototype.forEach.call(el.portBody.querySelectorAll(sel), function (b) { b.onclick = function () { fn(b); }; });
    }
    q('[data-accept]', function (b) {
      var c = Ec.offers(port, p).filter(function (x) { return x.id === b.dataset.accept; })[0];
      if (!c) return;
      c.issued = E.t;
      p.contracts.push(c);
      S.Edu.onEvent('accept', p, UI);
      if (Ec.gate(c.dest) < 1.2) S.Edu.onEvent('gate', p, UI);
      Ec.invalidate();
      UI.renderPort();
    });
    q('[data-drop]', function (b) {
      p.contracts = p.contracts.filter(function (x) { return x.id !== b.dataset.drop; });
      p.reputation = U.clamp(p.reputation - 1, 0, 100);
      UI.renderPort();
    });
    q('[data-loadc]', function (b) {
      var c = p.contracts.filter(function (x) { return x.id === b.dataset.loadc; })[0];
      if (!c) return;
      v.cargo.push({ type: c.type, mass: c.mass, volume: c.volume, condition: 1,
                     contract: c.id, fuelStart: v.fuel });
      UI.toast('Loaded', D.CARGO[c.type].name + ' — ' + c.mass + ' kg aboard');
      UI.renderPort();
    });
    q('[data-unload]', function (b) {
      var i = +b.dataset.unload, item = v.cargo[i];
      if (!item) return;
      var c = p.contracts.filter(function (x) { return x.id === item.contract; })[0];
      v.cargo.splice(i, 1);
      if (c) {
        p.contracts = p.contracts.filter(function (x) { return x.id !== c.id; });
        p.reputation = U.clamp(p.reputation - 4, 0, 100);
        UI.toast('Abandoned', 'Contract given up — reputation suffers');
      }
      UI.renderPort();
    });
    q('[data-wp]', function (b) {
      var d = W.port(b.dataset.wp);
      G.vessel.waypoint = { x: d.x, y: d.y };
      UI.toast('Waypoint', 'Set on ' + d.name + ' — bearing shown on the compass');
    });
    q('[data-fuel]', function (b) {
      var litres = +b.dataset.fuel, price = Ec.fuelPrice(port);
      litres = Math.min(litres, v.fuelCapacity() - v.fuel, p.money / price);
      if (!isFinite(litres) || litres <= 0.05) { UI.toast('Fuel', 'Not enough money'); return; }
      v.fuel = Math.min(v.fuelCapacity(), v.fuel + litres);
      p.money = Math.round((p.money - litres * price) * 100) / 100;
      UI.renderPort();
    });
    q('[data-repair]', function () {
      var qt = Ec.repairQuote(v), tot = qt.hull + qt.rig + qt.sails + qt.engine + qt.rudder;
      if (p.money < tot) { UI.toast('Yard', 'You cannot pay for that yet'); return; }
      p.money -= tot;
      v.damage = { hull: 0, rig: 0, sails: 0, engine: 0, rudder: 0 };
      UI.toast('Yard', 'All repairs completed');
      UI.renderPort();
    });
    q('[data-buy]', function (b) {
      var e = D.equip(b.dataset.buy);
      if (!e || p.money < e.price || v.has(e.id)) return;
      p.money -= e.price; v.equipment.push(e.id);
      if (e.id === 'gps') { p.everFixed = true; v.dr.x = v.x; v.dr.y = v.y; }
      UI.toast('Fitted', e.name);
      UI.renderPort();
    });
    q('[data-board]', function (b) {
      var i = +b.dataset.board;
      UI.hidePort(); G.atPort = null;
      G.setActive(i);
      var np = W.nearestPort(G.vessel.x, G.vessel.y);
      if (G.vessel.moored && np.dist < np.port.r * 2.2) UI.showPort(np.port, null);
      else UI.renderPort();
    });
    q('[data-sell]', function (b) {
      var i = +b.dataset.sell, boat = G.fleet[i];
      if (!boat || G.fleet.length < 2 || boat.cargo.length) return;
      var val = Ec.tradeIn(boat);
      p.money = Math.round((p.money + val) * 100) / 100;
      G.fleet.splice(i, 1);
      G.setActive(U.clamp(G.active > i ? G.active - 1 : Math.min(G.active, G.fleet.length - 1), 0, G.fleet.length - 1), true);
      UI.toast('Brokerage', boat.spec.name + ' sold for ' + U.money(val));
      UI.renderPort();
    });
    q('[data-buy-v]', function (b) {
      var sp = D.vessel(b.dataset['buyV']);
      if (!sp || p.money < sp.price) return;
      p.money = Math.round((p.money - sp.price) * 100) / 100;
      var nv = new S.Vessel(sp.id);
      nv.hdg = v.hdg;
      nv.mooredTo(port.x, port.y);
      nv.dr.x = port.x; nv.dr.y = port.y;
      nv.fuel = nv.fuelCapacity() * 0.2;
      G.addVessel(nv);
      UI.toast('Brokerage', sp.name + ' is yours — she is alongside');
      UI.renderPort();
    });
    q('[data-swap-v]', function (b) {
      var sp = D.vessel(b.dataset['swapV']), cost = sp.price - Ec.tradeIn(v);
      if (!sp || p.money < cost || v.cargo.length) return;
      p.money = Math.round((p.money - cost) * 100) / 100;
      var nv = new S.Vessel(sp.id);
      nv.equipment = v.equipment.slice();
      nv.derive();
      nv.fuel = Math.min(v.fuel, nv.fuelCapacity());
      nv.hdg = v.hdg;
      nv.mooredTo(port.x, port.y);
      nv.dr.x = port.x; nv.dr.y = port.y;
      G.fleet[G.active] = nv;
      G.setActive(G.active, true);
      UI.toast('Brokerage', 'Traded in — she is yours, ' + sp.name);
      UI.renderPort();
    });
  }


  /* ================= ground tackle & fleet panels ================= */
  function bindAnchor() {
    on(el.btnAnchor, 'click', function () { UI.toggleAnchor(); });
    on(el.btnFleet, 'click', function () {
      var open = el.fleetPanel.classList.contains('hidden');
      el.fleetPanel.classList.toggle('hidden', !open);
      el.anchorPanel.classList.add('hidden');
      if (open) UI.renderFleet();
    });
  }
  UI.toggleAnchor = function () {
    var open = el.anchorPanel.classList.contains('hidden');
    el.anchorPanel.classList.toggle('hidden', !open);
    el.fleetPanel.classList.add('hidden');
    if (open) UI.renderAnchor();
  };

  UI.renderAnchor = function () {
    if (el.anchorPanel.classList.contains('hidden')) return;
    var v = G.vessel, a = v.anchor;
    var depth = W.getChartedDepth(v.x, v.y) + E.tideHeight(v.x, v.y);
    var h = '<h4>Ground tackle<span class="meta">' + Math.round(v.chainTotal) + ' m chain</span></h4>';
    if (v.moored) {
      h += '<div class="verdict">She is alongside. Slip your lines first.</div>';
    } else if (!a.down) {
      var maxD = v.maxAnchorDepth();
      h += '<div class="kv"><span>Depth here</span><span>' + depth.toFixed(1) + ' m</span>' +
           '<span>Bottom</span><span>' + W.getBottom(v.x, v.y) + '</span>' +
           '<span>Deepest you can anchor</span><span>' + maxD.toFixed(0) + ' m</span>' +
           '<span>Speed</span><span>' + (v.sog * U.MS2KN).toFixed(1) + ' kn</span></div>';
      h += depth > maxD ? '<div class="verdict bad">Too deep for the chain you carry.</div>'
         : v.sog > 1.6 * U.KN ? '<div class="verdict warn">Take the way off her before you let go.</div>'
         : '<div class="verdict good">Good holding ground, and room to swing.</div>';
      h += '<div class="row"><button class="btn primary" id="ancDrop"' +
           (depth > maxD || v.sog > 1.6 * U.KN ? ' disabled' : '') + '>Let go</button></div>';
    } else {
      var sr = v.swingRoom();
      var scope = a.scope || 0;
      h += '<div class="kv">' +
        '<span>Chain veered</span><span>' + Math.round(a.veer) + ' / ' + Math.round(v.chainTotal) + ' m</span>' +
        '<span>Depth to bow roller</span><span>' + a.depth.toFixed(1) + ' m</span>' +
        '<span>Scope</span><span>' + scope.toFixed(1) + ' : 1</span>' +
        '<span>Bottom</span><span>' + W.getBottom(a.x, a.y) + '</span>' +
        '<span>Swinging radius</span><span>' + Math.round(sr.radius) + ' m</span>' +
        '<span>Low water ' + U.hhmm(sr.lwTime) + '</span><span>' + sr.lowWater.toFixed(1) + ' m</span>' +
        '<span>Shallowest in the circle</span><span>' + sr.shallowest.toFixed(1) + ' m</span>' +
        '</div>';
      h += scope < 3 ? '<div class="verdict bad">Scope too short — she will drag. Veer more chain.</div>'
         : scope < 4.5 ? '<div class="verdict warn">Fair weather scope only.</div>'
         : '<div class="verdict good">Good scope. She should hold.</div>';
      if (sr.clearance < 0) h += '<div class="verdict bad">She will take the ground at low water — ' +
        Math.abs(sr.clearance).toFixed(1) + ' m short.</div>';
      else if (sr.clearance < 0.6) h += '<div class="verdict warn">Only ' + sr.clearance.toFixed(1) +
        ' m under the keel at low water.</div>';
      if (a.dragging > 0.3) h += '<div class="verdict bad">DRAGGING</div>';
      else if (a.set > 0.7) h += '<div class="verdict good">Well dug in.</div>';
      if (a.weighing > 0) h += '<div class="verdict">Weighing — ' + Math.ceil(a.weighing) + ' s</div>';
      h += '<div class="row">' +
        '<button class="btn" id="ancVeer">Veer 5 m</button>' +
        '<button class="btn" id="ancShort">Shorten 5 m</button>' +
        '<button class="btn primary" id="ancUp">Weigh</button></div>';
    }
    el.anchorPanel.innerHTML = h;
    var b;
    if ((b = document.getElementById('ancDrop'))) b.onclick = function () { G.dropAnchor(); };
    if ((b = document.getElementById('ancUp'))) b.onclick = function () { G.weighAnchor(); };
    if ((b = document.getElementById('ancVeer'))) b.onclick = function () { G.vessel.veerChain(5); UI.renderAnchor(); };
    if ((b = document.getElementById('ancShort'))) b.onclick = function () { G.vessel.veerChain(-5); UI.renderAnchor(); };
  };

  UI.renderFleet = function () {
    var h = '<h4>Your fleet<span class="meta">TAB to change</span></h4>';
    G.fleet.forEach(function (b, i) {
      var where = b.moored ? 'alongside ' + W.nearestPort(b.x, b.y).port.name
        : b.anchor.down ? 'at anchor'
        : (b.sog * U.MS2KN).toFixed(1) + ' kn ' + U.brgStr(b.cog);
      h += '<div class="fleet-row"><div><b>' + U.esc(b.spec.name) + '</b>' +
        (i === G.active ? ' <span class="tagline ok">aboard</span>' : '') +
        '<div class="meta">' + U.esc(where) + (b.cargo.length ? ' · ' + b.cargo.length + ' aboard' : '') +
        (b.grounded ? ' · <b style="color:#ef5b5b">AGROUND</b>' : '') + '</div></div>' +
        (i === G.active ? '' : '<button class="btn" data-go="' + i + '">Board</button>') + '</div>';
    });
    if (G.fleet.length < 2) h += '<div class="meta" style="margin-top:6px">Buy a second boat at the Westhaven yard and you can run two contracts at once.</div>';
    el.fleetPanel.innerHTML = h;
    Array.prototype.forEach.call(el.fleetPanel.querySelectorAll('[data-go]'), function (btn) {
      btn.onclick = function () {
        if (!G.canLeave(G.vessel)) {
          UI.alert('You cannot walk away from her — moor, anchor, or set the autopilot', 3000, 'warn');
          return;
        }
        G.setActive(+btn.dataset.go); UI.renderFleet();
      };
    });
  };

  UI.setMoor = function (show, text, mode) {
    el.btnMoor.classList.toggle('hidden', !show);
    if (show && text) el.btnMoor.textContent = text;
    el.btnMoor.dataset.mode = mode || 'moor';
    el.btnMoor.classList.toggle('slip', mode === 'slip');
  };

  UI.syncControls = function (v) {
    el.sheetMain.value = Math.round(v.mainSheet);
    el.sheetJib.value = Math.round(v.jibSheet);
    el.throttle.value = Math.round(v.engine.throttle * 100);
    Array.prototype.forEach.call(document.querySelectorAll('.gear'), function (o) {
      o.classList.toggle('on', +o.dataset.gear === v.engine.gear);
    });
  };

})(window.SCS);
