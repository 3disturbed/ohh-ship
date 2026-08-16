/* bake_ports.js — pick the ports, find each one a real way to the sea, and
   guarantee its tidal window.

   Replaces the old load-time straight-radial carving in js/atlas.js, which
   invented channels the survey could not honour: the reported gate came from
   the carved slot while every other bearing was hard ground, so the game said
   "entry at any state of tide" and the player grounded (Conwy Marina bug).

   This tool routes each port to open water over the real bathymetry
   (bottleneck-aware Dijkstra on a 100 m lattice), carves only what the route
   needs, computes the honest gate as the shallowest charted depth along the
   route, and proves — against the game's own tide model — that the deepest
   boat in the fleet gets a continuous access window of at least two hours in
   every tidal cycle, even at the worst neaps. Ports with no viable route are
   moved a short way to water, or dropped.

     node tools/bake_ports.js              bake data/uk-ports.json
     node tools/bake_ports.js --check      validate the committed JSON (CI)
     node tools/bake_ports.js --only NAME  diagnose one harbour, write nothing

   Dependency-free: fs + zlib only. All depths, carves and tides come from the
   shipped js modules via tools/worldlib.js. NOT FOR NAVIGATION. */
'use strict';
const fs = require('fs'), path = require('path');
const { boot, ROOT } = require('./worldlib');

/* ---------------- design constants ---------------- */
const DRAFT = 1.68;            // deepest base draft in the fleet (js/data.js)
const MARGIN = 0.30;           // Ec.accessible default margin (js/economy.js)
const NEED = DRAFT + MARGIN;
const SAFETY = 0.15;           // payload sinkage + tide interpolation skew
const WIN_ASSERT = 2.0;        // hours: the promise, every cycle, worst neaps
const WIN_TARGET = 2.5;        // hours: requirement computed with margin
const WIN_DESIGN = 4.0;        // hours: what carves are designed to give
const POOL_BIG = 2.6, POOL_SMALL = 1.6;
const CH_HW = 70;              // approach channel half-width, metres
const CELL = 100, BOX = 18000; // routing lattice cell and half-extent, metres
const ESCAPE = 5;              // charted depth that counts as open water
const CARVE_MAX = 8000;        // most channel a route may need, metres
const LAND_EXEMPT = 300;       // berth-cell misregistration allowance, metres
const LAND_MAX = 250;          // hard land a route may cross beyond that
const MOVE_MAX = 4000;         // how far a port may be moved to water
const OCEAN_MIN = -3;          // national flood-fill passable depth
const OCEAN_SEED = [-8.5, 55.0];
const MIN_SEP = 2600, MAX_PORTS = 150, ALWAYS = ['Conwy Marina'];
const HOME = [-3.83953, 53.29189];   // js/game.js hard-codes this as home
const TAU = 12.4206 * 3600;    // one M2 cycle, seconds
const TIDE_STEP = 300, TIDE_DAYS = 32;

let CTX = null;                // { S, U, Geo, T, W, data }

/* ---------------- small helpers ---------------- */
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const r2 = (v) => Math.round(v * 100) / 100;
const len2 = (dx, dy) => Math.sqrt(dx * dx + dy * dy);

/** charted depth from the rasters alone — no carves. The routing must see the
    ground as surveyed, not channels already invented for other ports. */
function rawDepth(lon, lat) {
  const { T, W } = CTX;
  const r = W.rasterAt(lon, lat);
  if (!r) return -60;
  const e = r.at(lon, lat);
  if (e !== e) return -60;
  return -e - T.z0(lon, lat);
}

/* ---------------- tide windows ---------------- */
/** 32 days of tide heights at 300 s — the worst-cycle window statistics. */
function windowStats(lon, lat) {
  const { T } = CTX;
  const N = TIDE_DAYS * 86400 / TIDE_STEP;
  const h = new Float64Array(N);
  let minH = 1e9;
  for (let i = 0; i < N; i++) {
    h[i] = T.height(lon, lat, i * TIDE_STEP);
    if (h[i] < minH) minH = h[i];
  }
  return { h, minH,
           H2: worstCycleLevel(h, WIN_ASSERT),
           H2p5: worstCycleLevel(h, WIN_TARGET),
           H4: worstCycleLevel(h, WIN_DESIGN) };
}

