/* coach.js — context help, the trim coach, and the first-passage tutorial.
   (SDD §3 Education: Context Help; §48 Tutorial Design)
   education.js only watches and unlocks pages; this module is allowed to ACT:
   it advises on trim in plain words, and it walks a brand-new skipper through
   the first delivery as a sequence of observed steps — no lesson screens. */
(function (S) {
  'use strict';
  var U = S.U, W = S.World, E = S.Env, D = S.DATA;
  var Coach = S.Coach = {};

  /* ---- how much help the crew gives (§47) ----
     Every mode sails the same physics; the presets only change information. */
  var AIDS = {
    assisted: { autotrim: true,  bands: true,  coachAuto: true,  reefHint: true,  fcQuality: 1 },
    standard: { autotrim: false, bands: true,  coachAuto: true,  reefHint: false, fcQuality: 1 },
    sim:      { autotrim: false, bands: false, coachAuto: false, reefHint: false, fcQuality: 0 }
  };
  Coach.aid = function (name) {
    var mode = (S.Game && S.Game.settings && S.Game.settings.assist) || 'standard';
    return (AIDS[mode] || AIDS.standard)[name];
  };

  /* ================= trim advice ================= */
  /** one plain-words line per sail, from the physics' own classification */
  function advice(which, st, v) {
    switch (st.trim) {
      case 'stowed': return which === 'Main' ? 'Stowed.' : null;
      case 'furled': return 'Furled.';
      case 'backed':
        return 'Backed — the wind is pressing it the wrong way. Ease it across to the other side' +
               (which === 'Jib' ? ', unless you are backing it on purpose to turn the bow' : '') + '.';
      case 'flogging':
        return 'Flogging — no drive at all, and it is wearing the cloth out. Sheet in, or bear away.';
      case 'luffing':
        return 'Luffing at the front edge. Sheet in a touch, or bear away a few degrees.';
      case 'stalled':
        return 'Sheeted too hard for this course — the flow has separated. Ease until it just stops luffing: more heel is not more speed.';
      case 'pressed':
        return 'On the edge of stalling. A touch of ease will pay.';
      default:
        return 'Drawing well.';
    }
  }
  function verdictCls(trim) {
    if (trim === 'drawing') return 'good';
    if (trim === 'pressed') return 'warn';
    if (trim === 'stowed' || trim === 'furled') return '';
    return 'bad';
  }

  /** the whole coach panel, as HTML for the float-panel */
  Coach.renderPanel = function (v, G) {
    var h = '<h4>Trim coach<span class="meta">reads the telltales for you</span></h4>';
    var sailing = v.sailArea().total > 0.5;
    var awa = Math.abs(v.awa);

    if (!sailing) {
      h += '<div class="verdict">No sail set. Hoist the main (M) or unfurl the jib (J) and she will sail.</div>';
    } else {
      [['Main', v.sailState.main, v.mainHoist > 0.05],
       ['Jib', v.sailState.jib, v.jibOut > 0.05]].forEach(function (row) {
        if (!row[2]) return;
        var st = row[1], line = advice(row[0], st, v);
        if (!line) return;
        h += '<div class="verdict ' + verdictCls(st.trim) + '"><b>' + row[0] + ' — ' +
             st.trim + '.</b> ' + line + '</div>';
      });
      /* in irons is a situation, not a trim state */
      if (awa < 30 && v.stw < 0.6 && !v.engine.running) {
        h += '<div class="verdict warn"><b>In irons.</b> Back the jib — drag its slider to the ' +
             'windward side — and reverse the helm. The bow will fall away.</div>';
      }
      var band = v.sailState.main.ideal;
      h += '<div class="kv">' +
        '<span>Drive</span><span>' + Math.round(v.eff * 100) + '%</span>' +
        '<span>Heel</span><span>' + Math.abs(U.deg(v.heel)).toFixed(0) + '°</span>' +
        '<span>Apparent wind</span><span>' + Math.round(awa) + '° ' + (v.awa >= 0 ? 'stbd' : 'port') + '</span>' +
        '<span>Good sheet band</span><span>' + Math.round(Math.abs(band[0])) + '–' + Math.round(Math.abs(band[1])) + '° ' +
          (band[0] + band[1] >= 0 ? 'stbd' : 'port') + '</span>' +
        '</div>';
      if (Math.abs(U.deg(v.heel)) > 25)
        h += '<div class="verdict bad">Overpowered — reef (R), or ease the main.</div>';
    }

    if (G.player.tut && !G.player.tut.done && G.settings.hints) {
      var step = STEPS[G.player.tut.step];
      if (step) h += '<div class="verdict"><b>Next:</b> ' + step.short + '</div>';
    }
    return h;
  };

  /* ================= the first passage (§48) ================= */
  /* Each step is observed, never scripted: the sim decides when it is done.
     Hints only fire when a step has stalled, and only if hints are on. */
  var STEPS = [
    { id: 'accept', short: 'accept the marina parts contract',
      patience: 45, toast: ['First job', 'The marina parts run is a good first job — accept it on the contract board.'],
      done: function (v, G) { return G.player.contracts.length > 0; } },
    { id: 'load', short: 'load the cargo aboard',
      patience: 30, toast: ['Load her', 'The job is yours. Load it aboard — same tab, Load aboard.'],
      done: function (v) { return v.cargo.length > 0; } },
    { id: 'away', short: 'get under way and slip your lines',
      patience: 45, toast: ['Get under way', 'Start the engine (E), put her in gear, then slip your lines (L).'],
      done: function (v) { return !v.moored; } },
    { id: 'clear', short: 'motor clear of the harbour',
      patience: 120, toast: ['Sea room', 'Take her well clear of the moorings before you make sail.'],
      done: function (v, G) { var hp = G.homePort(); return U.len(v.x - hp.x, v.y - hp.y) > 500; } },
    { id: 'hoist', short: 'hoist the main and unfurl the jib',
      patience: 50, toast: ['Make sail', 'Hoist the main (M) and unfurl the jib (J). The crew sheet them to leeward for you.'],
      done: function (v) { return v.mainHoist > 0.9 && v.jibOut > 0.9; } },
    { id: 'engineOff', short: 'stop the engine and sail her',
      patience: 35, toast: ['Sail her', 'She is under sail — stop the engine (E). Diesel costs money; wind is free.'],
      done: function (v) { return !v.engine.running; } },
    { id: 'trim', short: 'trim both sails until they draw', hold: 8,
      patience: 75, toast: ['Trim', 'Drag each sheet into the green band until the label reads "drawing". Ease until it luffs, then in until it stops.'],
      done: function (v) {
        var m = v.sailState.main.trim, j = v.sailState.jib.trim;
        return (m === 'drawing' || m === 'pressed') && (j === 'drawing' || j === 'pressed') && v.stw > 0.8;
      } },
    { id: 'waypoint', short: 'set a waypoint on the destination',
      patience: 50, toast: ['Where away?', 'Set a waypoint: the contract card has a Waypoint button, or tap the chart (C).'],
      done: function (v) { return !!v.waypoint; } },
    { id: 'passage', short: 'sail her there — the compass bug shows the bearing',
      patience: 900, toast: ['Passage', 'Keep her sailing for the waypoint — the magenta bug on the compass is your bearing. Watch the depth.'],
      done: function (v, G) {
        return G.player.stats.jobs > 0 ||
               (v.waypoint && U.len(v.x - v.waypoint.x, v.y - v.waypoint.y) < 700);
      } },
    { id: 'moor', short: 'slow right down and moor alongside',
      patience: 300, toast: ['Alongside', 'Drop the sails, slow below about a knot, and press Moor when the button offers it.'],
      done: function (v, G) { return G.player.stats.jobs > 0; } }
  ];
  Coach.STEPS = STEPS;

  var stepTime = 0, holdTime = 0, hinted = 0, autoOpenAt = -1e9, offEff = 0;
  var reefTime = 0, reefHintAt = -1e9;

  /** 1 Hz-ish. Called from everySecond at sea and renderPortTick in harbour. */
  Coach.tick = function (dt, v, G, UI) {
    var p = G.player;
    if (!p.tut) p.tut = { step: 0, done: false };

    /* ---- tutorial director ---- */
    if (!p.tut.done && G.settings.hints) {
      var st = STEPS[p.tut.step];
      if (!st) { p.tut.done = true; }
      else {
        stepTime += dt;
        var ok = st.done(v, G);
        if (ok && st.hold) { holdTime += dt; ok = holdTime >= st.hold; }
        else if (!ok) holdTime = 0;
        if (ok) {
          p.tut.step++; stepTime = 0; holdTime = 0; hinted = 0;
          if (st.id === 'trim') UI.toast('Drawing', 'Both sails working. That is the whole art — keep them like that.');
          if (p.tut.step >= STEPS.length) {
            p.tut.done = true;
            UI.toast('Well sailed', 'First cargo delivered. The book (H) fills as you sail, and the flag button reads your trim whenever you want it.');
          }
        } else if (stepTime > st.patience * (hinted + 0.18) && hinted < 3) {
          hinted++;
          UI.toast(st.toast[0], st.toast[1]);
        }
      }
    }

    /* ---- auto-open the coach when trim has gone visibly wrong ---- */
    if (G.settings.hints && Coach.aid('coachAuto') && v.sailArea().total > 0.5) {
      if (v.eff < 0.55) offEff += dt; else offEff = 0;
      if (offEff > 14 && E.t - autoOpenAt > 240 && UI.coachHidden()) {
        autoOpenAt = E.t; offEff = 0;
        UI.toggleCoach(true);
      }
    } else offEff = 0;

    /* ---- assisted mode suggests the reef before the boat demands it ---- */
    if (Coach.aid('reefHint') && v.sailArea().total > 0.5) {
      if (Math.abs(U.deg(v.heel)) > 25) reefTime += dt; else reefTime = Math.max(0, reefTime - dt);
      if (reefTime > 20 && E.t - reefHintAt > 600) {
        reefHintAt = E.t; reefTime = 0;
        UI.toast('Crew', 'She is pressed — a reef now (R) would make her faster and drier.');
      }
    }
  };

  /** the tutorial's deterministic first offer — called from Ec.offers */
  Coach.firstOffer = function (port, player) {
    if (!player.tut || player.tut.done || player.stats.jobs > 0) return null;
    if (player.contracts.length) return null;
    var home = S.Game ? S.Game.homePort() : null;
    if (!home || port.id !== home.id) return null;
    var near = W.PORTS.filter(function (p) { return p.id !== port.id; })
      .sort(function (a, b) { return U.dist(port, a) - U.dist(port, b); })[0];
    if (!near) return null;
    var nm = W.passageDistance(port, near) / U.NM;
    return {
      id: 'tut-first', tutorial: true,
      origin: port.id, dest: near.id, type: 'parts',
      mass: 120, volume: Math.round(120 / D.CARGO.parts.dens * 100) / 100,
      deadline: E.t + Math.max(4, nm / 2.6) * 3600,   // generous: no pressure on the first sail
      reward: Math.round((90 + nm * 14) / 5) * 5,
      latePerMin: 0.5, fuelBonus: 15, fuelAllowance: Math.round(nm * 0.3 * 10) / 10,
      earlyBonus: 10, repReward: 2.5, risk: 0, urgent: false,
      round: false, stage: 1, ashore: 0, homePort: port.id,
      fridge: false, sensitive: false, nm: nm
    };
  };

})(window.SCS);
