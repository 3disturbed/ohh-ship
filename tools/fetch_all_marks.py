#!/usr/bin/env python3
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_osm import marks, harbours
# UK waters in bands (south to north); Overpass is happier with smaller areas
BANDS = [(49.8,-8.8,51.4,2.0),(51.4,-8.8,52.8,2.0),(52.8,-8.8,54.2,2.0),
         (54.2,-8.8,55.6,2.0),(55.6,-8.8,57.0,2.0),(57.0,-8.8,58.4,2.0),
         (58.4,-8.8,61.0,2.0)]
allm, allh = [], []
for i,(s,w,n,e) in enumerate(BANDS):
    print('marks band %d/%d lat %.1f-%.1f' % (i+1,len(BANDS),s,n), flush=True)
    allm += marks(s,w,n,e,'cache/marks_%d.json'%i).get('elements',[])
    print('  running total %d' % len(allm), flush=True)
    print('harbours band %d' % (i+1), flush=True)
    allh += harbours(s,w,n,e,'cache/harb_%d.json'%i).get('elements',[])
    print('  harbours total %d' % len(allh), flush=True)
json.dump(allm, open('cache/uk_marks_raw.json','w'))
json.dump(allh, open('cache/uk_harbours_raw.json','w'))
print('DONE marks %d harbours %d' % (len(allm), len(allh)), flush=True)
