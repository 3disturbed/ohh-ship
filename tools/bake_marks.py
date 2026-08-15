#!/usr/bin/env python3
"""Filter and pack UK navigation marks and harbours for the game.

Source: OpenStreetMap contributors, ODbL 1.0 (OpenSeaMap seamark schema).
"""
import json, os, sys, math

KEEP = {'buoy_lateral':'L','buoy_cardinal':'C','buoy_safe_water':'W',
        'buoy_isolated_danger':'D','beacon_lateral':'l','beacon_cardinal':'c',
        'beacon_isolated_danger':'d','beacon_safe_water':'w',
        'light_major':'M','light_minor':'m','light_vessel':'V','landmark':'K'}
CAT = {'port':'p','starboard':'s','preferred_channel_port':'p',
       'preferred_channel_starboard':'s','north':'n','south':'S','east':'e','west':'W'}

def pos(e):
    if 'lat' in e: return e['lat'], e['lon']
    c = e.get('center')
    return (c['lat'], c['lon']) if c else (None, None)

def main():
    raw = json.load(open('cache/uk_marks_raw.json'))
    seen = set(); out = []
    for e in raw:
        t = e.get('tags', {})
        st = t.get('seamark:type')
        if st not in KEEP: continue
        la, lo = pos(e)
        if la is None: continue
        key = (round(la, 5), round(lo, 5), st)
        if key in seen: continue
        seen.add(key)
        name = (t.get('seamark:name') or t.get('name') or '').strip()
        cat = ''
        for k in ('seamark:buoy_lateral:category', 'seamark:buoy_cardinal:category',
                  'seamark:beacon_lateral:category', 'seamark:beacon_cardinal:category'):
            if t.get(k): cat = CAT.get(t[k], ''); break
        lt = (t.get('seamark:light:character') or '').strip()
        per = t.get('seamark:light:period') or ''
        col = (t.get('seamark:light:colour') or '').strip()
        # a landmark with no light and no name is scenery, not a mark
        if st == 'landmark' and not (name and lt): continue
        rec = [KEEP[st], round(lo, 5), round(la, 5), name[:28], cat]
        if lt: rec.append((lt + ('.' + str(per) + 's' if per else ''))[:14])
        if col: rec.append(col[:12])
        out.append(rec)
    out.sort(key=lambda r: (r[2], r[1]))

    harb = json.load(open('cache/uk_harbours_raw.json'))
    hs = []; hseen = set()
    for e in harb:
        t = e.get('tags', {})
        la, lo = pos(e)
        if la is None: continue
        name = (t.get('seamark:name') or t.get('name') or '').strip()
        if not name: continue
        key = name.lower()
        if key in hseen: continue
        hseen.add(key)
        hs.append([round(lo, 5), round(la, 5), name[:32],
                   'marina' if t.get('leisure') == 'marina' else 'harbour'])
    hs.sort(key=lambda r: (r[1], r[0]))

    doc = {'note': 'NOT FOR NAVIGATION. Marks and harbours (c) OpenStreetMap '
                   'contributors, ODbL 1.0. Derived database, also ODbL.',
           'kinds': {v: k for k, v in KEEP.items()},
           'marks': out, 'harbours': hs}
    p = '../data/uk-marks.json'
    json.dump(doc, open(p, 'w'), separators=(',', ':'))
    print('marks %d, harbours %d -> %s (%.0f KB)'
          % (len(out), len(hs), p, os.path.getsize(p) / 1024))
    from collections import Counter
    print(Counter(r[0] for r in out).most_common())

if __name__ == '__main__':
    main()
