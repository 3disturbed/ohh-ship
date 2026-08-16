/* run.js — sail physics regression tests. `node tests/run.js` exits non-zero
   on any hard failure. Suites tagged soft:true report but do not fail the
   run (tuning targets that land in a later wave — promote them when done). */
'use strict';
const H = require('./harness');

const results = [];
function suite(name, opts, fn) {
  const soft = !!(opts && opts.soft);
  const checks = [];
  const t = {
    ok(cond, label, detail) {
      checks.push({ pass: !!cond, label, detail: detail === undefined ? '' : ' — ' + detail });
    },
  };
  let threw = null;
  try { fn(t); } catch (e) { threw = e; }
  const failed = checks.filter((c) => !c.pass);
  results.push({ name, soft, checks, failed, threw });
  const mark = threw || failed.length ? (soft ? 'SOFT-FAIL' : 'FAIL') : 'pass';
  console.log(`[${mark}] ${name}`);
  for (const c of failed) console.log(`         ✗ ${c.label}${c.detail}`);
  if (threw) console.log(`         ! threw: ${threw.stack || threw}`);
}

/* ---------------- T1: polar sanity (12kn) ---------------- */
suite('T1a polar shape: VMG optimum, beam fastest, run slowest', {}, (t) => {
  const ctx = H.boot({ twsKn: 12, twdDeg: 0 });
  const stw = {}, vmg = {};
  for (let twa = 30; twa <= 175; twa += 5) {
    stw[twa] = H.bestSTW(ctx, 'centaur', twa).stw;
    vmg[twa] = stw[twa] * Math.cos((twa * Math.PI) / 180);
  }
  let bestVmgTwa = 30;
  for (const a in vmg) if (vmg[a] > vmg[bestVmgTwa]) bestVmgTwa = a;
  let fastestTwa = 30;
  for (const a in stw) if (stw[a] > stw[fastestTwa]) fastestTwa = a;
  t.ok(bestVmgTwa >= 40 && bestVmgTwa <= 55, 'upwind VMG optimum in TWA 40-55', `got ${bestVmgTwa}`);
  t.ok(fastestTwa >= 85 && fastestTwa <= 135, 'fastest TWA in 85-135', `got ${fastestTwa}`);
  t.ok(stw[175] < stw[100], 'dead run slower than broad reach', `${stw[175].toFixed(2)} vs ${stw[100].toFixed(2)}`);
});

suite('T1b pinching collapses: no-go below TWA ~35 (D7)', {}, (t) => {
  const ctx = H.boot({ twsKn: 12, twdDeg: 0 });
  const s30 = H.bestSTW(ctx, 'centaur', 30).stw;
  const s45 = H.bestSTW(ctx, 'centaur', 45).stw;
  t.ok(s30 < 0.45 * s45, 'STW(30) < 45% of STW(45)', `${s30.toFixed(2)} vs ${s45.toFixed(2)}`);
  t.ok(s30 < 1.8, 'TWA 30 is a crawl', s30.toFixed(2) + 'kn');
  // the real lesson: pinching murders VMG
  const vmg30 = s30 * Math.cos((30 * Math.PI) / 180);
  const vmg50 = H.bestSTW(ctx, 'centaur', 50).stw * Math.cos((50 * Math.PI) / 180);
  t.ok(vmg30 < 0.6 * vmg50, 'VMG(30) < 60% of VMG(50)', `${vmg30.toFixed(2)} vs ${vmg50.toFixed(2)}`);
});

/* ---------------- T2: backed sails ---------------- */
suite('T2 backed sail never drives; goose-wing draws', {}, (t) => {
  // main only, deliberately set to the WINDWARD side on a beam reach
  const ctx = H.boot({ twsKn: 12, twdDeg: 0 });
  const v = new ctx.S.Vessel('centaur');
  v.hdg = ctx.U.rad(90); // wind from north on the port beam -> lee is starboard
  v.mainHoist = 1; v.jibOut = 0;
  v.mainSheet = -40; v.boomAngle = -40; // pinned to PORT = windward = backed
  v._windSide = -1;
  H.settleLocked(ctx, v, 90, 40);
  t.ok(v.sailState.main.backed, 'windward-pinned main flagged backed');
  t.ok(H.fwdKn(ctx, v) < 0.8, 'backed main does not drive her forward', H.fwdKn(ctx, v).toFixed(2) + 'kn');

  // goose-wing: broad run, boom out to leeward, JIB held out on the OTHER side
  const g = new ctx.S.Vessel('centaur');
  g.hdg = ctx.U.rad(170); // wind nearly dead astern (from north)
  g.mainHoist = 1; g.jibOut = 1;
  g.mainSheet = 80; g.boomAngle = 80;   // boom to starboard (lee)
  g.jibSheet = -80; g.jibAngle = -80;   // jib squared out to port = goose-winged
  g._windSide = -1;
  H.settleLocked(ctx, g, 170, 60);
  t.ok(!g.sailState.jib.backed, 'goose-winged jib NOT flagged backed');
  t.ok(H.fwdKn(ctx, g) > 3.0, 'goose-winged pair drives on the run', H.fwdKn(ctx, g).toFixed(2) + 'kn');
});

