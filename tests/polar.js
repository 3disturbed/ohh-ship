/* polar.js — dump the steady-state polar for a vessel. The tuning instrument
   for the sail model, and (later) the source for js/polars.js.
   Usage: node tests/polar.js [specId] [twsKn,twsKn,...] */
'use strict';
const H = require('./harness');

const spec = process.argv[2] || 'centaur';
const twsList = (process.argv[3] || '8,12,16,20').split(',').map(Number);

for (const tws of twsList) {
  const ctx = H.boot({ twsKn: tws, twdDeg: 0 });
  console.log(`\n=== ${spec} — TWS ${tws}kn ===`);
  console.log('TWA   STW(kn)  VMGup   sheet  jib');
  for (let twa = 30; twa <= 180; twa += 5) {
    const r = H.bestSTW(ctx, spec, Math.min(twa, 179.9));
    const vmg = r.stw * Math.cos((twa * Math.PI) / 180);
    console.log(
      String(twa).padStart(3) +
      r.stw.toFixed(2).padStart(9) +
      vmg.toFixed(2).padStart(8) +
      String(r.sheet).padStart(7) +
      String(r.jib).padStart(5)
    );
  }
}
