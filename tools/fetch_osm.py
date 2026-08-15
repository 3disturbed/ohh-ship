#!/usr/bin/env python3
"""Fetch navigation marks and harbours for UK waters from OpenStreetMap.

Data (c) OpenStreetMap contributors, ODbL 1.0. Seamark tagging is the
OpenSeaMap schema. https://www.openstreetmap.org/copyright
"""
import json, os, sys, time, urllib.request, urllib.parse

EP = "https://overpass-api.de/api/interpreter"
UA = 'ohh-ship-worldbuilder/1.0 (static sailing game; github.com/3disturbed/ohh-ship)'

MARK_TYPES = ("buoy_lateral|buoy_cardinal|buoy_safe_water|buoy_isolated_danger|"
              "buoy_special_purpose|beacon_lateral|beacon_cardinal|beacon_isolated_danger|"
              "beacon_safe_water|light_major|light_minor|landmark|light_vessel")

def run(q, cache):
    if os.path.exists(cache):
        return json.load(open(cache))
    for attempt in range(5):
        try:
            req = urllib.request.Request(EP, data=urllib.parse.urlencode({'data': q}).encode(),
                                         headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=300) as r:
                d = json.loads(r.read().decode())
            json.dump(d, open(cache, 'w'))
            return d
        except Exception as e:
            sys.stderr.write('  overpass attempt %d: %s\n' % (attempt + 1, e))
            time.sleep(20 * (attempt + 1))
    return {'elements': []}

def marks(s, w, n, e, cache):
    q = ('[out:json][timeout:280];('
         'node["seamark:type"~"^(%s)$"](%f,%f,%f,%f);'
         'way["seamark:type"~"^(%s)$"](%f,%f,%f,%f);'
         ');out center;' % (MARK_TYPES, s, w, n, e, MARK_TYPES, s, w, n, e))
    return run(q, cache)

def harbours(s, w, n, e, cache):
    q = ('[out:json][timeout:280];('
         'node["seamark:type"="harbour"](%f,%f,%f,%f);'
         'way["seamark:type"="harbour"](%f,%f,%f,%f);'
         'node["leisure"="marina"](%f,%f,%f,%f);'
         'way["leisure"="marina"](%f,%f,%f,%f);'
         ');out center;' % (s, w, n, e, s, w, n, e, s, w, n, e, s, w, n, e))
    return run(q, cache)