/** the highest level that every cycle holds for `hours` continuously —
    i.e. min over cycles of (max over window starts of (min over the window)). */
function worstCycleLevel(h, hours) {
  const N = h.length, K = Math.round(hours * 3600 / TIDE_STEP);
  const nC = Math.floor(((N - K) * TIDE_STEP) / TAU);   // cycles fully served
  const best = new Float64Array(nC).fill(-1e9);
  const dq = new Int32Array(N); let head = 0, tail = 0; // deque of indices
  for (let i = 0; i < N; i++) {
    while (tail > head && h[dq[tail - 1]] >= h[i]) tail--;
    dq[tail++] = i;
    const s = i - K + 1;                                // window [s, i]
    if (s < 0) continue;
    if (dq[head] < s) head++;
    const c = Math.floor(s * TIDE_STEP / TAU);
    if (c < nC && h[dq[head]] > best[c]) best[c] = h[dq[head]];
  }
  let worst = 1e9;
  for (let c = 0; c < nC; c++) if (best[c] < worst) worst = best[c];
  return worst;
}

/** shortest over all cycles of the longest continuous run with h >= need.
    A run may straddle a cycle boundary; it counts for the cycle it starts in. */
function worstWindowHours(h, need) {
  const N = h.length;
  const runLen = new Int32Array(N);                    // run length starting at i
  for (let i = N - 1; i >= 0; i--)
    runLen[i] = h[i] >= need ? (i + 1 < N ? runLen[i + 1] : 0) + 1 : 0;
  const nC = Math.floor((N - 1) * TIDE_STEP / TAU);    // drop the clipped tail cycle
  let worst = 1e9;
  for (let c = 0; c < nC; c++) {
    const i0 = Math.round(c * TAU / TIDE_STEP), i1 = Math.min(N, Math.round((c + 1) * TAU / TIDE_STEP));
    let best = 0;
    for (let i = i0; i < i1; i++) if (runLen[i] > best) best = runLen[i];
    if (best < worst) worst = best;
  }
  return worst * TIDE_STEP / 3600;
}

/* ---------------- ocean connectivity ---------------- */
/** flood-fill the national grid from the Atlantic: cells of sea that actually
    connect to it. Loch Lomond is deep; it is not the sea. */
function buildOcean() {
  const { T, W } = CTX;
  const nat = W.rasters.filter((r) => r.id === 'national')[0];
  const nx = nat.nx, ny = nat.ny, n = nx * ny;
  const wet = new Uint8Array(n);
  for (let j = 0; j < ny; j++) {
    const lat = nat.lat1 - j * nat.dlat;
    for (let i = 0; i < nx; i++) {
      const lon = nat.lon0 + i * nat.dlon;
      if (-nat.elev[j * nx + i] - T.z0(lon, lat) > OCEAN_MIN) wet[j * nx + i] = 1;
    }
  }
  const ocean = new Uint8Array(n);
  const si = Math.round((OCEAN_SEED[0] - nat.lon0) / nat.dlon);
  const sj = Math.round((nat.lat1 - OCEAN_SEED[1]) / nat.dlat);
  const stack = [sj * nx + si];
  ocean[sj * nx + si] = 1;
  while (stack.length) {
    const o = stack.pop(), i = o % nx, j = (o - i) / nx;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const oo = jj * nx + ii;
        if (wet[oo] && !ocean[oo]) { ocean[oo] = 1; stack.push(oo); }
      }
  }
  return { nat, ocean, nx, ny };
}

/** is there Atlantic-connected sea within one national cell of here? */
function oceanNear(oc, lon, lat) {
  const i = Math.round((lon - oc.nat.lon0) / oc.nat.dlon);
  const j = Math.round((oc.nat.lat1 - lat) / oc.nat.dlat);
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= oc.nx || jj >= oc.ny) continue;
      if (oc.ocean[jj * oc.nx + ii]) return true;
    }
  return false;
}

/* ---------------- routing ---------------- */
const STEPS = [[1, 0, CELL], [-1, 0, CELL], [0, 1, CELL], [0, -1, CELL],
               [1, 1, CELL * Math.SQRT2], [1, -1, CELL * Math.SQRT2],
               [-1, 1, CELL * Math.SQRT2], [-1, -1, CELL * Math.SQRT2]];