/* ---------------- T3: continuity across dead run ---------------- */
suite('T3 drive continuous through dead astern (D3 flicker)', {}, (t) => {
  const ctx = H.boot({ twsKn: 12, twdDeg: 0 });
  // sweep heading 174 -> 186 (awa passes through ±180), sheets pinned lee/stbd
  let prev = null, worst = 0, at = '';
  for (let hdg = 174; hdg <= 186; hdg += 2) {
    const v = H.rigged(ctx, 'centaur', hdg, 80, 80);
    v._windSide = -1;
    H.settleLocked(ctx, v, hdg, 60);
    const s = H.fwdKn(ctx, v);
    if (prev !== null) {
      const jump = Math.abs(s - prev) / Math.max(prev, 0.3);
      if (jump > worst) { worst = jump; at = `hdg ${hdg}`; }
    }
    prev = s;
  }
  t.ok(worst < 0.15, 'adjacent 2° samples change < 15%', `worst ${(worst * 100).toFixed(0)}% at ${at}`);
});

/* ---------------- T4: spawn/hoist never backed ---------------- */
suite('T4 hoisting with the wind already on either side sets to leeward', {}, (t) => {
  for (const twd of [90, 270]) { // wind from starboard, then from port (heading north)
    const ctx = H.boot({ twsKn: 12, twdDeg: twd });
    const v = new ctx.S.Vessel('centaur');
    v.hdg = 0;
    H.settleLocked(ctx, v, 0, 3); // let awa settle before the crew act
    v.hoistMain(true);
    v.setJib(1);
    H.settleLocked(ctx, v, 0, 60); // hoist takes ~11s, furl ~9s
    const side = twd === 90 ? 'starboard' : 'port';
    t.ok(!v.sailState.main.backed, `main not backed (wind from ${side})`, `sheet ${v.mainSheet.toFixed(0)}`);
    t.ok(!v.sailState.jib.backed, `jib not backed (wind from ${side})`, `sheet ${v.jibSheet.toFixed(0)}`);
    t.ok(H.fwdKn(ctx, v) > 1.5, `she drives after the hoist (wind from ${side})`, H.fwdKn(ctx, v).toFixed(2) + 'kn');
  }
});

/* ---------------- T5: tack ---------------- */
suite('T5 tacking hands the sheets; the jib blows across without furling', {}, (t) => {
  const ctx = H.boot({ twsKn: 12, twdDeg: 0 });
  const v = H.rigged(ctx, 'centaur', 45, 15, 18); // wind on the port bow, boom stbd
  v._windSide = -1;
  H.settleLocked(ctx, v, 45, 60);
  const before = H.fwdKn(ctx, v);
  t.ok(before > 3, 'settled close-hauled before the tack', before.toFixed(2) + 'kn');
  v.sailState.event = null;
  let minJibOut = 1, event = null;
  const steps = Math.round(8 / H.DT);
  for (let i = 0; i < steps; i++) {           // 45 -> 315 through the wind
    const hdg = 45 - (90 * i) / steps;
    v.step(H.DT); v.hdg = ctx.U.rad(hdg < 0 ? hdg + 360 : hdg); v.yawRate = 0;
    ctx.E.t += H.DT;
    if (v.jibOut < minJibOut) minJibOut = v.jibOut;
    if (v.sailState.event) event = v.sailState.event.type;
  }
  H.settleLocked(ctx, v, 315, 40);
  t.ok(v.mainSheet < 0 && v.jibSheet < 0, 'sheets handed to port', `ms ${v.mainSheet}, js ${v.jibSheet}`);
  t.ok(minJibOut > 0.9, 'jib never furled through the tack', `min jibOut ${minJibOut.toFixed(2)}`);
  t.ok(event === 'tack', "event 'tack' fired", String(event));
  t.ok(H.fwdKn(ctx, v) > 3, 'drive recovered on the new tack', H.fwdKn(ctx, v).toFixed(2) + 'kn');
});

