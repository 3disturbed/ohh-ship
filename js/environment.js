/* environment.js — wind, tide height, tidal stream, weather, sea state.
   (SDD §12, §13, §20, §21, §25, §26)
   Everything is a pure function of position and time, so the same call
   works for "now" and for "forecast" and for "what will it be at 14:20". */
(function (S) {
  'use strict';
  var U = S.U, W = S.World;
  var E = S.Env = {};

  E.T_SEMI = 44700;          // semidiurnal period, 12h 25m
  E.SPRING_PERIOD = 1275720; // 14.765 days
  E.MSL = 2.45;              // mean sea level above chart datum (m)
  E.HW0 = 5.35 * 3600;       // time of the first high water
  E.SPRING0 = 1.1 * 86400;   // time of maximum (spring) range

  E.t = 6 * 3600;            // world time, seconds since Day 1 00:00
  E.seed = 1337;

  /* ===================== tides (§20, §21) =====================
     All of this now comes from Tide, which interpolates harmonic constants
     fitted to real gauge records. Positions arrive in game metres, so they
     are unprojected first. */
  function geo(x, y) { return S.Geo.unproject(x, y); }

  /** height of tide above chart datum, metres */
  E.tideHeight = function (x, y, t) {
    if (t === undefined) t = E.t;
    var g = geo(x, y);
    return S.Tide.height(g.lon, g.lat, t);
  };
  E.tideInfo = function (x, y, t) {
    if (t === undefined) t = E.t;
    var g = geo(x, y);
    return S.Tide.info(g.lon, g.lat, t);
  };
  E.springFactor = function (t) { return 0.71; };      // kept for old callers
  E.waterDepth = function (x, y, t) {
    return W.getChartedDepth(x, y) + E.tideHeight(x, y, t);
  };

  /** tidal stream, metres per second over the ground */
  E.current = function (x, y, t) {
    if (t === undefined) t = E.t;
    var g = geo(x, y);
    var dep = W.depthAtGeo(g.lon, g.lat) + S.Tide.height(g.lon, g.lat, t);
    if (dep < 0.4) return { x: 0, y: 0 };
    var c = S.Tide.stream(g.lon, g.lat, t, dep);
    /* the stream dies away in the shallows and inside harbours */
    var f = U.clamp(dep / 3, 0, 1);
    return { x: c.x * f, y: c.y * f };
  };

  /* ===================== weather & wind (§12, §25) ===================== */
  /** slow-moving weather: pressure drives wind strength and rain */
  E.weather = function (t) {
    if (t === undefined) t = E.t;
    var h = t / 3600;
    var sysA = Math.sin(U.TAU * h / 38) * 0.6 + Math.sin(U.TAU * h / 17.3 + 1.1) * 0.4;
    var sysB = U.noise1(h / 9, E.seed) - 0.5;
    var press = 1012 + sysA * 19 + sysB * 8;
    var storm = U.clamp((1011 - press) / 21, 0, 1);
    var rain = U.clamp(storm * 1.4 - 0.15 + (U.noise1(h / 3.1, E.seed + 5) - 0.5) * 0.5, 0, 1);
    var fog = U.clamp((U.noise1(h / 6.7, E.seed + 9) - 0.76) * 6, 0, 1) * (1 - storm) *
              (0.4 + 0.6 * U.clamp(1 - Math.abs(((t % 86400) / 3600) - 6) / 5, 0, 1));
    var vis = 12000 * (1 - 0.93 * fog) * (1 - 0.45 * rain);
    return { pressure: press, stormRisk: storm, rain: rain, fog: fog, visibility: vis,
             cloud: U.clamp(0.25 + storm * 0.8 + rain * 0.4, 0, 1) };
  };

  /** regional true wind before local shelter effects */
  E.regionalWind = function (t) {
    if (t === undefined) t = E.t;
    var h = t / 3600, wx = E.weather(t);
    var dir = 218 + 52 * Math.sin(U.TAU * h / 41) + 28 * Math.sin(U.TAU * h / 13.7 + 2.2)
              + (U.noise1(h / 2.6, E.seed + 3) - 0.5) * 26
              - wx.stormRisk * 44;                            // fronts veer the wind
    var spd = 5.0 + 7.0 * (0.5 + 0.5 * Math.sin(U.TAU * h / 19.4 + 0.7))
              + 19 * Math.pow(wx.stormRisk, 1.3)
              + (U.noise1(h / 1.7, E.seed + 8) - 0.5) * 4.2;
    /* diurnal sea breeze on quiet sunny afternoons */
    var hod = (t % 86400) / 3600;
    var breeze = U.clamp(1 - wx.stormRisk * 2, 0, 1) * Math.max(0, Math.sin(U.TAU * (hod - 8) / 24)) ;
    spd += breeze * 2.6;
    return { dir: U.wrap(U.rad(dir)), speed: Math.max(0.6, spd * U.KN) };
  };

  /** gust factor at this instant (fast, small-scale) */
  function gustFactor(x, y, t, storm) {
    var g = U.fbm(x / 900 - t * 0.02, y / 900 + t * 0.008, 2, E.seed + 21);
    return 1 + (g - 0.5) * (0.30 + 0.55 * storm);
  }

  /** true wind at a place: regional wind, sheltered by land upwind (§12) */
  E.wind = function (x, y, t) {
    if (t === undefined) t = E.t;
    var r = E.regionalWind(t), wx = E.weather(t);
    var v = U.hvec(r.dir), shelter = 0;                  // v points from the wind, upwind
    for (var d = 200; d <= 1400; d += 300) {
      var sx = x + v.x * d, sy = y + v.y * d;
      if (W.getChartedDepth(sx, sy) < -0.4) shelter += (1 - d / 1700);
    }
    shelter = U.clamp(shelter * 0.42, 0, 0.72);
    var g = gustFactor(x, y, t, wx.stormRisk);
    var spd = r.speed * (1 - shelter) * g;
    /* squalls: brief, strong, and they veer */
    var sq = U.clamp((U.noise1(t / 900 + x / 9000, E.seed + 33) - 0.80) * 6, 0, 1) * wx.stormRisk;
    spd *= 1 + sq * 0.75;
    return { dir: U.wrap(r.dir + (U.fbm(x / 2600, y / 2600 + t * 0.004, 2, E.seed + 44) - 0.5) * U.rad(22) + sq * U.rad(20)),
             speed: Math.max(0.3, spd), gust: g, squall: sq, shelter: shelter };
  };

  /** forecast with honest uncertainty — better kit narrows the band (§25) */
  E.forecast = function (t, quality) {
    var w = E.regionalWind(t), wx = E.weather(t);
    var lead = Math.max(0, (t - E.t) / 3600);
    var err = (0.10 + lead * 0.035) * (quality ? 0.45 : 1);
    var n = (U.noise1(t / 7200, E.seed + 71) - 0.5) * 2;
    return {
      t: t,
      dir: U.wrap(w.dir + n * err * U.rad(70)),
      dirSpread: err * 60,
      speed: Math.max(0.4, w.speed * (1 + n * err * 0.9)),
      speedSpread: err * 0.55,
      rain: wx.rain, fog: wx.fog, storm: wx.stormRisk, pressure: wx.pressure
    };
  };

  /* ===================== sea state (§26) ===================== */
  /** fetch-limited significant wave height, steepened by shallow water */
  E.seaState = function (x, y, t) {
    if (t === undefined) t = E.t;
    var w = E.wind(x, y, t), v = U.hvec(w.dir), fetch = 0;
    for (var d = 500; d <= 16000; d += 1300) {
      var sx = x + v.x * d, sy = y + v.y * d;
      var gg = S.Geo.unproject(sx, sy);
      if (gg.lat < 49.6 || gg.lat > 61.2 || gg.lon < -9 || gg.lon > 2.2) { fetch = d; break; }
      if (W.getChartedDepth(sx, sy) < -0.3) { fetch = d; break; }
      fetch = d;
    }
    var hs = 0.0021 * Math.pow(w.speed, 1.62) * Math.sqrt(fetch / 1000);
    var dep = Math.max(0.4, W.getChartedDepth(x, y) + E.tideHeight(x, y, t));
    hs *= 1 + 0.55 * U.clamp(1 - dep / 7, 0, 1);
    /* wind against tide stands the sea up */
    var cur = E.current(x, y, t), cs = U.len(cur.x, cur.y);
    if (cs > 0.15) {
      var wv = U.hvec(w.dir);
      var opp = -(wv.x * cur.x + wv.y * cur.y) / cs;   // +1 when stream runs into the wind
      hs *= 1 + 0.5 * Math.max(0, opp) * Math.min(1.6, cs * 1.4);
    }
    return { hs: Math.min(hs, 6), fetch: fetch, period: 2.2 + hs * 1.9 };
  };

  /* ===================== daylight ===================== */
  /** 0 = night, 1 = full day, with dawn and dusk in between */
  E.daylight = function (t) {
    if (t === undefined) t = E.t;
    var h = ((t % 86400) + 86400) % 86400 / 3600;
    return U.smooth((h - 4.6) / 1.7) * (1 - U.smooth((h - 19.6) / 1.7));
  };

  E.advance = function (dt) { E.t += dt; };

})(window.SCS);