/** multi-source Dijkstra from every open-sea cell in an 18 km box around the
    berth: cost-to-sea (and a parent tree) for every cell. One pass serves the
    route, the viability test and the relocation search. */
function seaField(bx, by, gCarve, hardAt, oc) {
  const { Geo } = CTX;
  const n = 2 * BOX / CELL + 1, c0 = (n - 1) / 2, N = n * n;
  const depth = new Float32Array(N), hard = new Uint8Array(N), goal = new Uint8Array(N);
  /* hardAt: dries above MHWS — never covered, real land. Below that the DTM
     is often biased high across whole estuaries (Conwy reads +1..+2.4 m MSL
     wall to wall), so anything intertidal-at-springs stays routable and the
     dredge cost below steers the route along the lowest ground instead. */
  let goals = 0;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const o = j * n + i;
      const x = bx + (i - c0) * CELL, y = by + (j - c0) * CELL;
      const g = Geo.unproject(x, y);
      const d = depth[o] = rawDepth(g.lon, g.lat);
      const fromBerth = len2((i - c0) * CELL, (j - c0) * CELL);
      if (d < hardAt && fromBerth > LAND_EXEMPT) hard[o] = 1;
      if (d >= ESCAPE && oceanNear(oc, g.lon, g.lat)) { goal[o] = 1; goals++; }
    }
  const dist = new Float64Array(N).fill(Infinity);
  const parent = new Int32Array(N).fill(-1);
  if (!goals) return { n, c0, depth, hard, goal, dist, parent, goals };

  /* per-metre traversal weight of a cell */
  const w = (o) => 1 + (depth[o] < gCarve ? 6 * (gCarve - depth[o]) : 0) + (hard[o] ? 400 : 0);

  /* binary heap of [key, idx] */
  const hk = [], hi = [];
  const push = (k, o) => {
    let i = hk.length; hk.push(k); hi.push(o);
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break;
      [hk[p], hk[i]] = [hk[i], hk[p]]; [hi[p], hi[i]] = [hi[i], hi[p]]; i = p; }
  };
  const pop = () => {
    const k = hk[0], o = hi[0], lk = hk.pop(), lo = hi.pop();
    if (hk.length) { hk[0] = lk; hi[0] = lo;
      let i = 0;
      for (;;) { const a = 2 * i + 1, b = a + 1; let m = i;
        if (a < hk.length && hk[a] < hk[m]) m = a;
        if (b < hk.length && hk[b] < hk[m]) m = b;
        if (m === i) break;
        [hk[m], hk[i]] = [hk[i], hk[m]]; [hi[m], hi[i]] = [hi[i], hi[m]]; i = m; }
    }
    return [k, o];
  };
  for (let o = 0; o < N; o++) if (goal[o]) { dist[o] = 0; push(0, o); }
  const seen = new Uint8Array(N);
  while (hk.length) {
    const [k, u] = pop();
    if (seen[u]) continue;
    seen[u] = 1;
    const ui = u % n, uj = (u - ui) / n, wu = w(u);
    for (let s = 0; s < 8; s++) {
      const vi = ui + STEPS[s][0], vj = uj + STEPS[s][1];
      if (vi < 0 || vj < 0 || vi >= n || vj >= n) continue;
      const v = vj * n + vi;
      if (seen[v]) continue;
      const nd = k + STEPS[s][2] * 0.5 * (wu + w(v));
      if (nd < dist[v]) { dist[v] = nd; parent[v] = u; push(nd, v); }
    }
  }
  return { n, c0, depth, hard, goal, dist, parent, goals };
}

/** walk the parent tree from a cell to the sea; measure what the route costs. */
function tracePath(f, o0, gCarve) {
  if (!isFinite(f.dist[o0])) return { ok: false };
  const cells = [];
  for (let o = o0, guard = 0; o >= 0 && guard < 1e5; o = f.parent[o], guard++) {
    cells.push(o);
    if (f.goal[o]) break;
  }
  let carveLen = 0, landLen = 0;
  for (let k = 1; k < cells.length; k++) {
    const a = cells[k - 1], b = cells[k];
    const ai = a % f.n, aj = (a - ai) / f.n, bi = b % f.n, bj = (b - bi) / f.n;
    const step = len2((bi - ai) * CELL, (bj - aj) * CELL);
    if (f.depth[a] < gCarve || f.depth[b] < gCarve) carveLen += step;
    if (f.hard[a] || f.hard[b]) landLen += step;
  }
  return { ok: carveLen <= CARVE_MAX && landLen <= LAND_MAX,
           cells, carveLen, landLen };
}