/* ---------------- T6: gybe ---------------- */
suite('T6 wind crossing the stern gybes the boom; eased = shock, centred = clean', {}, (t) => {
  // eased gybe in a fresh breeze -> gybeShock
  const ctx = H.boot({ twsKn: 18, twdDeg: 0 });
  const v = H.rigged(ctx, 'centaur', 165, 80, 80); // wind port quarter, boom squared stbd
  v._windSide = -1;
  H.settleLocked(ctx, v, 165, 40);
  v.sailState.event = null; v.gybeShock = 0;
  const steps = Math.round(10 / H.DT);
  let event = null, boomFlipped = false;
  for (let i = 0; i <= steps; i++) {          // 165 -> 200 through dead run
    const hdg = 165 + (35 * i) / steps;
    v.step(H.DT); v.hdg = ctx.U.rad(hdg); v.yawRate = 0; ctx.E.t += H.DT;
    if (v.sailState.event && v.sailState.event.type !== 'crashGybe') event = v.sailState.event.type;
    if (v.boomAngle < -5) boomFlipped = true;
  }
  H.settleLocked(ctx, v, 200, 10);
  t.ok(event === 'gybe', "event 'gybe' fired", String(event));
  t.ok(boomFlipped, 'boom came across to port');
  t.ok(v.gybeShock > 0, 'eased gybe in 18kn shocks the rig', `shock ${(v.gybeShock || 0).toFixed(2)}`);

  // controlled gybe: sheet the main to 5° first
  const c = H.boot({ twsKn: 18, twdDeg: 0 });
  const w = H.rigged(c, 'centaur', 165, 80, 80);
  w._windSide = -1;
  H.settleLocked(c, w, 165, 40);
  w.mainSheet = 5;                             // centre the main
  H.settleLocked(c, w, 165, 6);                // boom comes in
  w.gybeShock = 0;
  for (let i = 0; i <= steps; i++) {
    const hdg = 165 + (35 * i) / steps;
    w.step(H.DT); w.hdg = c.U.rad(hdg); w.yawRate = 0; c.E.t += H.DT;
  }
  t.ok(!(w.gybeShock > 0), 'sheeted-in gybe is clean', `shock ${(w.gybeShock || 0).toFixed(2)}`);
});

/* ---------------- T7: by the lee ---------------- */
suite('T7 a few degrees by the lee holds; a dozen gybes her', {}, (t) => {
  const ctx = H.boot({ twsKn: 12, twdDeg: 0 });
  const v = H.rigged(ctx, 'centaur', 176, 80, 80); // awa ≈ -173, boom stbd
  v._windSide = -1;
  H.settleLocked(ctx, v, 176, 30);
  // 4° by the lee: heading 184 -> awa ≈ +177 (dead band) — no gybe
  H.settleLocked(ctx, v, 184, 60);
  t.ok(v.mainSheet > 0, 'boom holds through 4° by the lee', `ms ${v.mainSheet}`);
  // push to ~12° past: awa leaves the dead band on the new side -> gybe
  H.settleLocked(ctx, v, 194, 20);
  t.ok(v.mainSheet < 0, 'she gybes when pushed well by the lee', `ms ${v.mainSheet}`);
});

/* ---------------- T8: irons escape ---------------- */
suite('T8 backing the jib takes her out of irons', {}, (t) => {
  const ctx = H.boot({ twsKn: 10, twdDeg: 0 });
  const v = new ctx.S.Vessel('centaur');
  v.hdg = 0; v.vx = 0; v.vy = 0;              // head to wind, dead in the water
  v.mainHoist = 1; v.jibOut = 1;
  v.mainSheet = -60; v.boomAngle = -60;       // main well eased so it flogs, as you would
  v.jibSheet = 40; v.jibAngle = 40;           // jib deliberately backed to starboard
  v._windSide = 1;
  H.settleFree(ctx, v, 60);
  const awa = Math.abs(v.awa);
  t.ok(awa > 25, 'the bow blows off within a minute', `|awa| ${awa.toFixed(0)}°`);
  t.ok(v.jibSheet === 40, 'the backed jib stays where it was pinned', `js ${v.jibSheet}`);
});

