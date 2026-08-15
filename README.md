# Ohh Ship! — Sailing Courier Simulator

**▶ Play in your browser: https://3disturbed.github.io/ohh-ship/**

A top-down sailing, navigation and coastal-courier simulator that runs entirely
in the browser. No build step, no dependencies — plain HTML, CSS and JavaScript.

Wind, tide, depth, draft, hull speed, cargo weight, fuel, sail trim, ground
tackle and navigation all decide whether a job is profitable, late, dangerous
or impossible. The design document that the game was built from follows.

**Controls** — drag the tiller or `A`/`D` · `SPACE` centre helm · `W`/`S` throttle ·
`E` engine · `1`/`2`/`3` ahead-neutral-astern · `M` main · `J` jib · `R` reef ·
`T` tack · `F` fix position · `L` lines · `Q` ground tackle · `TAB` change vessel ·
`C` chart · `H` handbook

---

A top-down mobile sailing simulator where players start with a small working boat and build a coastal trade and courier business while learning real sailing theory through play.

The sea is not scenery. It is the core puzzle.

Wind, tide, depth, draft, hull speed, cargo weight, fuel, weather, sail trim, and navigation all affect whether a job is profitable, late, dangerous, or impossible.

---

## Core Concept

The player begins with a small, inexpensive vessel with:

- Basic sails
- Small diesel auxiliary engine
- Limited fuel capacity
- Simple compass
- Depth sounder
- Basic speed instruments
- Paper-style nautical chart
- Minimal cargo capacity

Early jobs include:

- Mail delivery
- Marina parts
- Groceries
- Fishing gear
- Tools
- Medical supplies
- Passengers
- Fresh produce
- Light freight

As the player earns money, they upgrade the boat, purchase larger vessels, unlock better instruments, take higher-value contracts, and operate over progressively larger coastal areas.

The game should feel like a transport and trading game first, while quietly teaching genuine sailing knowledge.

---

## Design Pillars

### 1. The Sea Is the Puzzle

A voyage is shaped by:

- True wind
- Apparent wind
- Wind direction
- Wind strength
- Tidal stream
- Tidal height
- Water depth
- Vessel draft
- Cargo load
- Hull speed
- Fuel state
- Sea conditions
- Harbour access windows

A short delivery can become a meaningful planning problem.

### 2. Sailing Knowledge Creates Economic Advantage

The player earns more by understanding the environment.

Examples:

- Waiting for a favourable tidal stream saves fuel.
- Tacking correctly can beat motoring directly into weather.
- Reefing early prevents loss of control.
- Knowing tidal height opens shallow harbours.
- Correct sail trim improves speed.
- Efficient engine RPM improves range.
- Correct loading preserves stability and performance.

Knowledge replaces arbitrary RPG bonuses.

### 3. Learn by Doing

The game avoids formal lessons wherever possible.

Instead:

1. The player encounters a practical problem.
2. The player experiments.
3. The system visibly reacts.
4. The relevant sailing concept is unlocked in the Skipper's Handbook.

Example:

The player cannot sail directly into the wind.

They eventually discover tacking.

Only then does the handbook explain why it works.

### 4. Instruments Matter

The player should use actual sailing information rather than a conventional game minimap.

Possible instruments include:

- Compass
- Depth
- Speed Through Water
- Speed Over Ground
- Wind direction
- Wind speed
- GPS
- Chartplotter
- AIS
- Radar
- Engine RPM
- Fuel
- Battery voltage
- Engine temperature

Early vessels have only basic instruments.

Advanced electronics reduce workload but do not remove seamanship.

### 5. Bigger Is Not Always Better

Larger boats:

- Carry more cargo
- Travel farther
- Handle poor weather better
- Have larger fuel tanks
- Support better equipment

But they may also:

- Draw more water
- Need larger berths
- Cost more to operate
- Require more maintenance
- Be unable to enter shallow creeks
- Need more crew or automation

Small boats remain commercially useful.

---

# Core Gameplay Loop

1. Review available contracts.
2. Check weather and tides.
3. Inspect destination harbour.
4. Select vessel.
5. Load cargo.
6. Choose fuel quantity.
7. Plan route.
8. Depart.
9. Sail, motor, or motor-sail.
10. Navigate changing conditions.
11. Arrive and berth safely.
12. Deliver cargo.
13. Receive payment and reputation.
14. Refuel, repair, maintain, and upgrade.
15. Take harder or more profitable contracts.

