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

  /* ===================== tidal height (§20) ===================== */
  /** local high-water lag in seconds — the tide runs later up the estuary */
  function tideLag(x, y) {
    var lag = 0;
    if (x > 16500 && y < 6200) lag += 1500 * U.smooth((x - 16500) / 2500) * U.smooth((6200 - y) / 3000);
    if (U.len(x - 10870, y - 9900) < 1600) lag += 900;
    if (x < 3500 && y > 9000) lag += 600;
    return lag;
  }
  E.tideLag = tideLag;

  /** springs/neaps multiplier, 0.42 (neaps) .. 1.0 (springs) */
  E.springFactor = function (t) {
    return 0.71 + 0.29 * Math.cos(U.TAU * (t - E.SPRING0) / E.SPRING_PERIOD);
  };
  E.range = function (t) { return 1.6 + 2.1 * (E.springFactor(t) - 0.42) / 0.58; };

  function heightAt(t, lag) {
    var rng = E.range(t);
    return E.MSL + (rng / 2) * Math.cos(U.TAU * (t - lag - E.HW0) / E.T_SEMI);
  }
  /** height of tide above chart datum, metres */
  E.tideHeight = function (x, y, t) {
    if (t === undefined) t = E.t;
    return heightAt(t, tideLag(x, y));
  };
  /** full tidal picture at a place: height, rate of rise, next HW/LW */
  E.tideInfo = function (x, y, t) {
    if (t === undefined) t = E.t;
    var lag = tideLag(x, y), h = heightAt(t, lag);
    var rate = (heightAt(t + 60, lag) - heightAt(t - 60, lag)) / 2; // m per minute
    var ph = U.TAU * (t - lag - E.HW0) / E.T_SEMI;
    var k = Math.floor(ph / U.TAU);
    var nextHW = E.HW0 + lag + (k + 1) * E.T_SEMI;
    var nextLW = E.HW0 + lag + (k + (ph - k * U.TAU > Math.PI ? 1.5 : 0.5)) * E.T_SEMI;
    if (nextLW < t) nextLW += E.T_SEMI;
    return {
      height: h, rate: rate, rising: rate > 0,
      nextHW: nextHW, nextHWHeight: heightAt(nextHW, lag),
      nextLW: nextLW, nextLWHeight: heightAt(nextLW, lag),
      range: E.range(t), springs: E.springFactor(t)
    };
  };
  /** actual depth of water (§53) */
  E.waterDepth = function (x, y, t) { return W.getChartedDepth(x, y) + E.tideHeight(x, y, t); };

  /* ===================== tidal stream (§21) ===================== */
  function zoneWeight(z, x, y) {
    var u = (x - z.x) / z.rx, v = (y - z.y) / z.ry, r = Math.sqrt(u * u + v * v);
    return r >= 1 ? 0 : U.smooth(1 - r);
  }
  /** tidal stream vector in m/s over the ground */
  E.current = function (x, y, t) {
    if (t === undefined) t = E.t;
    var sf = E.springFactor(t), cx = 0, cy = 0, tw = 0;
    for (var i = 0; i < W.STREAMS.length; i++) {
      var z = W.STREAMS[i], w = zoneWeight(z, x, y);
      if (w <= 0) continue;
      var ph = U.TAU * (t - E.HW0 - z.lag * 3600) / E.T_SEMI;
      var rate = -Math.sin(ph) * z.rate * sf * U.KN;   // flood positive on the rising tide
      var d = U.rad(z.dir), v = U.hvec(d);
      cx += v.x * rate * w; cy += v.y * rate * w; tw += w;
    }
    if (tw > 1) { cx /= tw; cy /= tw; }
    /* the stream dies away in very shallow water and inside harbours */
    var dep = W.getChartedDepth(x, y) + E.tideHeight(x, y, t);
    var f = U.clamp(dep / 2.5, 0, 1);
    return { x: cx * f, y: cy * f };
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
      if (sx < -500 || sy < -500 || sx > W.WIDTH + 500 || sy > W.HEIGHT + 500) { fetch = d; break; }
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
