/* economy.js — contracts, cargo market, reputation, costs.  (SDD §32–§36) */
(function (S) {
  'use strict';
  var U = S.U, W = S.World, E = S.Env, D = S.DATA;
  var Ec = S.Econ = {};

  Ec.FUEL_PRICE = 1.95;        // £ per litre
  Ec.SLOT = 4 * 3600;          // contracts on the board refresh every four hours

  /* What a harbour ships depends on what kind of place it is, which we infer
     from its size and its facilities rather than a hand-written table — there
     are a hundred and fifty of them now. */
  var BIG = ['mail', 'groceries', 'parts', 'tools', 'medical', 'machinery',
             'building', 'passenger', 'fuel', 'yachtpart'];
  var SMALL = ['fish', 'gear', 'produce', 'timber', 'passenger', 'mail'];
  function sends(p) { return p.size > 0.8 ? BIG : SMALL; }
  function takes(p) { return p.size > 0.8 ? SMALL.concat(['parts', 'fuel']) : BIG; }

  /** charted depth of the shallowest water on the way in */
  Ec.gate = function (portId) {
    var p = W.port(portId);
    return p && p.gate !== undefined ? p.gate : 2;
  };

  /** can this vessel get in at time t?  (§20, §11) */
  Ec.accessible = function (portId, draft, t, margin) {
    var p = W.port(portId);
    if (margin === undefined) margin = 0.3;
    var need = draft + margin - Ec.gate(portId);
    return E.tideHeight(p.x, p.y, t) >= need;
  };
  /** next window during which the harbour can be entered, searching 26 hours ahead */
  Ec.accessWindow = function (portId, draft, from, margin) {
    var end = from + 26 * 3600, step = 300, t;
    /* a harbour that is deep enough at low water has no gate at all */
    var p = W.port(portId), worst = Infinity;
    for (t = from; t < from + 89400; t += step) worst = Math.min(worst, E.tideHeight(p.x, p.y, t));
    if (worst >= draft + margin - Ec.gate(portId)) return { nowOpen: true, always: true };

    if (Ec.accessible(portId, draft, from, margin)) {
      t = from;
      while (t < end && Ec.accessible(portId, draft, t, margin)) t += step;
      return { open: from, shut: t, nowOpen: true };
    }
    var open = null;
    for (t = from; t < end; t += step) if (Ec.accessible(portId, draft, t, margin)) { open = t; break; }
    if (open === null) return { nowOpen: false, never: true };
    var shut = open;
    while (shut < end && Ec.accessible(portId, draft, shut, margin)) shut += step;
    return { open: open, shut: shut, nowOpen: false };
  };

  /* ---- contract generation (§32) ---- */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function makeContract(rng, origin, destId, seedKey, player) {
    var dest = W.port(destId);
    var pool = sends(origin).filter(function (c) { return takes(dest).indexOf(c) >= 0; });
    if (!pool.length) pool = takes(dest);
    var type = U.pick(rng, pool);
    var cd = D.CARGO[type];
    var distM = W.passageDistance(origin, dest), nm = distM / U.NM;

    /* size the load against what the player can actually lift, with the
       occasional consignment that needs a bigger boat */
    var hold = (player && player.payload) ||
               (S.Game && S.Game.vessel && S.Game.vessel.spec.max_payload_kg) || 700;
    var cap = hold * (0.14 + rng() * 0.82);
    if (rng() < 0.18) cap = hold * (1.15 + rng() * 0.6);  // freight that wants a bigger boat
    var mass = Math.max(20, Math.round(cap / 10) * 10);
    if (cd.pax) mass = Math.max(85, Math.round(cap / 85) * 85);
    var volume = mass / cd.dens;

    /* passengers often want taking somewhere and bringing home again (§32) */
    var round = cd.pax && rng() < 0.55;
    var urgent = rng() < 0.24;
    var planKn = 3.4 + rng() * 0.8;
    var slack = urgent ? 1.05 + rng() * 0.2 : 1.5 + rng() * 1.4;
    var dur = nm / planKn * 3600 * slack;
    var ashore = round ? (1 + rng() * 2.5) * 3600 : 0;   // how long they want ashore
    if (round) dur = dur * 2 + ashore;
    var deadline = E.t + Math.max(2400, dur);

    var rep = player ? player.reputation : 20;
    var reward = (26 + cd.rate * mass * (0.16 + 0.9 * Math.sqrt(nm) / 10)) *
                 (urgent ? 1.55 : 1) * (0.86 + rep / 100 * 0.5);
    if (round) reward *= 1.85;
    var gate = Ec.gate(destId);
    var risk = U.clamp((1.6 - gate) * 0.4 + (nm > 25 ? 0.2 : 0), 0, 1);
    reward *= 1 + risk * 0.35;

    return {
      id: seedKey,
      origin: origin.id, dest: destId, type: type,
      mass: mass, volume: Math.round(volume * 100) / 100,
      deadline: deadline, reward: Math.round(reward / 5) * 5,
      latePerMin: Math.max(1, Math.round(reward * 0.0016 * 10) / 10),
      fuelBonus: Math.round(reward * 0.11 / 5) * 5,
      fuelAllowance: Math.max(0.5, Math.round((0.09 + rng() * 0.11) * nm * 10) / 10),
      earlyBonus: Math.round(reward * 0.09 / 5) * 5,
      repReward: Math.round((1.6 + nm * 0.16 + risk * 2.2 + (urgent ? 1.6 : 0)) * 10) / 10,
      risk: risk, urgent: urgent,
      round: round, stage: 1, ashore: Math.round(ashore), homePort: origin.id,
      fridge: !!cd.cold, sensitive: cd.frag > 0.35 || cd.perish > 0.3,
      nm: nm
    };
  }

  /** a day charter: guests want taking to a quiet bay, an afternoon at
      anchor, and bringing home again (§32 — tourism) */
  function makeTour(rng, origin, seedKey, player) {
    /* Look for a bay: shallow enough to anchor at SOME state of tide, land
       in sight, clear of harbours — then take the quietest water on offer.
       (In a hard tideway like the Menai the "quiet" is relative, and picking
       the slack of it is part of the job.) */
    var spot = null, bestStream = Infinity;
    for (var tries = 0; tries < 90; tries++) {
      var ang = rng() * U.TAU, dist = (2.5 + rng() * 5.5) * U.NM;
      var x = origin.x + Math.sin(ang) * dist, y = origin.y - Math.cos(ang) * dist;
      var d = W.getChartedDepth(x, y);
      /* deep enough to stay afloat at a big low water, shallow enough for
         the boat's own ground tackle with tide and bow roller on top */
      var maxD = (S.Game && S.Game.vessel ? S.Game.vessel.maxAnchorDepth() : 9) - 3.5;
      if (d < 2.2 || d > Math.min(9, maxD)) continue;
      /* and the whole swinging circle must be water, not bank */
      var bankNear = false;
      for (var sw = 0; sw < 6 && !bankNear; sw++)
        if (W.getChartedDepth(x + Math.sin(sw * 1.047) * 70, y - Math.cos(sw * 1.047) * 70) < 1.8) bankNear = true;
      if (bankNear) continue;
      if (W.nearestPort(x, y).dist < 1200) continue;
      var worst = 0;
      for (var q = 0; q < 4; q++) {
        var cs = E.current(x, y, E.t + q * 5589);
        worst = Math.max(worst, U.len(cs.x, cs.y));
      }
      if (worst > 3.2 * U.KN) continue;   // only rule out genuinely wild water
      var shore = false;
      for (var a = 0; a < 8 && !shore; a++)
        if (W.getChartedDepth(x + Math.sin(a * 0.785) * 2000, y - Math.cos(a * 0.785) * 2000) < 0) shore = true;
      if (!shore) continue;
      if (worst < bestStream) {
        bestStream = worst;
        spot = { x: Math.round(x), y: Math.round(y) };
      }
    }
    if (!spot) return null;
    /* the stay must fit the bay's tidal window: quiet water invites a long
       afternoon, a hard tideway gets a short stop around slack */
    var hours = bestStream < 1.2 * U.KN ? 2 + Math.round(rng() * 2)
              : bestStream < 2.2 * U.KN ? 1 + Math.round(rng())
              : 1;
    var heads = 1 + Math.floor(rng() * 4);
    var mass = heads * 85;
    var nm = U.len(spot.x - origin.x, spot.y - origin.y) / U.NM * 2;   // out and home
    var dur = nm / 3.2 * 3600 * 1.7 + hours * 3600;
    var rep = player ? player.reputation : 20;
    var reward = (70 + mass * 0.85 + nm * 20 + hours * 34) * (0.86 + rep / 100 * 0.5);
    return {
      id: seedKey,
      tour: { x: spot.x, y: spot.y, r: 500, staySec: hours * 3600, stayed: 0, done: false },
      origin: origin.id, dest: origin.id, type: 'passenger',
      mass: mass, volume: Math.round(mass / D.CARGO.passenger.dens * 100) / 100,
      /* guests book around the tide: allow a full cycle to catch the window */
      deadline: E.t + dur + 13 * 3600,
      reward: Math.round(reward / 5) * 5,
      latePerMin: Math.max(0.6, Math.round(reward * 0.0014 * 10) / 10),
      fuelBonus: Math.round(reward * 0.12 / 5) * 5,
      fuelAllowance: Math.max(0.5, Math.round(0.1 * nm * 10) / 10),
      earlyBonus: 0, repReward: Math.round((2 + hours * 0.8) * 10) / 10,
      risk: 0, urgent: false,
      round: false, stage: 1, ashore: 0, homePort: origin.id,
      fridge: false, sensitive: true,      // their day out IS the cargo condition
      nm: nm
    };
  }

  /** the contract board at a harbour for the current four-hour slot */
  Ec.offers = function (port, player) {
    var slot = Math.floor(E.t / Ec.SLOT);
    var key = port.id + '|' + slot + '|' + (player.seed || 0);
    if (Ec._cache && Ec._cache.key === key) return Ec._cache.list;
    var rng = U.mulberry32(hashStr(key));
    var near = W.portsWithin(port.x, port.y, 90000).filter(function (p) { return p.id !== port.id; });
    near.sort(function (a, b) { return U.dist(port, a) - U.dist(port, b); });
    var dests = near.slice(0, 14);
    if (!dests.length) dests = W.PORTS.filter(function (p) { return p.id !== port.id; }).slice(0, 6);
    var n = Math.round(2 + port.size * 4 + player.reputation / 45);
    var list = [];
    for (var i = 0; i < n; i++) {
      var dest = U.pick(rng, dests);
      /* better reputation attracts the longer, richer runs */
      if (player.reputation < 25 && rng() < 0.55)
        dest = dests[Math.floor(rng() * Math.min(5, dests.length))];
      var c = makeContract(rng, port, dest.id, key + '#' + i, player);
      if (player.done.indexOf(c.id) >= 0) continue;
      if (player.contracts.some(function (a) { return a.id === c.id; })) continue;
      list.push(c);
    }
    /* most boards carry a day charter — the tourist trade is steady work */
    if (rng() < 0.65) {
      var tc = makeTour(rng, port, key + '#tour', player);
      if (tc && player.done.indexOf(tc.id) < 0 &&
          !player.contracts.some(function (a) { return a.id === tc.id; })) list.push(tc);
    }
    list.sort(function (a, b) { return a.nm - b.nm; });
    /* a brand-new skipper always finds one short, forgiving job on the board */
    var first = S.Coach && S.Coach.firstOffer ? S.Coach.firstOffer(port, player) : null;
    if (first && player.done.indexOf(first.id) < 0) list.unshift(first);
    Ec._cache = { key: key, list: list };
    return list;
  };
  Ec.invalidate = function () { Ec._cache = null; };

  /* ---- settlement (§35) ---- */
  /** the outward half of a return charter: they go ashore, you wait (§32) */
  Ec.landPassengers = function (player, contract) {
    contract.stage = 2;
    contract.dest = contract.homePort;
    contract.notBefore = E.t + contract.ashore;
    contract.deadline = Math.max(contract.deadline, contract.notBefore + contract.nm / 3.2 * 3600);
    var half = Math.round(contract.reward * 0.42);
    contract.reward -= half;
    player.money = Math.round((player.money + half) * 100) / 100;
    player.stats.earned += half;
    return { paid: half, back: contract.notBefore };
  };

  Ec.deliver = function (player, vessel, contract, cargoItem) {
    var late = Math.max(0, E.t - contract.deadline) / 60;
    var pay = contract.reward, notes = [];
    var cond = cargoItem ? cargoItem.condition : 1;
    var used = cargoItem && cargoItem.fuelStart !== undefined ?
      Math.max(0, cargoItem.fuelStart - vessel.fuel) : 999;

    if (contract.sensitive && cond < 0.985) {
      var f = 0.35 + 0.65 * cond;
      notes.push('Cargo condition ' + Math.round(cond * 100) + '% — paid ' + Math.round(f * 100) + '%');
      pay *= f;
    }
    if (late > 0.5) {
      var pen = Math.min(pay * 0.85, late * contract.latePerMin);
      notes.push('Late by ' + U.durStr(late * 60) + ' — penalty ' + U.money(pen));
      pay -= pen;
    } else if (E.t < contract.deadline - 1200) {
      pay += contract.earlyBonus;
      notes.push('Early arrival bonus ' + U.money(contract.earlyBonus));
    }
    if (used <= contract.fuelAllowance) {
      pay += contract.fuelBonus;
      notes.push('Fuel economy bonus ' + U.money(contract.fuelBonus) + ' (' + used.toFixed(1) + ' of ' + contract.fuelAllowance + ' L)');
    }
    pay = Math.max(0, Math.round(pay));

    var rep = contract.repReward;
    if (late > 30) rep = -Math.min(6, late / 30 * 2.5);
    else if (late > 0.5) rep *= 0.2;
    if (contract.sensitive && cond < 0.7) rep -= 3;
    player.money += pay;
    player.reputation = U.clamp(player.reputation + rep, 0, 100);
    player.done.push(contract.id);
    player.stats.jobs++; player.stats.earned += pay;
    if (late > 0.5) player.stats.lateJobs++;
    return { pay: pay, rep: rep, notes: notes, late: late, condition: cond };
  };

  /* ---- costs ---- */
  Ec.repairQuote = function (vessel) {
    var s = vessel.spec, base = 120 + s.displacement_kg * 0.06;
    var d = vessel.damage;
    return {
      hull:   Math.round(d.hull * base * 4.2),
      rig:    Math.round(d.rig * base * 2.6),
      sails:  Math.round(d.sails * base * 2.2),
      engine: Math.round(d.engine * base * 3.4),
      rudder: Math.round(d.rudder * base * 1.8),
      total: 0
    };
  };
  Ec.tradeIn = function (vessel) {
    var d = vessel.damage;
    var wear = 1 - (d.hull * 0.4 + d.rig * 0.15 + d.sails * 0.12 + d.engine * 0.25 + d.rudder * 0.08);
    var eq = vessel.equipment.reduce(function (a, id) { var e = D.equip(id); return a + (e ? e.price * 0.45 : 0); }, 0);
    return Math.round((Math.max(1200, vessel.spec.price) * 0.72 * U.clamp(wear, 0.4, 1) + eq) / 10) * 10;
  };
  Ec.fuelPrice = function (port) { return Ec.FUEL_PRICE / (port.fuel || 1); };
  /** a night alongside, charged by the metre as harbours everywhere do */
  Ec.berthFee = function (port, vessel) {
    return Math.round((port.berth || 10) * (0.55 + vessel.spec.loa_m / 14));
  };

})(window.SCS);
