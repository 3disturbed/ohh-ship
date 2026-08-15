#!/usr/bin/env python3
"""Bake the national bathymetry grid for Ohh Ship!

Source: EMODnet Bathymetry DTM (CC-BY 4.0). Elevation in metres, positive up,
relative to mean sea level. Written as a 16-bit heightmap PNG (value split
across the red and green channels) which the game decodes with a canvas.
"""
import sys, os, zlib, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_bathy import grid

# National extent: Scilly and the Channel up to Shetland
LON0, LAT0, LON1, LAT1 = -8.80, 49.80, 2.00, 61.00
NX, NY = 700, 1250          # about 1 km cells
SCALE = 0.25                # metres per stored unit -> +-8191 m range
BIAS = 32768 // 2

def main():
    g = grid(LON0, LAT0, LON1, LAT1, NX, NY)
    fin = [x for x in g if x == x and abs(x) < 1e30]
    print('cells %d, finite %d, min %.1f max %.1f' % (len(g), len(fin), min(fin), max(fin)))

    rows = []
    for y in range(NY):
        row = bytearray([0])                      # PNG filter: none
        for x in range(NX):
            e = g[y * NX + x]
            if e != e or abs(e) > 1e30:
                e = 40.0                          # no data -> treat as land
            q = int(round(e / SCALE)) + BIAS
            q = 0 if q < 0 else (65535 if q > 65535 else q)
            row += bytes((q >> 8, q & 255, 0))
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', NX, NY, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'uk-bathy.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'wb').write(png)
    print('wrote %s  %.0f KB' % (out, len(png) / 1024))

    meta = ('{"lon0":%g,"lat0":%g,"lon1":%g,"lat1":%g,"nx":%d,"ny":%d,'
            '"scale":%g,"bias":%d,'
            '"source":"EMODnet Bathymetry DTM, CC-BY 4.0",'
            '"datum":"metres above mean sea level"}'
            % (LON0, LAT0, LON1, LAT1, NX, NY, SCALE, BIAS))
    open(os.path.join(os.path.dirname(out), 'uk-bathy.json'), 'w').write(meta)
    print(meta)

if __name__ == '__main__':
    main()
