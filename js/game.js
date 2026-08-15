/* game.js — the loop, save data, and everything that ties the systems together.
   (SDD §4 update model, §49 save data) */
(function (S) {
  'use strict';
  var U = S.U, W = S.World, E = S.Env, D = S.DATA, Ec = S.Econ, R = S.Render,
      C = S.Chart, I = S.Inst, UI = S.UI, Edu = S.Edu;
  var G = S.Game = {};

  var PHYS_HZ = 20, PHYS_DT = 1 / PHYS_HZ;
  var SAVE_KEY = 'ohhship.save.v2';
  var RATES = [1, 8, 30];

  G.rate = 1;
  G.atPort = null;
  G.autoTack = null;
  G.settings = { springHelm: false, hints: true };
  G.player = null;
  G.vessel = null;          // always points at G.fleet[G.active]
  G.fleet = [];
  G.active = 0;

  var acc = 0, envAcc = 0, instAcc = 0, secAcc = 0, wakeAcc = 0, lastT = 0, animT = 0, bgTick = 0;

  /* ===================== new game / save ===================== */
  /* starting budgets (§35) — how much cash you begin with, on top of the boat */
  G.STARTS = [
    { id: 'hard',   name: 'Working skipper', money: 600,   rep: 15,
      desc: 'One tired Centaur and enough for a tank of diesel. Every job counts.' },
    { id: 'normal', name: 'Modest savings',  money: 4500,  rep: 20,
      desc: 'The boat, and enough put by for instruments or a bad week.' },
    { id: 'rich',   name: 'Family money',    money: 26000, rep: 25,
      desc: 'Buy a second boat on day one and run two contracts at once.' }
  ];
  G.startChoice = 'normal';

  function blankPlayer(start) {
    start = start || G.STARTS[1];
    return {
      version: 2, seed: (Math.random() * 1e9) | 0,
      money: start.money, reputation: start.rep, start: start.id,
      unlocked: [], done: [], contracts: [],
      everFixed: false,
      stats: { jobs: 0, lateJobs: 0, earned: 0, groundings: 0, tacks: 0 }
    };
  }

  G.newGame = function (startId) {
    localStorage.removeItem(SAVE_KEY);
    var start = G.STARTS.filter(function (x) { return x.id === startId; })[0] || G.STARTS[1];
    G.startChoice = start.id;
    G.player = blankPlayer(start);
    E.t = 6.2 * 3600;
    var home = W.port('westhaven');
    var v = new S.Vessel('centaur');
    v.hdg = U.rad(180);
    v.mooredTo(home.x, home.y);
    v.dr.x = home.x; v.dr.y = home.y;
    v.fuel = v.fuelCapacity() * 0.45;
    G.fleet = [v]; G.active = 0;
    G.setActive(0);
    R.clearWake();
    Ec.invalidate();
    UI.showPort(home, null);
    UI.toast('Westhaven', 'Take a contract, load it, then cast off and slip your lines.');
  };

  /** step aboard one of your own boats */
  G.setActive = function (i, silent) {
    if (i < 0 || i >= G.fleet.length) return false;
    var v = G.fleet[i];
    G.active = i; G.vessel = v;
    if (G.player) G.player.payload = v.spec.max_payload_kg;
    Ec.invalidate();
    R.cam.x = v.x; R.cam.y = v.y;
    R.clearWake();
    UI.syncControls(v);
    if (!silent) UI.toast('Aboard', v.spec.name + (v.moored ? ' — alongside' : ''));
    return true;
  };

  /** can she be left to look after herself? (§31 — an autopilot is not a crew) */
  G.canLeave = function (v) {
    if (v.moored) return true;
    if (v.anchor.down && !v.anchor.dragging) return true;
    if (v.has('autopilot') && v.autopilot.on) return true;
    return false;
  };

  G.nextVessel = function () {
    if (G.fleet.length < 2) return;
    if (!G.canLeave(G.vessel)) {
      UI.alert('You cannot walk away from her — moor, anchor, or set the autopilot', 3000, 'warn');
      return;
    }
    G.setActive((G.active + 1) % G.fleet.length);
  };

  G.addVessel = function (v) { G.fleet.push(v); return G.fleet.length - 1; };

  G.save = function () {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: 3, t: E.t, player: G.player,
        fleet: G.fleet.map(function (v) { return v.save(); }), active: G.active,
        atPort: G.atPort ? G.atPort.id : null,
        settings: G.settings
      }));
      return true;
    } catch (e) { return false; }
  };

  G.load = function () {
    var raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      var s = JSON.parse(raw);
      if (s.version !== 3) return false;
      G.player = s.player;
      if (!G.player.stats) G.player.stats = { jobs: 0, lateJobs: 0, earned: 0, groundings: 0, tacks: 0 };
      if (!isFinite(G.player.money)) G.player.money = 0;
      E.t = s.t;
      G.fleet = (s.fleet || []).map(function (o) {
        var vv = S.Vessel.load(o);
        if (vv.moored) vv.mooredTo(vv.mx || vv.x, vv.my || vv.y);
        vv.sane();
        return vv;
      });
      if (!G.fleet.length) return false;
      G.active = U.clamp(s.active | 0, 0, G.fleet.length - 1);
      G.setActive(G.active, true);
      if (s.settings) G.settings = s.settings;
      if (s.atPort) UI.showPort(W.port(s.atPort), null);
      return true;
    } catch (e) { return false; }
  };

  /* ===================== mooring & delivery (§35) ===================== */
  G.MOOR_SPEED = 1.2 * U.KN;      // you must take the way off her to make fast
  G.tryMoor = function () {
    var v = G.vessel, np = W.nearestPort(v.x, v.y);
    if (np.dist > np.port.r * 2.0) return;
    if (v.sog > G.MOOR_SPEED) {
      UI.alert('Too fast alongside — ' + (v.sog * U.MS2KN).toFixed(1) + ' kn. Take the way off her.', 2600, 'warn');
      Edu.unlock(G.player, 'rudder_low_speed', UI);
      return;
    }
    var port = np.port;
    v.heel = 0;
    v.mooredTo(port.x, port.y);
    v.dr.x = port.x; v.dr.y = port.y; v.dr.err = 0;
    v.engine.gear = 0; v.engine.throttle = 0;
    v.hoistMain(false); v.setJib(0);
    v.mainHoist = 0; v.jibOut = 0;
    G.player.everFixed = true;
    Edu.onEvent('moor', G.player, UI);
    R.clearWake();

    /* deliver anything bound for here */
    var fee = Ec.berthFee(port, v);
    var report = { port: port.name, items: [], total: 0, fee: fee };
    for (var i = v.cargo.length - 1; i >= 0; i--) {
      var item = v.cargo[i];
      var c = G.player.contracts.filter(function (x) { return x.id === item.contract; })[0];
      if (!c || c.dest !== port.id) continue;
      /* a return charter pays half here, and the passengers go ashore */
      if (c.round && c.stage === 1) {
        var land = Ec.landPassengers(G.player, c);
        report.items.push({ name: D.CARGO[item.type].name + ' — landed ashore', pay: land.paid, rep: 0,
          notes: ['They will be back aboard at ' + U.hhmm(land.back) +
                  ', for the run home to ' + W.port(c.homePort).name] });
        report.total += land.paid;
        item.ashore = true;
        continue;
      }
      if (c.round && c.stage === 2 && E.t < (c.notBefore || 0)) {
        report.items.push({ name: D.CARGO[item.type].name, pay: 0, rep: 0,
          notes: ['Your passengers are not due back aboard until ' + U.hhmm(c.notBefore)] });
        continue;
      }
      var res = Ec.deliver(G.player, v, c, item);
      report.items.push({ name: D.CARGO[item.type].name, pay: res.pay, rep: res.rep, notes: res.notes });
      report.total += res.pay;
      v.cargo.splice(i, 1);
      G.player.contracts = G.player.contracts.filter(function (x) { return x.id !== c.id; });
    }
    G.player.money = Math.round((G.player.money - fee) * 100) / 100;
    Ec.invalidate();
    UI.setMoor(false);
    UI.showPort(port, report);
    G.save();
  };

  G.castOff = function () {
    UI.hidePort();
    G.atPort = null;
    G.rate = 1;
    if (G.vessel.moored && G.settings.hints)
      UI.toast('Alongside', 'Lines are still on. Start the engine or hoist sail, then slip them.');
    G.save();
  };

  /** let go the warps (§48 — leaving the berth is the first thing you learn) */
  G.slipLines = function () {
    var v = G.vessel;
    if (!v.slipLines()) return;
    UI.setMoor(false);
    UI.toast('Lines slipped', v.engine.running || v.sailArea().total > 0.5 ?
      'You have the boat' : 'Nothing set and no engine — you are drifting');
    S.Edu.onEvent('moor', G.player, UI);
  };

  /* ---------- ground tackle (§56) ---------- */
  G.dropAnchor = function () {
    var v = G.vessel, r = v.dropAnchor();
    if (r === 'deep') UI.alert('Too deep to anchor — you carry ' + Math.round(v.chainTotal) + ' m of chain', 2800, 'warn');
    else if (r === 'fast') UI.alert('Too much way on — stop her first', 2400, 'warn');
    else if (r === 'ok') {
      UI.toast('Anchor', 'Let go — ' + Math.round(v.anchor.veer) + ' m of chain veered');
      Edu.unlock(G.player, 'anchoring', UI);
      var sr = v.swingRoom();
      if (sr && sr.clearance < 0.6) Edu.unlock(G.player, 'swinging', UI);
    }
    UI.renderAnchor();
  };
  G.weighAnchor = function () {
    if (G.vessel.weighAnchor()) UI.toast('Anchor', 'Weighing — heaving in the chain');
    UI.renderAnchor();
  };

  G.cycleRate = function () {
    var i = RATES.indexOf(G.rate);
    G.rate = RATES[(i + 1) % RATES.length];
  };

  G.fix = function () {
    var v = G.vessel;
    if (v.has('gps')) { UI.toast('GPS', 'Position is continuous — no fix needed'); return; }
    var r = v.fixPosition();
    if (r) { G.player.everFixed = true; UI.toast('Fix', 'Position fixed on ' + r); }
    else UI.alert('Nothing close enough to fix on', 2200, 'warn');
  };

  /* ===================== hazard monitoring ===================== */
  function hazards(v) {
    if (v.moored) {
      var driving = (v.engine.running && v.engine.gear !== 0) || v.sailArea().total > 0.5;
      if (driving) UI.persistentAlert('lines', 'LINES STILL ON — press “Slip lines”', 'warn');
      return;
    }
    if (v.anchor.dragging > 0.5) UI.persistentAlert('drag', 'ANCHOR DRAGGING', '');
    if (v.grounded) {
      var ti = E.tideInfo(v.x, v.y);
      UI.persistentAlert('ground', 'AGROUND on ' + v.bottomType + ' — tide ' +
        (ti.rising ? 'rising, wait or motor astern' : 'FALLING, get off now'), '');
    } else if (v.ukc < 0.5) UI.persistentAlert('shallow', 'SHALLOW — ' + v.ukc.toFixed(1) + ' m under the keel', '');
    else if (v.ukc < 1.2) UI.persistentAlert('shallow', 'Shoaling — ' + v.ukc.toFixed(1) + ' m clearance', 'warn');
    if (v.fuel / v.fuelCapacity() < 0.12 && v.engine.running) UI.persistentAlert('fuel', 'FUEL LOW — ' + v.fuel.toFixed(1) + ' L', 'warn');
    if (v.engine.temp > 100) UI.persistentAlert('temp', 'ENGINE OVERHEATING', '');
    if (Math.abs(U.deg(v.heel)) > 28) UI.persistentAlert('heel', 'OVERPOWERED — ease sheets or reef', 'warn');
    if (v.damage.hull > 0.75) UI.persistentAlert('hull', 'HULL DAMAGE — make for a yard', '');
    var wx = E.weather();
    if (wx.visibility < 900) UI.persistentAlert('fog', 'FOG — visibility under half a mile', 'info');
  }

  /* ===================== per-second logic ===================== */
  var wasGrounded = false, hintStage = 0;
  function everySecond(v, dt) {
    if (!isFinite(G.player.money)) { console.warn('money repaired'); G.player.money = 0; }
    if (!isFinite(G.player.reputation)) G.player.reputation = 20;
    if (v.gybeShock) {
      UI.toast('Crash gybe', 'The boom came across hard — check the rig' +
        (v.damage.rig > 0.5 ? '. That did real damage.' : '.'));
      Edu.unlock(G.player, 'gybing', UI);
      v.gybeShock = 0;
    }
    if (v.dismasted) {
      v.dismasted = false;
      UI.toast('Rig failure', 'The rig has let go. Sails are down — you are on the engine now.');
      G.player.reputation = U.clamp(G.player.reputation - 2, 0, 100);
    }
    if (v.overloaded > 0.35) UI.persistentAlert('overload', 'TOO MUCH SAIL — she is being damaged', '');
    if (v.startFailed) {
      UI.alert(v.startFailed === 'fuel' ? 'NO FUEL — she will not start' : 'She will not fire — the engine needs work',
               2600, 'warn');
      v.startFailed = null;
    }
    Edu.observe(dt, v, G.player, G.settings.hints ? UI : null);
    hazards(v);

    if (v.grounded && !wasGrounded) {
      G.player.stats.groundings++;
      var lt = v.lastTouch || {};
      UI.toast('Aground', 'Touched ' + (lt.bottom || 'bottom') + ' at ' + ((lt.speed || 0) * U.MS2KN).toFixed(1) + ' kn' +
        (lt.dmg > 0.02 ? ' — hull damaged' : ' — no damage'));
    }
    wasGrounded = v.grounded;

    /* sinking */
    if (v.damage.hull >= 1) {
      UI.toast('Salvage', 'She was towed in and the cargo written off. £900 for the tow.');
      G.player.money -= 900;
      G.player.reputation = U.clamp(G.player.reputation - 8, 0, 100);
      v.cargo.forEach(function (item) {
        G.player.contracts = G.player.contracts.filter(function (x) { return x.id !== item.contract; });
      });
      v.cargo = [];
      v.damage.hull = 0.6;
      var home = W.port('westhaven');
      v.x = home.x; v.y = home.y; v.vx = v.vy = 0; v.fuel = Math.min(v.fuel, 5);
      UI.showPort(home, null);
    }

    /* overdue contracts still aboard */
    G.player.contracts.forEach(function (c) {
      if (E.t > c.deadline && !c._warned) {
        c._warned = true;
        UI.toast('Overdue', D.CARGO[c.type].name + ' for ' + W.port(c.dest).name + ' is now late');
      }
    });

    /* the boats you are not aboard still need watching (§37) */
    for (var fi = 0; fi < G.fleet.length; fi++) {
      var bv = G.fleet[fi];
      if (bv === v) continue;
      if (bv.grounded && !bv._toldAground) {
        bv._toldAground = true;
        UI.toast(bv.spec.name, 'She has gone aground while you were away');
        G.player.stats.groundings++;
      }
      if (!bv.grounded) bv._toldAground = false;
      if (bv._arrived) { bv._arrived = false; UI.toast(bv.spec.name, 'She has reached her waypoint'); }
      if (bv.anchor.dragging > 0.6 && !bv._toldDrag) {
        bv._toldDrag = true; UI.toast(bv.spec.name, 'Her anchor is dragging');
      }
      if (bv.anchor.dragging < 0.2) bv._toldDrag = false;
    }

    /* gentle first-run guidance */
    if (G.settings.hints && !G.atPort) {
      if (hintStage === 0 && v.sailArea().total < 0.5 && !v.engine.running) {
        UI.toast('Getting under way', 'Start the engine (E) to leave the berth, or hoist sail with M and J');
        hintStage = 1;
      } else if (hintStage === 1 && v.sailArea().total > 0.5) {
        UI.toast('Sail trim', 'Ease the sheet until the sail flaps, then pull in until it stops');
        hintStage = 2;
      }
    }
  }

  /* ===================== helm input ===================== */
  function helmInput(v, dt) {
    var k = UI.keys || {};
    var left = k['a'] || k['arrowleft'], right = k['d'] || k['arrowright'];
    if (left || right) {
      v.rudderCmd = U.clamp(v.rudderCmd + (right ? 1 : -1) * 55 * dt, -35, 35);
      v.autopilot.on = false;
    } else if (G.settings.springHelm) v.rudderCmd = U.approach(v.rudderCmd, 0, 45, dt);
    if (k['w'] || k['arrowup']) v.engine.throttle = U.clamp(v.engine.throttle + dt * 0.6, 0, 1);
    if (k['s'] || k['arrowdown']) v.engine.throttle = U.clamp(v.engine.throttle - dt * 0.6, 0, 1);

    /* assisted tack or gybe: hold the helm over until she comes round */
    if (G.autoTack) {
      var at = G.autoTack;
      if (at.age === undefined) at.age = 0;
      at.age += dt;
      var finish = function () { G.autoTack = null; v.rudderCmd = 0; };
      var d = U.angDiff(at.target, v.hdg);
      if (Math.abs(U.deg(d)) < 8 || (!at.gybe && Math.abs(v.awa) > 150)) {
        finish();
      } else if (at.age > 45) {
        finish();
        UI.toast('In irons', 'She would not come round. Bear away, get some speed, and try again.');
        Edu.unlock(G.player, 'tacking', UI);
      } else v.rudderCmd = U.clamp(U.deg(d) * 2.5, -32, 32);
    }
  }

  /* ===================== main loop ===================== */
  function loop(now) {
    requestAnimationFrame(loop);
    var real = Math.min(0.1, (now - lastT) / 1000 || 0);
    lastT = now;
    animT += real;
    var v = G.vessel;
    if (!v) return;

    var inPort = !!G.atPort;
    var rate = inPort ? 0 : G.rate;

    /* safety: no fast-forwarding into danger */
    if (rate > 1 && (v.ukc < 2.0 || v.grounded)) { G.rate = 1; rate = 1; }

    if (!inPort) {
      helmInput(v, real);
      v.pilotStep(real);
      acc += real * rate;
      var steps = 0;
      while (acc >= PHYS_DT && steps < 90) {
        v.step(PHYS_DT);
        /* the rest of the fleet keeps sailing while you are not aboard (§37) */
        bgTick++;
        if (bgTick % 2 === 0) {
          for (var bi = 0; bi < G.fleet.length; bi++) {
            var bv = G.fleet[bi];
            if (bv === v || bv.moored) continue;
            bv.pilotStep(PHYS_DT * 2);
            bv.step(PHYS_DT * 2);
          }
        }
        E.advance(PHYS_DT);
        acc -= PHYS_DT; steps++;
      }
      if (acc > 1) acc = 0;

      envAcc += real * rate;
      if (envAcc > 0.2) { G.fleet.forEach(function (b) { b.envRefresh(); }); envAcc = 0; }

      secAcc += real * rate;
      if (secAcc >= 1) { everySecond(v, secAcc); secAcc = 0; }

      wakeAcc += real;
      if (wakeAcc > 0.22) { R.pushWake(v); wakeAcc = 0; }

      R.follow(v, real);

      /* the one button that matters: make fast, or let go */
      if (v.moored) UI.setMoor(true, 'Slip lines', 'slip');
      else {
        var np = W.nearestPort(v.x, v.y);
        var near = np.dist < np.port.r * 2.0;
        UI.setMoor(near, near && v.sog > G.MOOR_SPEED ?
          'Slow down to moor (' + (v.sog * U.MS2KN).toFixed(1) + ' kn)' : 'Moor at ' + np.port.name, 'moor');
      }
    } else {
      E.advance(real * 60);        // time passes while you do business ashore
      UI.renderPortTick();
    }

    /* render */
    R.frame(v, animT, { showStream: C.showStream, waypoint: v.waypoint, fleet: G.fleet });
    instAcc += real;
    if (instAcc > 0.1) {
      I.frame(v, G.player, UI.bearingToWp());
      UI.hud(v, G.player);
      instAcc = 0;
    }
    UI.tickAlerts();
    if (!document.getElementById('chartView').classList.contains('hidden')) {
      var known = v.has('gps');
      if (C.follow) C.centreOn(known ? v.x : v.dr.x, known ? v.y : v.dr.y);
      C.frame(v, G.player);
      UI.chartHud(v, G.player);
    }
  }

  /* the port screen needs the clock to keep moving */
  var portTick = 0;
  UI.renderPortTick = function () {
    portTick++;
    if (portTick % 45 === 0) {
      UI.hud(G.vessel, G.player);
      if (UI.portTab === 'jobs') UI.renderPort();
    }
  };

  /* ===================== boot ===================== */
  G.init = function () {
    W.build();
    R.init(document.getElementById('world'));
    C.init(document.getElementById('chartCanvas'));
    I.init(document.getElementById('instruments'));
    UI.init(G);
    if (!G.load()) G.newGame();
    UI.syncControls(G.vessel);
    window.addEventListener('resize', function () { R.resize(); C.resize(); I.resize(); });
    setInterval(function () { if (!G.atPort) G.save(); }, 30000);
    lastT = performance.now();
    requestAnimationFrame(loop);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', G.init);
  else G.init();

})(window.SCS);