---

# Sailing Controls

The player has direct control over the boat.

## Helm

- Rudder
- Tiller or wheel
- Engine throttle
- Gear selection
- Engine start/stop

## Sails

Starter controls:

- Main sheet
- Headsail sheet
- Halyard
- Reefing

Advanced vessels may add:

- Traveller
- Vang
- Outhaul
- Cunningham
- Furling
- Multiple headsails
- Spinnaker or cruising chute

The player should be able to physically trim the sails from the mobile interface.

---

# Navigation

The game uses nautical charts rather than a game-style glowing route.

Charts can contain:

- Coastlines
- Depth contours
- Drying areas
- Rocks
- Buoys
- Navigation marks
- Channels
- Harbour entrances
- Anchorages
- Tidal information

Early navigation should rely on:

- Compass
- Chart
- Clock
- Depth
- Visual marks

Later upgrades include:

- GPS
- Chartplotter
- AIS
- Radar
- Autopilot

---

# Tide System

Two separate tidal systems are simulated.

## Tidal Height

Determines actual depth of water.

Approximate local water depth:

`Actual Depth = Charted Depth + Height of Tide`

Available under-keel clearance:

`UKC = Actual Depth - Vessel Draft`

Cargo load may increase draft.

## Tidal Stream

Moves the water itself.

Approximate vessel movement:

`Velocity Over Ground = Velocity Through Water + Tidal Current`

This allows:

- Ferry-gliding
- Set and drift
- Strong harbour entrance currents
- Tidal gates
- Current-assisted passages
- Fuel-saving route planning

---

# Vessel Physics

The simulation should be believable without requiring full computational fluid dynamics.

Important properties include:

- Displacement
- Length overall
- Waterline length
- Beam
- Draft
- Sail area
- Engine power
- Propeller efficiency
- Rudder authority
- Cargo capacity
- Fuel capacity
- Windage
- Stability
- Heel
- Drag

Approximate displacement-hull speed:

`Hull Speed (kn) ~= 1.34 × sqrt(LWL in feet)`

Trying to exceed hull speed with engine power should rapidly reduce efficiency.

---

# Cargo System

Cargo has practical properties.

Possible fields:

- Mass
- Volume
- Value
- Deadline
- Fragility
- Perishability
- Refrigeration requirement
- Hazard class
- Weather sensitivity
- Passenger comfort requirement

Example cargo classes:

- Mail
- Food
- Fish
- Timber
- Fuel
- Machinery
- Medical supplies
- Yacht parts
- Building materials
- Passengers

Cargo should change vessel behaviour through weight and placement.

---

# Progression

Progression is based on capability rather than character levels.

Possible vessel progression:

1. Open sailing dinghy / launch
2. Small working sailboat
3. Small cruising yacht
4. Coastal cutter
5. Motor-sailer
6. Traditional cargo vessel
7. Coastal trading ship

The player may eventually own multiple vessels and choose the best vessel for each job.

---

# Education Topics

The game can teach:

- Points of sail
- Tacking
- Gybing
- Sail trim
- Reefing
- Apparent wind
- True wind
- Leeway
- Set and drift
- Tidal streams
- Tidal heights
- Chart datum
- Draft
- Under-keel clearance
- Bearings
- Course to steer
- Speed Through Water
- Speed Over Ground
- Weather interpretation
- Anchoring
- Fuel calculations
- Range calculations
- Passage planning
- Collision avoidance
- Harbour entry planning

---

# Target Platform

Primary platform:

- iOS
- Android

Primary orientation:

- Portrait-first or adaptable portrait/landscape mobile UI

Input philosophy:

- Touch-first
- Direct manipulation
- Minimal abstract buttons
- Instruments expand when tapped
- Chart can become full-screen
- Sheets and helm should feel tactile

---

# Player Experience Goal

The game should begin as:

> "Take this parcel to the next harbour."

And gradually become:

> "The tide turns at 14:20, the destination dries below 1.2 metres, I draw 1.35 metres loaded, and the wind will veer southwest later. If I leave now I can ride the stream, reef before the headland, and arrive with enough water to enter."

At that point the player is no longer merely following a route.

They are thinking like a skipper.
