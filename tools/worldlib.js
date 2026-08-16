/* worldlib.js — boot the shipped world headless (Node, no dependencies).

   Loads the real js/util.js, js/geo.js, js/tide.js and js/world.js into a vm
   sandbox (the tests/harness.js pattern), then feeds them the committed data:
   the fitted tide constituents, the national bathymetry and every region
   raster. Every depth, carve, z0 and tide height computed here comes from the
   exact code the game ships. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const png = require('./png16');

const ROOT = path.join(__dirname, '..');

function boot() {
  const sandbox = {
    window: {},
    console: { log: console.log, warn: console.warn, error: console.error },
    Math, JSON, isFinite, Date, Infinity, NaN, undefined,
  };
  sandbox.window.SCS = {};
  vm.createContext(sandbox);
  const load = (f) =>
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
  const data = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

  load('util.js');
  load('geo.js');
  load('tide.js');
  load('world.js');

  const S = sandbox.window.SCS;
  S.Tide.load(data('uk-tides.json'));

  const bathyMeta = data('uk-bathy.json');
  bathyMeta.id = 'national';
  S.World.addRaster(bathyMeta, png.decode(path.join(ROOT, 'data', 'uk-bathy.png')).data);

  data('regions/index.json').regions.forEach((m) => {
    S.World.addRaster(m, png.decode(path.join(ROOT, 'data', 'regions', m.id + '.png')).data);
  });

  return { S, U: S.U, Geo: S.Geo, T: S.Tide, W: S.World, data };
}

module.exports = { boot, ROOT };
