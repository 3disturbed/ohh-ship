#!/usr/bin/env python3
"""Derive a national tidal model by harmonic analysis of real gauge records.

Source: Environment Agency / National Tide Gauge Network real-time data,
available under the Open Government Licence v3.0 via
https://environment.data.gov.uk/flood-monitoring/doc/reference

For each station we least-squares fit the standard constituents to about a
month of 15-minute observations, then express the result as height above an
approximate chart datum (MSL minus the sum of the amplitudes, which is close
to lowest astronomical tide).
"""
import json, math, os, sys, time, datetime, urllib.request

UA = 'ohh-ship-worldbuilder/1.0 (static sailing game; github.com/3disturbed/ohh-ship)'
BASE = 'https://environment.data.gov.uk/flood-monitoring'
# constituent, speed in degrees per hour
CONST = [('M2', 28.9841042), ('S2', 30.0000000), ('N2', 28.4397295),
         ('K2', 30.0821373), ('K1', 15.0410686), ('O1', 13.9430356),
         ('M4', 57.9682084), ('MS4', 58.9841042)]

def get(url, cache, tries=4):
    if cache and os.path.exists(cache):
        return json.load(open(cache))
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.loads(r.read().decode())
            if cache:
                json.dump(d, open(cache, 'w'))
            return d
        except Exception as e:
            sys.stderr.write('  %s\n' % e)
            time.sleep(8 * (t + 1))
    return None

def solve(A, b):
    """Least squares by normal equations with Gaussian elimination."""
    n = len(A[0])
    N = [[sum(A[k][i] * A[k][j] for k in range(len(A))) for j in range(n)] + \
         [sum(A[k][i] * b[k] for k in range(len(A)))] for i in range(n)]
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(N[r][i]))
        N[i], N[p] = N[p], N[i]
        if abs(N[i][i]) < 1e-12:
            return None
        for r in range(n):
            if r == i: continue
            f = N[r][i] / N[i][i]
            for c in range(i, n + 1):
                N[r][c] -= f * N[i][c]
    return [N[i][n] / N[i][i] for i in range(n)]

def fit(station, notation, lat, lon, days=30):
    since = (datetime.datetime.utcnow() - datetime.timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%SZ')
    url = '%s/id/stations/%s/readings?parameter=level&since=%s&_limit=4000' % (BASE, notation, since)
    d = get(url, 'cache/tide_%s.json' % notation)
    if not d: return None
    items = [x for x in d.get('items', []) if isinstance(x.get('value'), (int, float))]
    if len(items) < 600: return None
    t0 = None; ts = []; hs = []
    for x in items:
        try:
            dt = datetime.datetime.strptime(x['dateTime'], '%Y-%m-%dT%H:%M:%SZ')
        except Exception:
            continue
        if t0 is None: t0 = dt
        ts.append((dt - t0).total_seconds() / 3600.0)
        hs.append(float(x['value']))
    if len(ts) < 600: return None
    # design matrix: mean + cos/sin per constituent
    A = []
    for t in ts:
        row = [1.0]
        for _, sp in CONST:
            w = math.radians(sp) * t
            row += [math.cos(w), math.sin(w)]
        A.append(row)
    x = solve(A, hs)
    if x is None: return None
    out = {'name': station, 'id': notation, 'lat': lat, 'lon': lon,
           'epoch': t0.strftime('%Y-%m-%dT%H:%M:%SZ'), 'n': len(ts), 'con': {}}
    total = 0.0
    for i, (nm, sp) in enumerate(CONST):
        a, b = x[1 + 2 * i], x[2 + 2 * i]
        amp = math.hypot(a, b)
        pha = math.degrees(math.atan2(-b, a)) % 360.0     # h = amp*cos(wt - pha)
        out['con'][nm] = [round(amp, 4), round(pha, 2)]
        total += amp
    out['msl'] = round(x[0], 3)          # mean level in gauge datum
    out['z0'] = round(total, 3)          # MSL above approximate chart datum
    # residual, as a health check on the fit
    res = 0.0
    for k, t in enumerate(ts):
        p = x[0]
        for i, (nm, sp) in enumerate(CONST):
            w = math.radians(sp) * t
            p += x[1 + 2 * i] * math.cos(w) + x[2 + 2 * i] * math.sin(w)
        res += (p - hs[k]) ** 2
    out['rms'] = round(math.sqrt(res / len(ts)), 3)
    return out

def main():
    st = get(BASE + '/id/stations?type=TideGauge&_limit=500', 'cache/tidegauges.json')
    seen = {}
    for s in st['items']:
        lab = s.get('label'); lat = s.get('lat'); lon = s.get('long')
        if isinstance(lab, list): lab = lab[0]
        if not (lab and lat and lon) or lab in seen: continue
        seen[lab] = s['notation']
    out = []
    for i, (lab, note) in enumerate(sorted(seen.items())):
        s = [x for x in st['items'] if x['notation'] == note][0]
        la = s['lat']; lo = s['long']
        print('%2d/%d %-24s' % (i + 1, len(seen), lab), end=' ', flush=True)
        r = fit(lab, note, la, lo)
        # a gauge that reports a constant, or barely moves, is broken not tideless
        if r and (r['con']['M2'][0] < 0.05 or r['z0'] < 0.15):
            print('degenerate fit, dropped', flush=True); r = None
        if r:
            out.append(r)
            print('M2 %.2f m  phase %5.1f  Z0 %.2f  rms %.3f  n=%d'
                  % (r['con']['M2'][0], r['con']['M2'][1], r['z0'], r['rms'], r['n']), flush=True)
        else:
            print('no usable record', flush=True)
    json.dump(out, open('../data/uk-tides.json', 'w'), separators=(',', ':'))
    print('wrote %d stations' % len(out))

if __name__ == '__main__':
    main()