/** Douglas–Peucker on projected points, then a minimum vertex spacing. */
function simplify(pts, tol, minSpace) {
  const { U } = CTX;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = 0, wi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = U.distToSeg(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]);
      if (d > worst) { worst = d; wi = i; }
    }
    if (worst > tol) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (!keep[i]) continue;
    if (out.length && i < pts.length - 1 &&
        len2(pts[i][0] - out[out.length - 1][0], pts[i][1] - out[out.length - 1][1]) < minSpace) continue;
    out.push(pts[i]);
  }
  return out;
}

/** point and inbound (sea-to-berth) tangent at arc distance s from the berth */
function alongRoute(xy, s) {
  let acc = 0;
  for (let k = 1; k < xy.length; k++) {
    const dx = xy[k][0] - xy[k - 1][0], dy = xy[k][1] - xy[k - 1][1];
    const L = len2(dx, dy);
    if (acc + L >= s || k === xy.length - 1) {
      const t = L > 0 ? Math.min(1, Math.max(0, (s - acc) / L)) : 0;
      return { x: xy[k - 1][0] + dx * t, y: xy[k - 1][1] + dy * t,
               tx: -dx / (L || 1), ty: -dy / (L || 1) };   // inbound: toward berth
    }
    acc += L;
  }
  return null;
}

function routeLength(xy) {
  let L = 0;
  for (let k = 1; k < xy.length; k++) L += len2(xy[k][0] - xy[k - 1][0], xy[k][1] - xy[k - 1][1]);
  return L;
}

/** shallowest charted depth (with every carve registered) along a route */
function walkMin(xy, step) {
  const { Geo, W } = CTX;
  const L = routeLength(xy);
  let min = Infinity;
  for (let s = 0; s <= L; s += step) {
    const p = alongRoute(xy, s);
    const g = Geo.unproject(p.x, p.y);
    const d = W.depthAtGeo(g.lon, g.lat);
    if (d < min) min = d;
  }
  return min;
}

