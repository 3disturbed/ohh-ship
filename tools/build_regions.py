#!/usr/bin/env python3
"""Bake high-resolution bathymetry tiles for the cruising areas.

EMODnet's source is about 115 m, so the regions are built at 100 m: that
captures everything the survey actually knows. Anything finer than that in
the game is a carved channel, not data. Source: EMODnet Bathymetry DTM,
CC-BY 4.0.
"""
import json, math, os, struct, sys, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_bathy import grid

CELL = 100.0            # metres
SCALE, BIAS = 0.1, 16384

def write_png(path, nx, ny, vals):
    rows = []
    for y in range(ny):
        row = bytearray([0])
        for x in range(nx):
            e = vals[y * nx + x]
            if e != e or abs(e) > 1e30: e = 40.0
            q = int(round(e / SCALE)) + BIAS
            q = 0 if q < 0 else (65535 if q > 65535 else q)
            row += bytes((q >> 8, q & 255, 0))
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', nx, ny, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    open(path, 'wb').write(png)
    return len(png)

def main():
    regs = json.load(open('regions.json'))
    only = sys.argv[1] if len(sys.argv) > 1 else None
    out = []
    os.makedirs('../data/regions', exist_ok=True)
    for rid, name, lon0, lat0, lon1, lat1 in regs:
        if only and only != rid: continue
        midlat = (lat0 + lat1) / 2
        mlon = 111320.0 * math.cos(math.radians(midlat))
        nx = max(16, int(round((lon1 - lon0) * mlon / CELL)))
        ny = max(16, int(round((lat1 - lat0) * 111320.0 / CELL)))
        path = '../data/regions/%s.png' % rid
        if os.path.exists(path):
            sz = os.path.getsize(path)
        else:
            print('%-12s %dx%d cells' % (rid, nx, ny), flush=True)
            g = grid(lon0, lat0, lon1, lat1, nx, ny, tile_deg=1.0)
            fin = [v for v in g if v == v and abs(v) < 1e30]
            if not fin:
                print('  no data, skipped', flush=True); continue
            sz = write_png(path, nx, ny, g)
            print('  min %.1f max %.1f -> %.0f KB' % (min(fin), max(fin), sz / 1024), flush=True)
        out.append({'id': rid, 'name': name, 'lon0': lon0, 'lat0': lat0,
                    'lon1': lon1, 'lat1': lat1, 'nx': nx, 'ny': ny,
                    'scale': SCALE, 'bias': BIAS, 'bytes': sz})
    json.dump({'cell': CELL, 'regions': out}, open('../data/regions/index.json', 'w'),
              separators=(',', ':'))
    print('total %d regions, %.2f MB' % (len(out), sum(r['bytes'] for r in out) / 1048576))

if __name__ == '__main__':
    main()