/* ---------------- T9: heel (Wave 2 target) ---------------- */
suite('T9 heel magnitude (D8)', {}, (t) => {
  const ctx = H.boot({ twsKn: 12, twdDeg: 0 });
  const v = H.rigged(ctx, 'centaur', 50, 15, 18);
  v._windSide = -1;
  H.settleLocked(ctx, v, 50, 90);
  const deg = Math.abs(ctx.U.deg(v.heel));
  t.ok(deg >= 13 && deg <= 22, 'close-hauled full sail in 12kn heels 13-22°', deg.toFixed(1) + '°');
  const c2 = H.boot({ twsKn: 25, twdDeg: 0 });
  const w = H.rigged(c2, 'centaur', 50, 15, 18);
  w._windSide = -1;
  H.settleLocked(c2, w, 50, 90);
  t.ok(Math.abs(c2.U.deg(w.heel)) > 26, '25kn full sail is clearly overpowered', Math.abs(c2.U.deg(w.heel)).toFixed(1) + '°');
});

/* ---------------- T10: downwind trim optimum (Wave 2 target) ---------------- */
suite('T10 broad-run trim is forgiving and squares out by 170 (D12)', {}, (t) => {
  // The apparent wind at TWA 150 sits well forward (~135°), so the drive
  // surface is a plateau: the classic squared-out trim must cost almost
  // nothing, and on a dead run the argmax must actually be squared out.
  const ctx = H.boot({ twsKn: 12, twdDeg: 0 });
  const r150 = H.bestSTW(ctx, 'centaur', 150);
  const v = H.rigged(ctx, 'centaur', 150, 80, 84);
  v._windSide = -1;
  H.settleLocked(ctx, v, 150, 60);
  const eased = H.fwdKn(ctx, v);
  t.ok(eased > 0.92 * r150.stw, 'easing to 80 at TWA 150 costs < 8%', `${eased.toFixed(2)} vs best ${r150.stw.toFixed(2)}`);
  const r170 = H.bestSTW(ctx, 'centaur', 170);
  t.ok(r170.sheet >= 75, 'TWA 170 argmax is squared out (≥75)', `got ${r170.sheet}`);
});

/* ---------------- T11: autopilot wind mode ---------------- */
suite('T11 wind-mode autopilot converges (D6)', {}, (t) => {
  // close-hauled on port-side wind, correctly trimmed; the pilot steers, we trim
  const ctx = H.boot({ twsKn: 12, twdDeg: 0 });
  const v = H.rigged(ctx, 'centaur', 50, 15, 18); // awa ≈ -38, lee = starboard
  v.equipment.push('autopilot', 'gps');
  v._windSide = -1;
  H.settleLocked(ctx, v, 50, 40);
  v.autopilot.on = true; v.autopilot.mode = 'wind'; v.autopilot.target = -45;
  for (let i = 0; i < Math.round(150 / H.DT); i++) {
    v.pilotStep(H.DT); v.step(H.DT); ctx.E.t += H.DT;
  }
  t.ok(Math.abs(v.awa - -45) < 5, 'holds awa -45 within 5°', `awa ${v.awa.toFixed(1)}`);
  t.ok(v.stw * ctx.U.MS2KN > 2.5, 'still sailing while holding the angle', (v.stw * ctx.U.MS2KN).toFixed(1) + 'kn');
});

/* ---------------- T12: sanity ---------------- */
suite('T12 half an hour of mixed manoeuvres never corrupts the state', {}, (t) => {
  const ctx = H.boot({ twsKn: 15, twdDeg: 30 });
  const v = new ctx.S.Vessel('centaur');
  v.hdg = ctx.U.rad(75);
  v.hoistMain(true); v.setJib(1);
  const legs = [75, 120, 210, 290, 20, 340, 160, 75];
  for (const hdg of legs) {
    for (let i = 0; i < Math.round(220 / H.DT); i++) {
      v.rudderCmd = Math.max(-25, Math.min(25,
        ctx.U.deg(ctx.U.angDiff(ctx.U.rad(hdg), v.hdg)) * 1.2 - ctx.U.deg(v.yawRate) * 3));
      v.step(H.DT); ctx.E.t += H.DT;
    }
  }
  t.ok(ctx.warns.filter((w) => /repaired/.test(w)).length === 0, 'sane() never fired', ctx.warns.join('; '));
  t.ok(isFinite(v.x) && isFinite(v.hdg) && isFinite(v.heel), 'state finite');
});

/* ---------------- report ---------------- */
const hard = results.filter((r) => !r.soft && (r.failed.length || r.threw));
const soft = results.filter((r) => r.soft && (r.failed.length || r.threw));
console.log(`\n${results.length} suites: ${results.length - hard.length - soft.length} pass, ${hard.length} FAIL, ${soft.length} soft-fail`);
process.exit(hard.length ? 1 : 0);