/* ---------------- the bake ---------------- */
function bake(onlyName) {
  CTX = boot();
  const { U, Geo, T, W, data } = CTX;
  const marksDoc = data('uk-marks.json');
  const t0 = Date.now();

  process.stderr.write('flood-filling the ocean...\n');
  const oc = buildOcean();

  /* real marks on a coarse grid, so synthetic buoys keep clear of them */
  const markGrid = new Map();
  marksDoc.marks.forEach((r) => {
    const p = Geo.project(r[1], r[2]);
    const key = ((p.x / 1000) | 0) + ':' + ((p.y / 1000) | 0);
    (markGrid.get(key) || markGrid.set(key, []).get(key)).push(p);
  });
  const nearRealMark = (x, y, radius) => {
    const i0 = ((x - radius) / 1000) | 0, i1 = ((x + radius) / 1000) | 0;
    const j0 = ((y - radius) / 1000) | 0, j1 = ((y + radius) / 1000) | 0;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const b = markGrid.get(i + ':' + j);
        if (b) for (let k = 0; k < b.length; k++)
          if (len2(b[k].x - x, b[k].y - y) < radius) return true;
      }
    return false;
  };

  /* candidates, scored exactly as js/atlas.js pickPorts did */
  let cands = [];
  marksDoc.harbours.forEach((row) => {
    const h = { lon: row[0], lat: row[1], name: row[2], kind: row[3] };
    const r = W.rasterAt(h.lon, h.lat);
    if (!r || r.id === 'national') return;            // only where we have detail
    const p = Geo.project(h.lon, h.lat);
    h.x = p.x; h.y = p.y;
    h.score = (h.kind === 'harbour' ? 2 : 0) +
              (/marina|yacht|quay|harbour|dock/i.test(h.name) ? 1 : 0) +
              (/boat ?yard|sailing club|private|proposed|slipway/i.test(h.name) ? -3 : 0);
    if (ALWAYS.indexOf(h.name) >= 0) h.score += 100;
    cands.push(h);
  });
  cands.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  if (onlyName) cands = cands.filter((c) => c.name.toLowerCase().includes(onlyName.toLowerCase()));

  const accepted = [], dropped = [], buoyRows = [];

  cands.forEach((c) => {
    if (accepted.length >= MAX_PORTS) return;
    for (let k = 0; k < accepted.length; k++)
      if (len2(c.x - accepted[k].h.x, c.y - accepted[k].h.y) < MIN_SEP) return;

    let ws = windowStats(c.lon, c.lat);
    let gMin = NEED + SAFETY - ws.H2p5;
    let gCarve = Math.min(POOL_BIG, NEED + SAFETY - ws.H4);
    const con = T.at(c.lon, c.lat);
    const hardAt = -(T.z0(c.lon, c.lat) + con.con.M2.a + con.con.S2.a);   // MHWS

    const bx = c.x, by = c.y;                // lattice origin, fixed pre-move
    const f = seaField(bx, by, gCarve, hardAt, oc);
    let berth = f.c0 * f.n + f.c0, moved = null;
    let trace = f.goals ? tracePath(f, berth, gCarve) : { ok: false };

    if (!trace.ok) {
      /* the "move them" rule: the nearest viable wet cell, weighted a little
         toward easy water; nothing found means the port goes */
      const opts = [];
      if (f.goals) {
        for (let o = 0; o < f.n * f.n; o++) {
          const i = o % f.n, j = (o - i) / f.n;
          const away = len2((i - f.c0) * CELL, (j - f.c0) * CELL);
          if (away > MOVE_MAX || f.depth[o] < -1.5 || !isFinite(f.dist[o])) continue;
          opts.push([away + 0.3 * f.dist[o], o, away]);
        }
        opts.sort((a, b) => a[0] - b[0]);
      }
      for (let k = 0; k < opts.length; k++) {
        const o = opts[k][1], i = o % f.n, j = (o - i) / f.n;
        const x = c.x + (i - f.c0) * CELL, y = c.y + (j - f.c0) * CELL;
        let sep = true;
        for (let q = 0; q < accepted.length; q++)
          if (len2(x - accepted[q].h.x, y - accepted[q].h.y) < MIN_SEP) { sep = false; break; }
        if (!sep) continue;
        const t = tracePath(f, o, gCarve);
        if (t.ok) { berth = o; trace = t; moved = [c.lon, c.lat]; break; }
      }
      if (!trace.ok) {
        const reason = !f.goals ? 'inland — no open sea within ' + (BOX / 1000) + ' km'
                     : trace.carveLen > CARVE_MAX ? 'no viable channel — would need ' + Math.round(trace.carveLen / 100) / 10 + ' km of dredging'
                     : 'no viable channel — hard ground across every route';
        dropped.push({ name: c.name, lon: r5(c.lon), lat: r5(c.lat), reason });
        return;
      }
    }

    /* final berth position */
    if (moved) {
      const i = berth % f.n, j = (berth - i) / f.n;
      c.x = bx + (i - f.c0) * CELL; c.y = by + (j - f.c0) * CELL;
      const g = Geo.unproject(c.x, c.y);
      c.lon = g.lon; c.lat = g.lat;
      ws = windowStats(c.lon, c.lat);
      gMin = NEED + SAFETY - ws.H2p5;
      gCarve = Math.min(POOL_BIG, NEED + SAFETY - ws.H4);
    }

    /* the route, berth first, as a sparse projected polyline; cell indices
       are relative to the lattice origin, not the possibly-moved berth */
    let xy = trace.cells.map((o) => {
      const i = o % f.n, j = (o - i) / f.n;
      return [bx + (i - f.c0) * CELL, by + (j - f.c0) * CELL];
    });
    xy[0] = [c.x, c.y];
    xy = simplify(xy, 35, 180);
    if (xy.length < 2) {
      /* the berth already lies in open water: give the route a short seaward
         stub along the deepest of sixteen bearings that stays in the ocean */
      let best = null;
      for (let a = 0; a < 16; a++) {
        const brg = a * Math.PI / 8;
        let worst = Infinity, end = null;
        for (let d = 100; d <= 400; d += 100) {
          end = Geo.unproject(c.x + Math.sin(brg) * d, c.y - Math.cos(brg) * d);
          worst = Math.min(worst, rawDepth(end.lon, end.lat));
        }
        const connected = oceanNear(oc, end.lon, end.lat);
        if (!best || (connected && !best.connected) ||
            (connected === best.connected && worst > best.worst))
          best = { worst, brg, connected };
      }
      xy.push([c.x + Math.sin(best.brg) * 400, c.y - Math.cos(best.brg) * 400]);
    }

    /* the berth pool floats her alongside; never let it be the binding gate */
    const big = c.score >= 2;
    const pool = r2(Math.max(big ? POOL_BIG : POOL_SMALL, Math.ceil(gMin * 10) / 10));
    W.addChannel([[c.lon, c.lat], [c.lon + 1e-5, c.lat + 1e-5]],
                 (big ? 240 : 170) * 0.5, pool, c.name);

    /* carve only as far out as the survey is too shallow */
    const L = routeLength(xy);
    let shallowEnd = -1;
    for (let s = 0; s <= L; s += 25) {     // same pitch as walkMin: every point
      const p = alongRoute(xy, s);         // the gate walk sees is either carved
      const g = Geo.unproject(p.x, p.y);   // or naturally at least gCarve
      if (W.depthAtGeo(g.lon, g.lat) < gCarve) shallowEnd = s;
    }
    let channel = null;
    if (shallowEnd >= 0) {
      const carveTo = Math.min(L, shallowEnd + 200);
      const cpts = [];
      for (let k = 0, acc = 0; k < xy.length; k++) {
        if (k > 0) acc += len2(xy[k][0] - xy[k - 1][0], xy[k][1] - xy[k - 1][1]);
        cpts.push(xy[k]);
        if (acc >= carveTo) break;
      }
      const end = alongRoute(xy, carveTo);
      if (len2(end.x - cpts[cpts.length - 1][0], end.y - cpts[cpts.length - 1][1]) > 40)
        cpts.push([end.x, end.y]);
      if (cpts.length > 1) {
        const ll = cpts.map((p) => { const g = Geo.unproject(p[0], p[1]); return [r5(g.lon), r5(g.lat)]; });
        channel = { pts: ll, hw: CH_HW, d: r2(gCarve) };
        W.addChannel(ll, CH_HW, gCarve, c.name + ' approach');

        /* synthetic buoyage down the carved reach: lateral pairs, IALA A for
           the boat coming in from seaward */
        const CL = Math.min(carveTo, L);
        if (CL > 300) {
          const pairs = Math.min(7, Math.max(1, Math.floor(CL / 500)));
          const spacing = CL / pairs;
          for (let k = 0; k < pairs; k++) {
            const s = CL - (k + 0.5) * spacing;      // k = 0 is the outermost
            const p = alongRoute(xy, s);
            const lx = p.ty, ly = -p.tx;             // left of the inbound track
            const put = (side, dx, dy, num) => {
              const x = p.x + dx * CH_HW, y = p.y + dy * CH_HW;
              if (nearRealMark(x, y, 200)) return;
              const g = Geo.unproject(x, y);
              buoyRows.push(['L', r5(g.lon), r5(g.lat), 'No ' + num, side,
                             k === 0 ? 'Q' : 'Fl.5s', side === 'p' ? 'red' : 'green']);
            };
            put('s', -lx, -ly, 2 * k + 1);
            put('p', lx, ly, 2 * k + 2);
          }
        }
      }
    }

    accepted.push({ h: c, big, pool, gMin, gCarve, ws, xy, channel, moved,
                    carveLen: trace.carveLen });
    process.stderr.write('  ' + accepted.length + '. ' + c.name +
      (moved ? ' (moved ' + Math.round(len2(c.x - Geo.project(moved[0], moved[1]).x, c.y - Geo.project(moved[0], moved[1]).y)) + ' m)' : '') + '\n');
  });

  /* second pass, every channel now registered: honest gates and the proof */
  const rows = [];
  accepted.sort((a, b) => a.h.y - b.h.y);
  const ports = accepted.map((a, i) => {
    const c = a.h;
    const routeMin = walkMin(a.xy, 25);
    const gate = r2(Math.min(a.pool, routeMin));
    const need = NEED - gate;
    const always = a.ws.minH >= need;
    const winH = always ? TAU / 3600 : worstWindowHours(a.ws.h, need);
    const pass = always || a.ws.H2 >= need;
    const p400 = alongRoute(a.xy, Math.min(400, routeLength(a.xy) - 1));
    const hdg = Math.round(U.bearingOf(p400.x - c.x, p400.y - c.y) * 180 / Math.PI);
    rows.push({ name: c.name, gate, pool: a.pool, carved: a.channel ? Math.round(a.carveLen) : 0,
                win: always ? 'always' : winH.toFixed(1) + ' h', moved: !!a.moved, pass });
    if (process.env.BAKE_DEBUG)
      console.log('    ' + c.name + ': gCarve ' + r2(a.gCarve) + ' gMin ' + r2(a.gMin) +
        ' routeMin ' + r2(routeMin) + ' H2 ' + r2(a.ws.H2) + ' H4 ' + r2(a.ws.H4) + ' need ' + r2(need));
    const port = {
      id: 'p' + i, name: c.name, lon: r5(c.lon), lat: r5(c.lat),
      region: (W.rasterAt(c.lon, c.lat) || {}).name || '',
      r: a.big ? 240 : 170,
      berth: 8 + Math.round((a.big ? 16 : 8) * (0.6 + 0.8 * ((i * 37) % 10) / 10)),
      fuel: (a.big || i % 4 === 0) ? 0.95 : 0,
      yard: (a.big || i % 7 === 0),
      chandler: (a.big || i % 3 === 0),
      size: a.big ? 0.9 : 0.55,
      pool: a.pool, gate, hdg: (hdg % 360 + 360) % 360,
      route: a.xy.map((p) => { const g = Geo.unproject(p[0], p[1]); return [r5(g.lon), r5(g.lat)]; }),
    };
    if (a.channel) port.channels = [a.channel];
    if (a.moved) port.moved = [r5(a.moved[0]), r5(a.moved[1])];
    return port;
  });

  /* report */
  const wName = Math.max(...rows.map((r) => r.name.length), 4);
  console.log('\n  port'.padEnd(wName + 4) + 'gate   pool   carved   worst window');
  rows.forEach((r) => {
    console.log('  ' + (r.pass ? ' ' : '!') + ' ' + r.name.padEnd(wName) +
      String(r.gate).padStart(6) + String(r.pool).padStart(7) +
      (r.carved ? (r.carved + ' m').padStart(9) : '-'.padStart(9)) +
      ('  ' + r.win) + (r.moved ? '   [moved]' : ''));
  });
  console.log('\n  ' + rows.length + ' ports, ' + rows.filter((r) => r.win === 'always').length +
    ' always open, ' + rows.filter((r) => r.moved).length + ' moved, ' + dropped.length + ' dropped');
  dropped.forEach((d) => console.log('    dropped: ' + d.name + ' — ' + d.reason));
  const bad = rows.filter((r) => !r.pass);
  if (bad.length) {
    console.error('\nFAIL: ' + bad.map((r) => r.name).join(', ') + ' cannot make the ' + WIN_ASSERT + ' h window');
    process.exit(1);
  }

  if (onlyName) { console.log('\n(--only: nothing written)'); return; }

  const home = Geo.project(HOME[0], HOME[1]);
  const conwy = accepted.filter((a) => a.h.name === 'Conwy Marina' &&
    len2(a.h.x - home.x, a.h.y - home.y) < 3000);
  if (!conwy.length) { console.error('FAIL: Conwy Marina (the home port) did not survive the bake'); process.exit(1); }

  const doc = {
    note: 'NOT FOR NAVIGATION. Ports derived from OpenStreetMap harbours (ODbL 1.0) and EMODnet bathymetry (CC-BY 4.0); routes, channels and buoyage are invented for play. Generated by tools/bake_ports.js — do not edit by hand.',
    v: 1,
    params: { draft: DRAFT, margin: MARGIN, safety: SAFETY, windowHours: WIN_ASSERT, designHours: WIN_DESIGN },
    ports, marks: buoyRows, dropped,
  };
  const out = path.join(ROOT, 'data', 'uk-ports.json');
  fs.writeFileSync(out, jsonPretty(doc));
  console.log('\n  wrote ' + out + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB) in ' +
    ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}

