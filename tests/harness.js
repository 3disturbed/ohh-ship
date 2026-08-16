/* harness.js — headless loader for the sail physics.
   Loads the real util.js + data.js + vessel.js into a vm sandbox with a
   stubbed, steady-wind environment, so tests and the polar sweep drive the
   exact shipped physics with no browser and no weather noise. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

/** Boot a fresh sandboxed SCS. env: { twsKn, twdDeg } — mutable afterwards. */
function boot(env) {
  const warns = [];
  const sandbox = {
    window: {},
    console: { log: console.log, warn: (m) => warns.push(String(m)), error: console.error },
    Math, JSON, isFinite, Date, Infinity, NaN, undefined,
  };
  sandbox.window.SCS = {};
  vm.createContext(sandbox);
  const load = (f) =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox, { filename: f });

  load('util.js');
  load('data.js');
  const S = sandbox.window.SCS, U = S.U;

  S.World = {
    WIDTH: 1e6, HEIGHT: 1e6,
    clampPos: () => {},
    getChartedDepth: () => 30,
    getBottom: () => 'sand',
    deepwardBearing: () => 0,
    nearestPort: () => ({ dist: 1e9, port: { x: 0, y: 0, name: 'stub' } }),
    nearestMark: () => ({ dist: 1e9, mark: { n: 'stub' } }),
  };
  const E = {
    t: 6 * 3600,
    wind: () => ({ dir: U.rad(env.twdDeg), speed: env.twsKn * U.KN, gust: 1, squall: 0, shelter: 0 }),
    current: () => ({ x: 0, y: 0 }),
    seaState: () => ({ hs: 0, fetch: 0, period: 5 }),
    tideHeight: () => 0,
    tideInfo: () => ({ nextLW: 0, nextLWHeight: 0 }),
    daylight: () => 1,
  };
  S.Env = E;
  load('vessel.js'); // AFTER stubs: vessel.js captures S.Env/S.World at IIFE time

  return { S, U, E, env, warns };
}

const DT = 0.05;

/** Step with the heading locked (isolates sail drive from yaw dynamics). */
function settleLocked(ctx, v, hdgDeg, seconds) {
  const { U, E } = ctx;
  const h = U.rad(hdgDeg);
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    v.step(DT);
    v.hdg = h; v.yawRate = 0;
    E.t += DT;
  }
}

/** Step free-running (real yaw dynamics). */
function settleFree(ctx, v, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) { v.step(DT); ctx.E.t += DT; }
}

/** Forward speed through the water, knots. */
function fwdKn(ctx, v) {
  const f = ctx.U.hvec(v.hdg);
  return (v.vx * f.x + v.vy * f.y) * ctx.U.MS2KN;
}

/** Fresh vessel with sails already set and settled at the given trim. */
function rigged(ctx, specId, hdgDeg, mainSheet, jibSheet) {
  const v = new ctx.S.Vessel(specId);
  v.hdg = ctx.U.rad(hdgDeg);
  v.mainHoist = 1; v.jibOut = 1;
  v.mainSheet = mainSheet; v.jibSheet = jibSheet;
  v.boomAngle = mainSheet; v.jibAngle = jibSheet;
  return v;
}

/** Best steady STW over a lee-side sheet sweep at a fixed TWA (wind from north). */
function bestSTW(ctx, specId, twa, opts) {
  const o = opts || {};
  const lee = twa >= 0 ? -1 : 1; // wind from north; +twa = heading east of north = wind to port? see note
  // Convention here: heading = twa (wind FROM 000). Heading 045 puts the wind
  // on the port bow (awa negative) so the lee side is starboard (+).
  const leeSide = 1; // for positive twa headings the boom belongs to starboard
  let best = 0, bestSheet = 0, bestJib = 0;
  for (let sheet = 5; sheet <= 85; sheet += 5) {
    const jib = Math.min(85, sheet + (o.jibOffset === undefined ? 4 : o.jibOffset));
    const v = rigged(ctx, specId, twa, leeSide * sheet, leeSide * jib);
    v._windSide = -1; // wind on the port side for positive-heading sweep
    settleLocked(ctx, v, twa, o.seconds || 60);
    const s = fwdKn(ctx, v);
    if (s > best) { best = s; bestSheet = sheet; bestJib = jib; }
  }
  return { stw: best, sheet: bestSheet, jib: bestJib };
}

module.exports = { boot, DT, settleLocked, settleFree, fwdKn, rigged, bestSTW };
