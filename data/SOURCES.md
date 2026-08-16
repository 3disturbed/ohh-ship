# World data — sources, licences and attribution

Everything in `data/` is derived from open datasets by the scripts in `tools/`.
No ADMIRALTY / UK Hydrographic Office material is used: it is licensed and
cannot be redistributed in a game.

## ⚠ NOT FOR NAVIGATION

This is a game. The depths, marks and tides here are derived from survey and
gauge data at a resolution far coarser than any chart, are simplified for play,
and in places are deliberately invented (see *Carved channels* below). Do not
use any part of it to navigate a real vessel.

## Bathymetry — `uk-bathy.png`, `uk-bathy.json`

**EMODnet Bathymetry** Digital Terrain Model, licensed **CC-BY 4.0**.
<https://emodnet.ec.europa.eu/en/bathymetry>

Fetched via WCS as float32 GeoTIFF and baked to a 16-bit heightmap PNG
(elevation split across the red and green channels). 700 × 1250 cells over
8.8°W–2.0°E, 49.8°N–61.0°N: about 1 km. Elevation is metres above mean sea
level, positive up. Rebuild with `tools/build_uk.py`.

> Contains EMODnet Bathymetry data, © EMODnet Bathymetry Consortium, CC-BY 4.0.

## Navigation marks and harbours — `uk-marks.json`

**OpenStreetMap** contributors, **ODbL 1.0**, using the OpenSeaMap seamark
schema. <https://www.openstreetmap.org/copyright>

Buoys, beacons, lights and harbours in UK waters, fetched through the Overpass
API and filtered to navigationally significant marks. Rebuild with
`tools/fetch_all_marks.py` and `tools/bake_marks.py`.

**ODbL is share-alike.** This derived database is therefore offered under ODbL
1.0. If you produce a further derived database from it, you must do the same.

> Marks and harbours © OpenStreetMap contributors, ODbL 1.0.

## Tides — `uk-tides.json`

**Environment Agency / National Tide Gauge Network** real-time data, **Open
Government Licence v3.0**.
<https://environment.data.gov.uk/flood-monitoring/doc/reference>

Not a copy of anyone's tide tables. About a month of 15-minute observations
from each of ~43 gauges (Jersey to Lerwick) is least-squares fitted for the
M2, S2, N2, K2, K1, O1, M4 and MS4 constituents by `tools/fetch_tides.py`.
The game interpolates the resulting complex amplitudes between stations, so
range and timing vary around the coast the way they really do — roughly 12 m
in the Severn, under 2 m at Lowestoft, with the correct progression of high
water around Britain.

Chart datum is approximated as mean sea level minus the sum of the fitted
amplitudes, which is close to lowest astronomical tide. It is an approximation:
predicted heights and times here are a model, not a prediction.

> Contains Environment Agency data © Environment Agency and database right,
> Open Government Licence v3.0.

## Ports, carved channels and synthetic buoyage — `uk-ports.json`

The 1 km national grid, and even the ~115 m source, cannot resolve the narrow
drying channels that many small harbours sit behind. Which harbours become
ports, the route each one has to open water, the channels carved back in
where the survey is too coarse, and the lateral buoyage that marks them are
all baked offline by `node tools/bake_ports.js` into `data/uk-ports.json`,
from the committed bathymetry, tide fits and OSM harbour points.

The tool routes every port to Atlantic-connected open water over the real
bathymetry, carves only what the route needs, records each port's `gate` as
the walked minimum charted depth along its own route, and proves — against
the game's own tide model — that the deepest boat in the fleet gets a
continuous access window of at least two hours in every tidal cycle, even at
the worst neaps. Harbours with no viable route are moved a short way to
water (recorded under `moved`) or dropped (listed under `dropped` with a
reason). `node tools/bake_ports.js --check` re-validates the committed file
and exits non-zero on any failure.

The port list and buoyage are derived from OpenStreetMap data (ODbL 1.0);
the routes, channel depths and buoy positions are invented for play.
NOT FOR NAVIGATION.
