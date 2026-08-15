/* vessel.js — hull physics, sails, engine, rudder, cargo, instruments.
   (SDD §6–§19, §24, §52)

   Body frame: +x forward (surge), +y to starboard (sway), yaw positive to
   starboard. World frame: +x east, +y south, heading is a compass bearing. */
(function (S) {
  'use strict';
  var U = S.U, W = S.World, E = S.Env, D = S.DATA;

  var HOIST_TIME = 11, REEF_TIME = 22, FURL_TIME = 9;

  function Vessel(specId) {
    this.spec = D.vessel(specId);
    this.equipment = [];
    this.x = 0; this.y = 0; this.hdg = 0;
    this.vx = 0; this.vy = 0; this.yawRate = 0; this.heel = 0; this.roll = 0;
    this.rudder = 0; this.rudderCmd = 0;

    this.mainHoist = 0;      // 0 = stowed, 1 = fully hoisted
    this.mainReef = 0;
    this.mainSheet = 55;     // degrees off the centreline
    this.jibOut = 0;         // 0 = furled, 1 = fully set
    this.jibSheet = 55;
    /* signed angle of the boom and the headsail clew: negative to port,
       positive to starboard. They swing across; they never teleport. */
    this.boomAngle = -55; this.jibAngle = -55;
    this._reefing = 0;

    this.engine = { running: false, rpm: 0, throttle: 0, gear: 0, temp: 18, hours: 0, starting: 0 };
    this.fuel = this.spec.fuel_capacity_l * 0.5;
    this.cargo = [];
    this.damage = { hull: 0, rig: 0, sails: 0, engine: 0, rudder: 0 };
    this.grounded = false; this.groundTime = 0;
    this.moored = false; this.mx = 0; this.my = 0;   // alongside, lines made fast
    /* ground tackle (§56). The anchor lives on the seabed at a fixed point;
       the boat swings around it on whatever chain is veered. */
    this.anchor = { down: false, x: 0, y: 0, veer: 0, set: 0, dragging: 0,
                    tension: 0, weighing: 0, depth: 0 };
    this.boomSide = -1;      // latched: -1 boom to port, +1 to starboard

    this.dr = { x: 0, y: 0, err: 0 };
    this.log = 0;            // distance run through the water, metres
    this.autopilot = { on: false, mode: 'hdg', target: 0 };

    this.stw = 0; this.sog = 0; this.cog = 0; this.leeway = 0;
    this.awa = 0; this.aws = 0; this.ukc = 99; this.depth = 99;
    this.luffMain = 0; this.luffJib = 0; this.eff = 0;
    this.derive();
  }
  S.Vessel = Vessel;

  /* ---------- derived characteristics (§5, §7) ---------- */
  Vessel.prototype.derive = function () {
    var s = this.spec, t = s.displacement_kg / 1000;
    this.hullSpeedKn = 1.34 * Math.sqrt(s.lwl_m * U.FT);
    this.hullSpeed = this.hullSpeedKn * U.KN;
    /* resistance splits into viscous (dominant at low speed) and wave-making
       (negligible until she approaches hull speed, then brutal) — §8 */
    this.kVisc = 36 * Math.pow(t, 0.67);
    this.kWave = 500 * Math.pow(t, 0.67);
    this.kKeel = 4800 * Math.pow(t, 0.7);
    this.kLatQ = 900 * Math.pow(t, 0.7);
    this.kYaw = 3100 * Math.pow(t, 1.1);
    this.kWeather = 200 * t;
    this.kHeel = 300 * Math.pow(t, 0.9);
    this.inertia = s.displacement_kg * Math.pow(0.28 * s.loa_m, 2);
    this.lever = 0.42 * s.loa_m;
    this.xMain = -0.10 * s.loa_m;
    this.xJib = 0.24 * s.loa_m;
    /* tonnes per centimetre immersion, from an approximate waterplane area */
    this.tpc = 0.78 * s.loa_m * s.beam_m * 1.025 / 100;
    var am = s.sail_area_main_m2, aj = s.sail_area_headsail_m2;
    this.xCLR = (am * this.xMain + aj * this.xJib) / (am + aj);
    this.maxThrust = 110 * s.engine_kw;
    this.maxFuelFlow = 0.26 * s.engine_kw;   // litres/hour at full load
    this.rpmIdle = 800; this.rpmMax = 3000;
    this.chainTotal = (s.chain_m || 30) * (this.has('anchor2') ? 1.5 : 1);
    /* holding power of a well-set anchor at full scope, in newtons */
    this.anchorHold = 155 * (s.anchor_kg || 10) * (this.has('anchor2') ? 1.7 : 1);
  };

  Vessel.prototype.has = function (id) { return this.equipment.indexOf(id) >= 0; };

  /* ---------- mass, draft, capacity (§9, §10) ---------- */
  Vessel.prototype.cargoMass = function () {
    var m = 0; for (var i = 0; i < this.cargo.length; i++) m += this.cargo[i].mass; return m;
  };
  Vessel.prototype.cargoVolume = function () {
    var v = 0; for (var i = 0; i < this.cargo.length; i++) v += this.cargo[i].volume; return v;
  };
  Vessel.prototype.fuelCapacity = function () {
    return this.spec.fuel_capacity_l * (this.has('tank') ? 1.5 : 1);
  };
  Vessel.prototype.equipMass = function () { return this.equipment.length * 14; };
  Vessel.prototype.mass = function () {
    return this.spec.displacement_kg + this.fuel * 0.84 + this.cargoMass() + this.equipMass();
  };
  Vessel.prototype.payload = function () { return this.fuel * 0.84 + this.cargoMass() + this.equipMass(); };
  Vessel.prototype.draft = function () {
    return this.spec.base_draft_m + (this.payload() / 1000) / this.tpc / 100;
  };
  Vessel.prototype.sailArea = function () {
    var s = this.spec;
    var reefF = [1, 0.72, 0.5, 0.34][Math.min(3, this.mainReef)];
    var main = s.sail_area_main_m2 * reefF * this.mainHoist;
    var jib = s.sail_area_headsail_m2 * this.jibOut;
    return { main: main, jib: jib, total: main + jib };
  };

  /* ---------- sail aerodynamics (§14, §15) ---------- */
  /** lift and drag coefficients for a soft sail at angle of attack a (degrees) */
  function coeffs(a) {
    a = Math.abs(a);
    var ar = U.rad(Math.min(a, 179));
    var attached = Math.min(a / 25, 1.12);
    var ClA = 1.45 * Math.pow(attached, 0.85);
    var CdA = 0.05 + 0.38 * attached * attached;
    var Cn = 1.9 * Math.sin(ar);
    var ClP = Math.max(0, Cn * Math.cos(ar));
    var CdP = Cn * Math.sin(ar) + 0.06;
    var s = U.smooth((a - 21) / 17);
    return { cl: U.lerp(ClA, ClP, s), cd: U.lerp(CdA, CdP, s), stall: s };
  }
  Vessel.prototype.coeffs = coeffs;

  /* ---------- engine (§18, §19) ---------- */
  Vessel.prototype.engineStep = function (dt) {
    var en = this.engine, s = this.spec;
    var health = 1 - this.damage.engine;
    if (en.starting > 0) {
      en.starting -= dt;
      if (en.starting <= 0) {
        /* she always starts on fuel and a sound engine; a sick one may not */
        var willStart = this.fuel > 0.3 && (health > 0.5 || Math.random() < 0.25 + 1.5 * health);
        if (willStart) { en.running = true; en.rpm = this.rpmIdle; }
        else this.startFailed = this.fuel > 0.3 ? 'engine' : 'fuel';
      }
    }
    if (en.running && this.fuel <= 0.02) { en.running = false; }
    var target = en.running ? this.rpmIdle + en.throttle * (this.rpmMax * (0.55 + 0.45 * health) - this.rpmIdle) : 0;
    en.rpm = U.approach(en.rpm, target, 900, dt);
    var load = U.clamp((en.rpm - this.rpmIdle) / (this.rpmMax - this.rpmIdle), 0, 1);
    if (en.running) {
      var propEff = this.has('prop') ? 0.90 : 1;
      var lph = this.maxFuelFlow * (0.10 + 0.90 * Math.pow(load, 1.75)) * (en.gear !== 0 ? 1 : 0.45) * propEff;
      this.fuel = Math.max(0, this.fuel - lph * dt / 3600);
      en.hours += dt / 3600;
      var tt = 42 + 56 * load + (this.damage.engine > 0.55 ? 45 * (this.damage.engine - 0.55) / 0.45 : 0);
      en.temp = U.approach(en.temp, tt, 0.9, dt);
      if (en.temp > 104) this.damage.engine = Math.min(1, this.damage.engine + dt * 0.0016);
      /* wear */
      this.damage.engine = Math.min(1, this.damage.engine + dt * (0.0000012 + 0.0000030 * load * load));
    } else {
      en.temp = U.approach(en.temp, 16, 0.25, dt);
      en.rpm = U.approach(en.rpm, 0, 900, dt);
    }
    this.engineLoad = load;
  };
  Vessel.prototype.thrust = function (u) {
    var en = this.engine;
    if (!en.running || en.gear === 0) {
      /* a fixed propeller turning in the water is a brake */
      return this.has('prop') ? 0 : -U.sign(u) * Math.min(60, 9 * u * u);
    }
    var load = U.clamp((en.rpm - this.rpmIdle) / (this.rpmMax - this.rpmIdle), 0, 1);
    var uRef = this.hullSpeed * 1.18;
    var fade = U.clamp(1 - 0.55 * Math.pow(Math.max(0, u * en.gear) / uRef, 2), 0, 1);
    var pf = this.has('prop') ? 1.12 : 1;
    var t = this.maxThrust * pf * Math.pow(load, 1.25) * fade * (1 - 0.5 * this.damage.engine);
    return en.gear > 0 ? t : -t * 0.45;
  };

  /* ---------- autopilot (§31) ---------- */
  Vessel.prototype.pilotStep = function (dt) {
    var ap = this.autopilot;
    if (!ap.on || !this.has('autopilot')) return;
    /* positive error means "turn to starboard" in every mode */
    if (ap.mode === 'wpt') {
      if (!this.waypoint) { ap.mode = 'hdg'; ap.target = this.hdg; }
      else {
        var wd = U.len(this.waypoint.x - this.x, this.waypoint.y - this.y);
        if (wd < 130) {
          this._arrived = true; this.waypoint = null;
          ap.mode = 'hdg'; ap.target = this.hdg;
          this.engine.throttle = 0; this.engine.gear = 0;
        } else ap.target = U.bearingOf(this.waypoint.x - this.x, this.waypoint.y - this.y);
      }
    }
    var err = ap.mode === 'wind' ? -U.deg(U.wrapPI(U.rad(this.awa - ap.target)))
                                 : U.deg(U.angDiff(ap.target, this.hdg));
    this.rudderCmd = U.clamp(err * 1.5 - U.deg(this.yawRate) * 3.2, -30, 30);
  };

  /* =======================================================================
     MAIN PHYSICS STEP (§52) — called at a fixed 20 Hz
     ======================================================================= */
  Vessel.prototype.step = function (dt) {
    var s = this.spec, m = this.mass();
    this.engineStep(dt);
    var f = U.hvec(this.hdg);                     // unit vector, bow
    var st = { x: Math.cos(this.hdg), y: Math.sin(this.hdg) };  // unit vector, starboard

    /* --- environment --- */
    var cur = E.current(this.x, this.y);
    var tw = E.wind(this.x, this.y);
    var sea = this._sea || (this._sea = E.seaState(this.x, this.y));

    /* --- velocities --- */
    var wvx = this.vx - cur.x, wvy = this.vy - cur.y;      // through the water
    var u = wvx * f.x + wvy * f.y;
    var lat = wvx * st.x + wvy * st.y;
    this.stw = U.len(wvx, wvy);
    this.sog = U.len(this.vx, this.vy);
    this.cog = this.sog > 0.05 ? U.bearingOf(this.vx, this.vy) : this.hdg;
    this.ctw = this.stw > 0.05 ? U.bearingOf(wvx, wvy) : this.hdg;
    this.leeway = Math.abs(u) > 0.15 ? U.deg(Math.atan2(lat, Math.abs(u))) : 0;

    /* --- apparent wind (§13) --- */
    var twv = U.hvec(tw.dir);                              // points upwind
    var awx = -twv.x * tw.speed - this.vx, awy = -twv.y * tw.speed - this.vy;  // blowing-to vector
    this.aws = U.len(awx, awy);
    var fromX = -awx, fromY = -awy;
    this.awa = U.deg(Math.atan2(fromX * st.x + fromY * st.y, fromX * f.x + fromY * f.y));
    this.twd = tw.dir; this.tws = tw.speed;

    /* --- sail forces (§14) --- */
    /* The boom lies to leeward, but it takes time to swing across, and while
       it is on the wrong side the sail is backed — which is exactly how you
       get out of irons, and exactly how a gybe hurts. */
    var windSide = this.awa >= 0 ? 1 : -1;
    var aAbs = Math.abs(this.awa);
    /* Which side the boom lies on is a latched state, not a calculation.
       It crosses only when the wind is properly on the other side: through a
       tack it stays backed until she is round, and on a run it stays put until
       you sail far enough by the lee to gybe it. */
    if (this.boomSide === undefined) this.boomSide = this.boomAngle >= 0 ? 1 : -1;
    if (aAbs > 4 && aAbs < 168) this.boomSide = -windSide;
    var leeSide = this.boomSide;
    var swing = 34 + 80 * U.clamp(this.aws / 8, 0, 1.7);        // degrees per second
    this.boomAngle = U.approach(this.boomAngle, leeSide * this.mainSheet, swing, dt);
    this.jibAngle = U.approach(this.jibAngle, leeSide * this.jibSheet, swing * 1.9, dt);

    var area = this.sailArea();
    var q = 0.5 * U.RHO_AIR * this.aws * this.aws;
    var awaR = U.rad(this.awa);
    var wf = { x: Math.cos(awaR), y: Math.sin(awaR) };          // unit vector, wind from
    var wt = { x: -wf.x, y: -wf.y };                            // wind blows this way
    var heelF = Math.pow(Math.cos(this.heel), 1.3);
    var quality = (this.has('sails2') ? 1.08 : 1) * (1 - 0.45 * this.damage.sails) * 0.86;
    var drive = 0, sideBody = 0, yawSail = 0, sailSide = 0;
    this.luffMain = 0; this.luffJib = 0;
    var self = this;

    function addSail(A, saDeg, xPos, which) {
      if (A <= 0.01) return;
      var sa = U.rad(saDeg);
      var d = { x: -Math.cos(sa), y: Math.sin(sa) };            // mast towards clew
      var cosA = d.x * wt.x + d.y * wt.y;
      var sinA = d.x * wt.y - d.y * wt.x;
      var aoa = Math.abs(U.deg(Math.atan2(sinA, cosA)));
      if (aoa > 90) aoa = 180 - aoa;                            // a sail is a symmetric surface
      var sgn = sinA >= 0 ? 1 : -1;
      var nx = -d.y * sgn, ny = d.x * sgn;                      // normal, on the low-pressure side
      /* lift acts square to the flow; drag acts along it */
      var dot = nx * wt.x + ny * wt.y;
      var lx = nx - dot * wt.x, ly = ny - dot * wt.y;
      var ll = U.len(lx, ly);
      if (ll > 1e-4) { lx /= ll; ly /= ll; } else { lx = 0; ly = 0; }
      /* A soft sail only holds its shape when the wind is on its leeward face.
         Pressed the other way it is backed: it still pushes — that is how you
         get out of irons — but it flogs and cannot set properly. */
      var backed = (sinA >= 0 ? 1 : -1) === (saDeg >= 0 ? 1 : -1);
      var luff = aoa < 7 ? U.clamp((7 - aoa) / 7, 0, 1) : 0;
      var scale = (1 - luff * 0.92) * quality * heelF * (backed ? 0.45 : 1);
      var c = coeffs(aoa);
      var L = q * A * c.cl * scale, Dg = q * A * c.cd * scale;
      var fx = L * lx + Dg * wt.x, fy = L * ly + Dg * wt.y;
      drive += fx; sideBody += fy; sailSide += fy;
      yawSail += xPos * fy;
      if (which === 'm') self.luffMain = luff; else self.luffJib = luff;
    }
    addSail(area.main, this.boomAngle, this.xMain, 'm');
    addSail(area.jib, this.jibAngle, this.xJib, 'j');
    yawSail -= this.xCLR * sailSide;         /* hull lateral reaction at the CLR */

    /* windage on hull and rig (§6) — the bow presents far less area than the side.
       It acts well forward of the keel, which is why a boat will not sit head to
       wind: the bow always blows off onto one tack or the other. */
    var wq = 0.5 * U.RHO_AIR * this.aws * this.aws * s.windage_m2 * 0.8;
    drive += wq * wt.x * 0.34;
    sideBody += wq * wt.y;


    /* --- engine --- */
    var thrust = this.thrust(u);

    /* --- hydrodynamic drag (§8) --- */
    var absU = Math.abs(u);
    var r = absU / this.hullSpeed;
    var loadF = Math.pow(m / s.displacement_kg, 0.6);
    var seaF = 1 + 0.30 * U.clamp(sea.hs / 1.6, 0, 2.2);
    var foul = 1 + 0.35 * this.damage.hull;
    var resF = loadF * seaF * foul;
    var visc = this.kVisc * resF * Math.pow(absU, 1.85);
    var wave = this.kWave * resF * absU * absU * Math.pow(Math.max(0, r - 0.5), 3);
    var dragSurge = -U.sign(u) * (visc + wave);
    /* lateral resistance from the keel (§24). The energy lost to leeway comes
       out of the vector integration below — it must not be charged twice. */
    var dragLat = -(this.kKeel * absU * lat + this.kLatQ * lat * Math.abs(lat));

    /* --- rudder (§17) --- */
    this.rudder = U.approach(this.rudder, this.rudderCmd, 70, dt);
    var wash = (this.engine.running && this.engine.gear > 0) ?
      1.9 * Math.sqrt(Math.max(0, this.thrust(u)) / Math.max(1, this.maxThrust)) : 0;
    var flow = absU + wash;
    var dRad = U.rad(this.rudder);
    var rCn = 2.0 * Math.sin(dRad) * Math.cos(dRad * 0.5);
    var rArea = s.rudder_area_m2 * (1 - 0.6 * this.damage.rudder);
    var rForce = 0.5 * U.RHO_SEA * rArea * rCn * flow * flow * (u < -0.05 ? -1 : 1);
    /* helm to starboard turns the bow to starboard, which is positive yaw */
    var yawRudder = rForce * this.lever;
    dragSurge -= Math.abs(rForce * Math.sin(dRad)) * 0.5 * U.sign(u || 1);

    /* --- yaw balance --- */
    /* the hull seeks its own water track going forward, and is directionally
       unstable going astern — which is why backing a boat is so squirrelly */
    var yawWeather = this.kWeather * lat * u;
    var yawHeelInduced = this.kHeel * Math.sin(this.heel) * absU * absU * (this.awa >= 0 ? 1 : -1) * -1;
    var yawWalk = (this.engine.running && this.engine.gear < 0) ? 420 * (m / 1500) * this.engineLoad : 0;
    var yawWave = (U.fbm(this.x / 60, this.y / 60 + E.t * 0.5, 2, 5) - 0.5) * sea.hs * 260 * (m / 1500);
    /* yaw damping is hydrodynamic: it fades as the boat loses way, which is
       why she keeps swinging through a tack once she is turning */
    var yawDamp = -this.kYaw * this.yawRate * (0.22 + 0.62 * absU)
                  - this.kYaw * 1.6 * this.yawRate * Math.abs(this.yawRate);
    var N = yawSail + yawRudder + yawWeather + yawHeelInduced + yawWalk + yawWave + yawDamp;

    /* --- ground tackle (§56) --- */
    var anc = this.anchor;
    if (anc.down || anc.weighing > 0) {
      var adx = this.x - anc.x, ady = this.y - anc.y;
      var adist = U.len(adx, ady);
      anc.depth = W.getChartedDepth(anc.x, anc.y) + E.tideHeight(anc.x, anc.y) + 0.9;  // to the bow roller
      anc.scope = anc.veer / Math.max(0.6, anc.depth);

      if (anc.weighing > 0) {
        var rate = (this.has('windlass') ? 0.85 : 0.28) * dt;
        anc.veer = Math.max(0, anc.veer - rate);
        anc.weighing -= dt;
        if (anc.veer <= Math.max(0.5, anc.depth) || anc.weighing <= 0) {
          anc.down = false; anc.weighing = 0; anc.veer = 0; anc.set = 0; anc.dragging = 0; anc.tension = 0;
        }
      }

      if (anc.down) {
        /* the chain lies slack along the bottom until the boat pulls it taut */
        var slack = Math.sqrt(Math.max(0, anc.veer * anc.veer - anc.depth * anc.depth)) * 0.92;
        var bottomF = { mud: 1.0, sand: 0.92, gravel: 0.62, rock: 0.28 }[W.getBottom(anc.x, anc.y)] || 0.8;
        /* holding rises steeply with scope and needs time to dig in */
        var scopeF = U.clamp((anc.scope - 1.6) / 3.4, 0, 1);
        scopeF = scopeF * scopeF * (3 - 2 * scopeF) * (anc.scope > 6 ? 1.12 : 1);
        var hold = this.anchorHold * bottomF * scopeF * (0.32 + 0.68 * anc.set);

        if (adist > slack && adist > 0.4) {
          var stretch = adist - slack;
          var want = 900 * (m / 1500) * stretch;                 // chain stretched taut
          var T = Math.min(want, hold);
          anc.tension = T;
          var ux = -adx / adist, uy = -ady / adist;              // towards the anchor
          /* the chain comes aboard at the stemhead, so she lies to it bow-first */
          var fT = T * (ux * f.x + uy * f.y), sT = T * (ux * st.x + uy * st.y);
          drive += fT; sideBody += sT;
          N += (0.46 * s.loa_m - this.xCLR) * sT;
          /* digging in, or dragging */
          if (want > hold * 1.02) {
            var slip = Math.min((want - hold) / Math.max(1, hold) * dt * 0.9, this.sog * dt);
            anc.x += (this.x - anc.x) / adist * slip;
            anc.y += (this.y - anc.y) / adist * slip;
            /* only call it dragging when she is actually losing ground */
            if (slip > 0.0015) {
              anc.dragging = Math.min(1, anc.dragging + dt * 0.4);
              anc.set = Math.max(0, anc.set - dt * 0.25);
            } else anc.dragging = Math.max(0, anc.dragging - dt * 0.3);
          } else {
            anc.dragging = Math.max(0, anc.dragging - dt * 0.5);
            /* she digs herself in as she lies to the chain; going astern on
               her sets the anchor properly, as you would in practice */
            var digging = 0.035 + (this.engine.running && this.engine.gear < 0 ? 0.22 : 0);
            if (T > 40 || T > hold * 0.1) anc.set = Math.min(1, anc.set + dt * digging);
          }
        } else {
          anc.tension = 0;
          anc.dragging = Math.max(0, anc.dragging - dt * 0.5);
        }
      }
    }


    /* --- grounding (§11) --- */
    this.depth = W.getChartedDepth(this.x, this.y) + E.tideHeight(this.x, this.y);
    this.ukc = this.depth - this.draft();
    this.bottomType = W.getBottom(this.x, this.y);
    if (this.ukc <= 0) {
      if (!this.grounded) this.touch(-this.ukc);
      this.grounded = true; this.groundTime += dt;
      var grip = { mud: 0.55, sand: 0.85, gravel: 1.1, rock: 1.5 }[this.bottomType] || 1;
      var stick = U.clamp(-this.ukc / 0.5, 0.25, 1) * grip;
      dragSurge -= u * 2600 * stick * (m / 1500);
      N -= this.yawRate * 22000 * stick;
      if (thrust * u <= 0) dragSurge += thrust * 0.4;
    } else if (this.grounded && this.ukc > 0.06) {
      this.grounded = false; this.groundTime = 0;
    }

    /* --- integrate (§6) --- */
    var accS = (drive + thrust + dragSurge) / (m * 1.10);
    var accL = (sideBody + dragLat) / (m * 2.0);
    this.vx += (accS * f.x + accL * st.x) * dt;
    this.vy += (accS * f.y + accL * st.y) * dt;
    this.yawRate += N / this.inertia * dt;
    this.hdg = U.wrap(this.hdg + this.yawRate * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = U.clamp(this.x, 40, W.WIDTH - 40); this.y = U.clamp(this.y, 40, W.HEIGHT - 40);

    /* aground: she stops. Only a real effort towards deeper water shifts her,
       and the softer the bottom the better the chance (§11). */
    if (this.grounded) {
      var deep = U.hvec(W.deepwardBearing(this.x, this.y));
      var along = this.vx * deep.x + this.vy * deep.y;
      var slip = { mud: 0.45, sand: 0.3, gravel: 0.2, rock: 0.1 }[this.bottomType] || 0.25;
      var keep = Math.max(0, along) * slip;
      this.vx = deep.x * keep; this.vy = deep.y * keep;
      this.yawRate *= 0.15;
    }

    /* --- heel (§6) --- */
    var righting = m * U.G * s.gm_m;
    var hTarget = Math.atan2(Math.abs(sideBody) * s.ce_height_m, righting) * (sideBody > 0 ? 1 : -1);
    this.heel += (hTarget - this.heel) * Math.min(1, dt / 1.3);
    this.roll = Math.sin(E.t * 6.28 / Math.max(2.2, sea.period)) * sea.hs * 0.045 +
                Math.sin(E.t * 1.7 + 1.3) * sea.hs * 0.02;
    if (Math.abs(this.heel) > 0.95) {         // knockdown
      this.damage.sails = Math.min(1, this.damage.sails + 0.12);
      this.damage.rig = Math.min(1, this.damage.rig + 0.06);
      this.mainReef = Math.min(this.spec.reefs, this.mainReef + 1);
    }

    /* --- reefing and hoisting take time (§16) --- */
    if (this._reefing > 0) {
      this._reefing -= dt;
      if (this._reefing <= 0) { this.mainReef = this._reefTarget; this._reefing = 0; }
    }
    if (this._hoistTo !== undefined) {
      this.mainHoist = U.approach(this.mainHoist, this._hoistTo, 1 / HOIST_TIME, dt);
      if (this.mainHoist === this._hoistTo) delete this._hoistTo;
    }
    if (this._furlTo !== undefined) {
      this.jibOut = U.approach(this.jibOut, this._furlTo, 1 / FURL_TIME, dt);
      if (this.jibOut === this._furlTo) delete this._furlTo;
    }

    /* --- dead reckoning (§23) --- */
    this.log += this.stw * dt;
    if (this.has('gps')) { this.dr.x = this.x; this.dr.y = this.y; this.dr.err = 0; }
    else {
      this.dr.x += f.x * u * dt; this.dr.y += f.y * u * dt;
      this.dr.err = U.len(this.dr.x - this.x, this.dr.y - this.y);
    }

    /* --- cargo condition (§33) --- */
    if (this.cargo.length) {
      var slam = Math.max(0, sea.hs - 0.7) * Math.max(0, this.stw - 1.4) * dt * 0.0016;
      var tie = this.has('tiedowns') ? 0.5 : 1;
      if (slam > 0) for (var i = 0; i < this.cargo.length; i++) {
        var c = this.cargo[i], cd = D.CARGO[c.type];
        c.condition = Math.max(0, c.condition - slam * (0.3 + cd.frag) * tie);
      }
      /* perishables and refrigeration */
      var cold = this.has('fridge');
      for (var k = 0; k < this.cargo.length; k++) {
        var cc = this.cargo[k], dd = D.CARGO[cc.type];
        if (dd.perish > 0) {
          var rot = dd.perish * dt / 3600 * 0.024 * (dd.cold && !cold ? 3.2 : 1);
          cc.condition = Math.max(0, cc.condition - rot);
        }
      }
    }

    this.eff = area.total > 0 ? U.clamp(1 - Math.max(this.luffMain, this.luffJib), 0, 1) : 0;

    /* --- wear and tear on sails and rig (§39) ---
       Gear does not break because the wind is strong. It breaks because too
       much sail was left up in it, or because it was left flogging. */
    if (area.total > 0.05) {
      var awsKn = this.aws * U.MS2KN;
      /* Heel is the honest signal that a boat is carrying too much sail for
         the breeze, whatever her size. Past about 25 degrees she is being
         damaged as well as slowed. */
      var over = (Math.abs(U.deg(this.heel)) - 25) / 12;
      if (over > 0) {
        var rate = over * over * dt;
        this.damage.sails = Math.min(1, this.damage.sails + rate * 0.00008);
        this.damage.rig = Math.min(1, this.damage.rig + rate * 0.00004);
        this.overloaded = Math.min(3, over);
      } else this.overloaded = 0;
      /* a sail left flogging shakes itself to pieces */
      var lf = Math.max(this.luffMain, this.luffJib);
      var flog = lf > 0.3 ? (lf - 0.3) * (awsKn - 11) : 0;
      if (flog > 0) this.damage.sails = Math.min(1, this.damage.sails + flog * flog * dt * 0.0000055);
      /* crash gybe: the boom comes across loaded, and something has to give */
      if (this._prevBoom !== undefined && this.boomAngle * this._prevBoom < 0 &&
          Math.abs(this.boomAngle - this._prevBoom) > 3 && Math.abs(this.awa) > 115) {
        var shock = (awsKn - 11) / 22;
        if (shock > 0) {
          this.damage.rig = Math.min(1, this.damage.rig + shock * 0.085);
          this.damage.sails = Math.min(1, this.damage.sails + shock * 0.045);
          this.gybeShock = shock;
        }
      }
      /* slamming into a head sea works the whole rig */
      if (sea.hs > 1.1 && this.stw > 1.6 && Math.abs(this.awa) < 80) {
        this.damage.rig = Math.min(1, this.damage.rig +
          (sea.hs - 1.1) * (this.stw - 1.6) * dt * 0.00012);
      }
      /* the rig has taken all it can */
      if (this.damage.rig >= 1 && this.mainHoist + this.jibOut > 0.05) {
        this.mainHoist = 0; this.jibOut = 0;
        delete this._hoistTo; delete this._furlTo;
        this.dismasted = true;
      }
    } else this.overloaded = 0;
    this._prevBoom = this.boomAngle;

    /* alongside: the warps hold her against wind, tide and a running engine */
    if (this.moored) {
      this.x = this.mx; this.y = this.my;
      this.vx = 0; this.vy = 0; this.yawRate = 0;
      this.heel *= 0.6; this.grounded = false;
      this.anchor.down = false;
    }
    this.sane();
  };

  /** never let a bad number poison the whole simulation */
  Vessel.prototype.sane = function () {
    var bad = false, k;
    var scal = ['x', 'y', 'hdg', 'vx', 'vy', 'yawRate', 'heel', 'fuel', 'rudder', 'rudderCmd',
                'mainHoist', 'jibOut', 'mainSheet', 'jibSheet', 'log'];
    for (var i = 0; i < scal.length; i++) {
      k = scal[i];
      if (typeof this[k] !== 'number' || !isFinite(this[k])) { bad = true; break; }
    }
    for (k in this.damage) if (!isFinite(this.damage[k])) bad = true;
    if (this.anchor.down && (!isFinite(this.anchor.x) || !isFinite(this.anchor.veer))) bad = true;
    if (!isFinite(this.engine.rpm) || !isFinite(this.engine.throttle)) bad = true;
    if (!bad) return;
    console.warn('vessel state repaired');
    var W2 = S.World.nearestPort(isFinite(this.x) ? this.x : 2500, isFinite(this.y) ? this.y : 2760);
    this.x = W2.port.x; this.y = W2.port.y;
    this.vx = this.vy = this.yawRate = this.heel = 0;
    this.hdg = isFinite(this.hdg) ? this.hdg : 0;
    this.rudder = this.rudderCmd = 0;
    if (!isFinite(this.fuel)) this.fuel = 0;
    this.fuel = U.clamp(this.fuel, 0, this.fuelCapacity());
    if (!isFinite(this.log)) this.log = 0;
    this.mainHoist = U.clamp(this.mainHoist || 0, 0, 1);
    this.jibOut = U.clamp(this.jibOut || 0, 0, 1);
    this.mainSheet = U.clamp(this.mainSheet || 55, 0, 85);
    this.jibSheet = U.clamp(this.jibSheet || 55, 0, 85);
    this.engine.rpm = 0; this.engine.throttle = 0; this.engine.running = false;
    for (k in this.damage) if (!isFinite(this.damage[k])) this.damage[k] = 0;
    this.anchor = { down: false, x: 0, y: 0, veer: 0, set: 0, dragging: 0, tension: 0, weighing: 0, depth: 0 };
  };

  /* ---------- ground tackle commands (§56) ---------- */
  /** deepest water this boat can anchor in and still get decent scope */
  Vessel.prototype.maxAnchorDepth = function () { return this.chainTotal / 3.2; };
  Vessel.prototype.dropAnchor = function () {
    var a = this.anchor;
    if (a.down || this.moored) return 'no';
    var d = W.getChartedDepth(this.x, this.y) + E.tideHeight(this.x, this.y) + 0.9;
    if (d > this.maxAnchorDepth()) return 'deep';
    if (this.sog > 1.6 * U.KN) return 'fast';
    a.down = true; a.x = this.x; a.y = this.y; a.depth = d;
    a.set = 0; a.dragging = 0; a.tension = 0; a.weighing = 0;
    a.veer = U.clamp(d * 4, 0, this.chainTotal);      // let go four to one to start
    return 'ok';
  };
  Vessel.prototype.veerChain = function (metres) {
    var a = this.anchor;
    if (!a.down || a.weighing > 0) return;
    a.veer = U.clamp(a.veer + metres, Math.min(a.depth * 1.2, this.chainTotal), this.chainTotal);
  };
  Vessel.prototype.weighAnchor = function () {
    var a = this.anchor;
    if (!a.down || a.weighing > 0) return false;
    a.weighing = a.veer / (this.has('windlass') ? 0.85 : 0.28) + 4;
    return true;
  };
  /** radius she can swing to, and the shallowest water in that circle at low water */
  Vessel.prototype.swingRoom = function () {
    var a = this.anchor;
    if (!a.down) return null;
    var r = Math.sqrt(Math.max(0, a.veer * a.veer - a.depth * a.depth));
    var ti = E.tideInfo(a.x, a.y);
    var lw = ti.nextLWHeight, worst = 99, wx = 0, wy = 0;
    for (var i = 0; i < 24; i++) {
      var th = i / 24 * U.TAU;
      for (var k = 0.5; k <= 1.001; k += 0.5) {
        var px = a.x + Math.cos(th) * r * k, py = a.y + Math.sin(th) * r * k;
        var d = W.getChartedDepth(px, py) + lw;
        if (d < worst) { worst = d; wx = px; wy = py; }
      }
    }
    return { radius: r, lowWater: lw, lwTime: ti.nextLW, shallowest: worst,
             clearance: worst - this.draft(), x: wx, y: wy };
  };

  Vessel.prototype.mooredTo = function (x, y) {
    this.moored = true; this.mx = x; this.my = y; this.x = x; this.y = y;
    this.vx = this.vy = this.yawRate = 0;
  };
  Vessel.prototype.slipLines = function () {
    if (!this.moored) return false;
    this.moored = false;
    /* a shove off the quay, so she is never simply stuck */
    var f = U.hvec(this.hdg);
    this.vx = f.x * 0.25; this.vy = f.y * 0.25;
    return true;
  };

  /** re-sample the slow environment values (called at 5 Hz) */
  Vessel.prototype.envRefresh = function () { this._sea = E.seaState(this.x, this.y); };

  Vessel.prototype.touch = function (over) {
    var v = this.sog, hard = { mud: 0.25, sand: 0.6, gravel: 1.0, rock: 1.8 }[this.bottomType] || 1;
    if (this.spec.bilge) hard *= 0.45;      // twin keels sit upright and take it far better
    var dmg = U.clamp((v - 0.5) * 0.06 * hard, 0, 0.6);
    if (dmg > 0) {
      this.damage.hull = Math.min(1, this.damage.hull + dmg);
      if (this.bottomType === 'rock' && v > 1.8) this.damage.rudder = Math.min(1, this.damage.rudder + dmg * 0.6);
    }
    this.lastTouch = { speed: v, bottom: this.bottomType, dmg: dmg };
  };

  /* ---------- player commands ---------- */
  Vessel.prototype.hoistMain = function (up) { this._hoistTo = up ? 1 : 0; };
  Vessel.prototype.setReef = function (n) {
    n = U.clamp(n, 0, this.spec.reefs);
    if (n === this.mainReef || this._reefing > 0) return false;
    this._reefTarget = n;
    this._reefing = REEF_TIME * (1 + 0.5 * Math.abs(n - this.mainReef) - 0.5);
    return true;
  };
  Vessel.prototype.setJib = function (frac) {
    if (!this.has('furler')) frac = frac > 0.05 ? 1 : 0;
    this._furlTo = U.clamp(frac, 0, 1);
  };
  Vessel.prototype.startEngine = function () {
    if (this.engine.running || this.engine.starting > 0) return;
    if (this.fuel <= 0.02) return 'no fuel';
    this.engine.starting = 1.6;
  };
  Vessel.prototype.stopEngine = function () { this.engine.running = false; this.engine.starting = 0; };
  Vessel.prototype.fixPosition = function () {
    var nm = W.nearestMark(this.x, this.y), np = W.nearestPort(this.x, this.y);
    var d = Math.min(nm.dist, np.dist);
    var range = this.has('radar') ? 4000 : (E.daylight() > 0.35 ? 1400 : 900);
    if (d > range) return false;
    var acc = U.clamp(d / 22, 8, 140);
    this.dr.x = this.x + (Math.random() - 0.5) * acc;
    this.dr.y = this.y + (Math.random() - 0.5) * acc;
    this.dr.err = U.len(this.dr.x - this.x, this.dr.y - this.y);
    return nm.dist < np.dist ? nm.mark.n : np.port.name;
  };

  /* ---------- readouts (§22, §30) ---------- */
  Vessel.prototype.readout = function () {
    var hs = this._sea || { hs: 0 };
    return {
      hdg: this.hdg, stw: this.stw * U.MS2KN, sog: this.sog * U.MS2KN, cog: this.cog,
      depth: this.depth, ukc: this.ukc, draft: this.draft(),
      awa: this.awa, aws: this.aws * U.MS2KN, twd: this.twd, tws: this.tws * U.MS2KN,
      fuel: this.fuel, fuelPct: this.fuel / this.fuelCapacity(),
      rpm: this.engine.rpm, temp: this.engine.temp, heel: U.deg(this.heel),
      leeway: this.leeway, hs: hs.hs, log: this.log / U.NM,
      hullSpeed: this.hullSpeedKn
    };
  };
  /** litres per hour and range at the current engine setting (§19) */
  Vessel.prototype.rangeEstimate = function () {
    var load = this.engineLoad || 0;
    var lph = this.engine.running ?
      this.maxFuelFlow * (0.10 + 0.90 * Math.pow(load, 1.75)) * (this.engine.gear !== 0 ? 1 : 0.45) *
      (this.has('prop') ? 0.90 : 1) : 0;
    if (lph < 0.05) return { lph: lph, hours: Infinity, nmWater: Infinity, nmGround: Infinity };
    var hours = this.fuel / lph;
    return { lph: lph, hours: hours,
             nmWater: hours * this.stw * U.MS2KN, nmGround: hours * this.sog * U.MS2KN };
  };

  /* ---------- serialisation (§49) ---------- */
  Vessel.prototype.save = function () {
    return {
      spec: this.spec.id, equipment: this.equipment.slice(), fuel: this.fuel,
      moored: this.moored, mx: this.mx, my: this.my,
      x: this.x, y: this.y, hdg: this.hdg, dr: { x: this.dr.x, y: this.dr.y, err: this.dr.err },
      anchor: JSON.parse(JSON.stringify(this.anchor)),
      waypoint: this.waypoint || null,
      sails: { hoist: this.mainHoist, reef: this.mainReef, jib: this.jibOut,
               ms: this.mainSheet, js: this.jibSheet },
      cargo: JSON.parse(JSON.stringify(this.cargo)), damage: JSON.parse(JSON.stringify(this.damage)),
      hours: this.engine.hours, log: this.log
    };
  };
  function num(x, d) { return (typeof x === 'number' && isFinite(x)) ? x : d; }
  Vessel.load = function (o) {
    var v = new Vessel(o && o.spec);
    if (!o) return v;
    v.equipment = (o.equipment || []).filter(function (id) { return !!D.equip(id); });
    v.derive();
    v.fuel = U.clamp(num(o.fuel, 0), 0, v.fuelCapacity());
    v.cargo = (o.cargo || []).filter(function (c) { return c && D.CARGO[c.type]; }).map(function (c) {
      return { type: c.type, mass: num(c.mass, 0), volume: num(c.volume, 0),
               condition: U.clamp(num(c.condition, 1), 0, 1), contract: c.contract,
               fuelStart: num(c.fuelStart, v.fuel) };
    });
    if (o.damage) for (var k in v.damage) v.damage[k] = U.clamp(num(o.damage[k], 0), 0, 1);
    v.engine.hours = num(o.hours, 0);
    v.log = num(o.log, 0);
    v.moored = !!o.moored; v.mx = num(o.mx, 0); v.my = num(o.my, 0);
    v.x = num(o.x, 0); v.y = num(o.y, 0); v.hdg = num(o.hdg, 0);
    if (o.dr) v.dr = { x: num(o.dr.x, v.x), y: num(o.dr.y, v.y), err: num(o.dr.err, 0) };
    else v.dr = { x: v.x, y: v.y, err: 0 };
    if (o.anchor) {
      v.anchor.down = !!o.anchor.down; v.anchor.x = num(o.anchor.x, 0); v.anchor.y = num(o.anchor.y, 0);
      v.anchor.veer = U.clamp(num(o.anchor.veer, 0), 0, v.chainTotal);
      v.anchor.set = U.clamp(num(o.anchor.set, 0), 0, 1);
    }
    v.waypoint = o.waypoint || null;
    if (o.sails) {
      v.mainHoist = U.clamp(num(o.sails.hoist, 0), 0, 1);
      v.mainReef = U.clamp(num(o.sails.reef, 0), 0, v.spec.reefs);
      v.jibOut = U.clamp(num(o.sails.jib, 0), 0, 1);
      v.mainSheet = U.clamp(num(o.sails.ms, 55), 0, 85);
      v.jibSheet = U.clamp(num(o.sails.js, 55), 0, 85);
    }
    return v;
  };

})(window.SCS);