/** one port / one mark per line — diffable without being bulky */
function jsonPretty(doc) {
  return '{\n' +
    '"note": ' + JSON.stringify(doc.note) + ',\n' +
    '"v": ' + doc.v + ',\n' +
    '"params": ' + JSON.stringify(doc.params) + ',\n' +
    '"ports": [\n' + doc.ports.map((p) => JSON.stringify(p)).join(',\n') + '\n],\n' +
    '"marks": [\n' + doc.marks.map((m) => JSON.stringify(m)).join(',\n') + '\n],\n' +
    '"dropped": ' + JSON.stringify(doc.dropped, null, 1) + '\n}\n';
}

/* ---------------- the check (CI) ---------------- */
function check() {
  CTX = boot();
  const { Geo, W } = CTX;
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'uk-ports.json'), 'utf8'));
  const oc = buildOcean();
  let fails = 0;
  const fail = (m) => { console.error('  FAIL ' + m); fails++; };

  /* register everything first — gates are honest against the full carve set */
  doc.ports.forEach((p) => {
    W.addChannel([[p.lon, p.lat], [p.lon + 1e-5, p.lat + 1e-5]], p.r * 0.5, p.pool, p.name);
    (p.channels || []).forEach((ch) => W.addChannel(ch.pts, ch.hw, ch.d, p.name + ' approach'));
  });

  const seen = new Set();
  const proj = doc.ports.map((p) => Geo.project(p.lon, p.lat));
  doc.ports.forEach((p, i) => {
    const failsBefore = fails;
    if (seen.has(p.id)) fail(p.name + ': duplicate id ' + p.id);
    seen.add(p.id);
    for (let k = 0; k < i; k++)
      if (len2(proj[i].x - proj[k].x, proj[i].y - proj[k].y) < MIN_SEP)
        fail(p.name + ': closer than ' + MIN_SEP + ' m to ' + doc.ports[k].name);

    const xy = p.route.map((q) => { const g = Geo.project(q[0], q[1]); return [g.x, g.y]; });
    if (len2(xy[0][0] - proj[i].x, xy[0][1] - proj[i].y) > 150)
      fail(p.name + ': route does not start at the berth');
    const last = p.route[p.route.length - 1];
    if (rawDepth(last[0], last[1]) < 4) fail(p.name + ': route does not reach open water');
    if (!oceanNear(oc, last[0], last[1])) fail(p.name + ': route ends in water not connected to the sea');

    const routeMin = walkMin(xy, 25);
    if (routeMin < p.gate - 0.05)
      fail(p.name + ': gate ' + p.gate + ' overstates the route (min ' + r2(routeMin) + ')');
    if (p.gate > p.pool + 0.001) fail(p.name + ': gate deeper than the pool');

    const ws = windowStats(p.lon, p.lat);
    const need = NEED - p.gate;
    if (!(ws.minH >= need || ws.H2 >= need))
      fail(p.name + ': worst-neap ' + WIN_ASSERT + ' h window fails (need ' + r2(need) +
           ' m, worst 2 h level ' + r2(ws.H2) + ' m)');
    const winH = ws.minH >= need ? 'always' : worstWindowHours(ws.h, need).toFixed(1) + ' h';
    if (fails === failsBefore)
      console.log('  ok ' + p.name.padEnd(36) + ' gate ' + String(p.gate).padStart(6) + '   ' + winH);
  });

  const home = Geo.project(HOME[0], HOME[1]);
  const conwy = doc.ports.filter((p, i) =>
    p.name === 'Conwy Marina' && len2(proj[i].x - home.x, proj[i].y - home.y) < 3000);
  if (!conwy.length) fail('Conwy Marina missing near the home coordinates');
  else {
    const xy = conwy[0].route.map((q) => { const g = Geo.project(q[0], q[1]); return [g.x, g.y]; });
    if (routeLength(xy) < 600) fail('Conwy Marina: route too short for the tutorial offing');
  }

  console.log(fails ? '\n' + fails + ' failure(s)' : '\nall ' + doc.ports.length + ' ports pass');
  process.exit(fails ? 1 : 0);
}

/* ---------------- entry ---------------- */
const args = process.argv.slice(2);
if (args[0] === '--check') check();
else if (args[0] === '--only') bake(args[1] || '');
else bake(null);
