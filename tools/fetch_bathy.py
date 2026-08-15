#!/usr/bin/env python3
"""Fetch EMODnet bathymetry for a bbox and stitch it into one float grid.

EMODnet Bathymetry DTM, CC-BY 4.0 (https://emodnet.ec.europa.eu/en/bathymetry).
Values are metres relative to mean sea level, positive up.
"""
import sys, os, math, struct, time, urllib.request, urllib.parse
from tiff import read_float_tiff

WCS = "https://ows.emodnet-bathymetry.eu/wcs"

def fetch(bbox, w, h, path, tries=6):
    q = urllib.parse.urlencode({
        'service': 'WCS', 'version': '1.0.0', 'request': 'GetCoverage',
        'coverage': 'emodnet:mean', 'CRS': 'EPSG:4326',
        'BBOX': '%.6f,%.6f,%.6f,%.6f' % bbox, 'WIDTH': w, 'HEIGHT': h,
        'FORMAT': 'GeoTIFF'})
    req = urllib.request.Request(WCS + '?' + q, headers={
        'User-Agent': 'ohh-ship-worldbuilder/1.0 (static sailing game; contact via github.com/3disturbed/ohh-ship)'})
    for t in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                data = r.read()
            if data[:2] in (b'II', b'MM'):
                open(path, 'wb').write(data)
                return True
            sys.stderr.write('  not a tiff (%d bytes): %s\n' % (len(data), data[:120]))
        except Exception as e:
            sys.stderr.write('  attempt %d failed: %s\n' % (t + 1, e))
            time.sleep(3 * (t + 1))
    return False

def grid(lon0, lat0, lon1, lat1, nx, ny, cache='cache', tile_deg=2.0):
    """Return an nx*ny grid, row 0 = the north edge, of elevation in metres.

    The service caps how much *source* data one request may read, so the area
    is fetched in geographic tiles aligned exactly to the output grid.
    """
    os.makedirs(cache, exist_ok=True)
    out = [float('nan')] * (nx * ny)
    dlon, dlat = lon1 - lon0, lat1 - lat0
    ntx = int(math.ceil(dlon / tile_deg))
    nty = int(math.ceil(dlat / tile_deg))
    done = 0
    for ty in range(nty):
        # output rows for this tile (row 0 is the north edge)
        y0 = ny * ty // nty
        y1 = ny * (ty + 1) // nty
        top = lat1 - dlat * (y0 / ny)
        bot = lat1 - dlat * (y1 / ny)
        for tx in range(ntx):
            x0 = nx * tx // ntx
            x1 = nx * (tx + 1) // ntx
            west = lon0 + dlon * (x0 / nx)
            east = lon0 + dlon * (x1 / nx)
            w, h = x1 - x0, y1 - y0
            if w <= 0 or h <= 0:
                continue
            name = os.path.join(cache, 't_%.4f_%.4f_%.4f_%.4f_%d_%d.tif'
                                % (west, bot, east, top, w, h))
            done += 1
            if not os.path.exists(name):
                sys.stderr.write('tile %d/%d  lon %.2f..%.2f lat %.2f..%.2f  %dx%d\n'
                                 % (done, ntx * nty, west, east, bot, top, w, h))
                if not fetch((west, bot, east, top), w, h, name):
                    sys.stderr.write('  FAILED, leaving as no-data\n')
                    continue
            try:
                W, H, v, _ = read_float_tiff(name)
            except Exception as e:
                sys.stderr.write('  unreadable %s: %s\n' % (name, e))
                continue
            for r in range(min(H, h)):
                src = r * W
                dst = (y0 + r) * nx + x0
                n = min(W, w)
                out[dst:dst + n] = v[src:src + n]
    return out
