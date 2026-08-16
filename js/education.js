/* education.js — concept detection and the Skipper's Handbook. (SDD §45, §46)
   Nothing here teaches directly. It watches what the player is doing, and
   when they have just lived through a concept, it unlocks the page about it. */
(function (S) {
  'use strict';
  var U = S.U, E = S.Env, D = S.DATA;
  var Ed = S.Edu = {};

  var st = {
    nogoTime: 0, luffTime: 0, tackSide: 0, tackArmed: false, gybeArmed: false,
    points: {}, lastSpeedRatio: 0, heelTime: 0, driftSeen: 0, waited: 0, lastTide: null
  };
  Ed.state = st;

  function unlock(player, id, ui) {
    if (player.unlocked.indexOf(id) >= 0) return false;
    var e = D.entry(id);
    if (!e) return false;
    player.unlocked.push(id);
    if (ui) ui.toast('Handbook', e.title, id);
    return true;
  }
  Ed.unlock = unlock;

  /** called once a second with the live simulation state */
  Ed.observe = function (dt, v, player, ui) {
    var r = v.readout(), sailing = v.sailArea().total > 0.5;
    var awa = Math.abs(v.awa);

    /* --- no-go zone: pointing too close and stopping --- */
    if (sailing && awa < 32 && r.stw < 1.4) { st.nogoTime += dt; if (st.nogoTime > 6) unlock(player, 'nogo', ui); }
    else st.nogoTime = Math.max(0, st.nogoTime - dt * 0.5);

    /* --- tacking and gybing --- */
    var side = v.awa >= 0 ? 1 : -1;
    if (sailing) {
      if (awa < 70) st.tackArmed = true;
      if (awa > 130) st.gybeArmed = true;
      if (st.tackSide && side !== st.tackSide) {
        if (awa < 100 && st.tackArmed) { unlock(player, 'tacking', ui); player.stats.tacks++; st.tackArmed = false; }
        else if (awa > 120 && st.gybeArmed) { unlock(player, 'gybing', ui); st.gybeArmed = false; }
      }
      st.tackSide = side;
    }

    /* --- points of sail: sailed well on several different angles --- */
    if (sailing && r.stw > 1.2) {
      var band = awa < 55 ? 'beat' : awa < 80 ? 'close' : awa < 110 ? 'beam' : awa < 150 ? 'broad' : 'run';
      st.points[band] = (st.points[band] || 0) + dt;
      var n = 0; for (var k in st.points) if (st.points[k] > 25) n++;
      if (n >= 3) unlock(player, 'points_of_sail', ui);
    }

    /* --- sail trim: something has been flapping for a while --- */
    if (sailing && Math.max(v.luffMain, v.luffJib) > 0.35 && r.stw > 0.4) {
      st.luffTime += dt; if (st.luffTime > 9) unlock(player, 'sail_trim', ui);
    } else st.luffTime = Math.max(0, st.luffTime - dt);

    /* --- telltales: both sails kept drawing for a solid spell --- */
    if (sailing && v.sailState && v.sailState.main.trim === 'drawing' &&
        (v.jibOut < 0.05 || v.sailState.jib.trim === 'drawing') && r.stw > 1.0) {
      st.drawTime = (st.drawTime || 0) + dt;
      if (st.drawTime > 60) unlock(player, 'telltales', ui);
    }

    /* --- voyage-quality stats, for the passage debrief --- */
    if (sailing) {
      player.stats.sailTime = (player.stats.sailTime || 0) + dt;
      if (v.eff > 0.75) player.stats.effTime = (player.stats.effTime || 0) + dt;
    }

    /* --- apparent wind: the numbers visibly disagree --- */
    if (sailing && Math.abs(r.aws - r.tws) > 2.6 && r.stw > 1.5) unlock(player, 'apparent_wind', ui);

    /* --- VMG: beating for a waypoint that lies to windward --- */
    if (sailing && v.waypoint && awa < 60 && r.stw > 1.5) {
      st.vmgTime = (st.vmgTime || 0) + dt;
      if (st.vmgTime > 30) unlock(player, 'vmg', ui);
    }

    /* --- speed through water is not speed over ground --- */
    if (Math.abs(r.stw - r.sog) > 0.45 && r.sog > 0.3) {
      st.driftSeen += dt;
      if (st.driftSeen > 5) { unlock(player, 'stw_sog', ui); }
      if (st.driftSeen > 40) unlock(player, 'set_drift', ui);
    }

    /* --- leeway --- */
    if (sailing && Math.abs(v.leeway) > 4.5 && r.stw > 1.2) unlock(player, 'leeway', ui);

    /* --- hove to: jib backed, main drawing or eased, and she has stopped --- */
    if (sailing && v.sailState && v.sailState.jib.trim === 'backed' &&
        !v.sailState.main.backed && r.stw < 1.0 && awa > 30 && awa < 100) {
      st.hoveTime = (st.hoveTime || 0) + dt;
      if (st.hoveTime > 30) unlock(player, 'heaveto', ui);
    } else st.hoveTime = 0;

    /* --- overpowered --- */
    if (Math.abs(r.heel) > 24) { st.heelTime += dt; if (st.heelTime > 12) { unlock(player, 'reefing', ui); } }
    else st.heelTime = Math.max(0, st.heelTime - dt * 0.6);
    if (sailing && Math.abs(v.rudder) > 12 && Math.abs(r.heel) > 15 && r.stw > 1.5) unlock(player, 'weather_helm', ui);

    /* --- shallow water --- */
    if (r.ukc < 1.2) unlock(player, 'ukc', ui);
    if (r.depth < 5 && r.ukc < 2.5) unlock(player, 'chart_datum', ui);
    if (v.grounded) unlock(player, 'grounding', ui);

    /* --- hull speed --- */
    if (r.stw > r.hullSpeed * 0.94) unlock(player, 'hull_speed', ui);

    /* --- fuel --- */
    if (v.engine.running && r.fuelPct < 0.3) unlock(player, 'engine_range', ui);
    if (v.engine.running && v.engine.gear !== 0 && r.stw < 0.9 && Math.abs(v.rudder) > 20)
      unlock(player, 'rudder_low_speed', ui);

    /* --- dead reckoning --- */
    if (!v.has('gps') && v.dr.err > 320) unlock(player, 'dead_reckoning', ui);
    if (E.daylight() < 0.25) unlock(player, 'buoyage', ui);

    /* --- tide --- */
    var th = E.tideHeight(v.x, v.y);
    if (st.lastTide === null) st.lastTide = th;
    if (Math.abs(th - st.lastTide) > 0.9) { unlock(player, 'tidal_height', ui); st.lastTide = th; }
  };

  /** unlocked when the player accepts work, or looks at a tide-limited harbour */
  Ed.onEvent = function (name, player, ui) {
    if (name === 'accept') unlock(player, 'passage_planning', ui);
    if (name === 'gate') unlock(player, 'tidal_gate', ui);
    if (name === 'moor') unlock(player, 'rudder_low_speed', ui);
  };

  Ed.progress = function (player) {
    return { have: player.unlocked.length, total: D.HANDBOOK.length };
  };

})(window.SCS);
