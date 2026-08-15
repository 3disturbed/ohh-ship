# Software Design Document — Sailing Courier Simulator

## 1. Purpose

This document defines the initial software and gameplay architecture for a top-down mobile sailing, navigation, trade, and courier simulator.

The product combines:

- Sailing simulation
- Tidal simulation
- Weather
- Navigation
- Cargo logistics
- Vessel management
- Trading
- Progression
- Educational sailing theory

The design goal is to provide enough physical and navigational accuracy that real sailing concepts remain useful, while keeping the simulation performant and understandable on mobile hardware.

---

# 2. Product Goals

## 2.1 Primary Goals

The game must:

1. Provide enjoyable top-down sailing.
2. Make route planning meaningful.
3. Simulate wind and tidal effects.
4. Model realistic limits on vessel speed.
5. Model draft, depth, and grounding.
6. Model cargo weight and capacity.
7. Make fuel management meaningful.
8. Allow direct control over rudder, sails, and engine.
9. Present functional nautical instruments.
10. Teach real sailing theory through gameplay.
11. Support long-term progression through vessels and equipment.
12. Run efficiently on modern phones.

## 2.2 Non-Goals

Initial versions do not require:

- Full CFD simulation
- Professional navigation certification
- Full ocean-scale weather modelling
- Detailed mechanical engine teardown
- Multiplayer
- Crew life simulation
- Combat
- Piracy
- MMO systems

These may be considered later but should not complicate the core sailing loop.

---

# 3. High-Level Architecture

Recommended major systems:

```text
Game
├── World
│   ├── Map
│   ├── Bathymetry
│   ├── Harbours
│   ├── Navigation Marks
│   └── Routes
├── Environment
│   ├── Wind
│   ├── Tide Height
│   ├── Tidal Stream
│   ├── Weather
│   └── Sea State
├── Vessel
│   ├── Hull Physics
│   ├── Sailing Model
│   ├── Engine
│   ├── Rudder
│   ├── Fuel
│   ├── Electrical
│   ├── Instruments
│   └── Cargo
├── Navigation
│   ├── Chart
│   ├── Position
│   ├── Bearings
│   ├── Course
│   ├── GPS
│   └── Autopilot
├── Economy
│   ├── Contracts
│   ├── Cargo Market
│   ├── Reputation
│   ├── Vessel Purchase
│   └── Maintenance
├── Education
│   ├── Concept Detection
│   ├── Handbook
│   ├── Context Help
│   └── Challenges
└── UI
    ├── Helm
    ├── Sail Controls
    ├── Instruments
    ├── Chart
    ├── Contracts
    └── Vessel Management
```

Each subsystem should communicate through stable data structures rather than direct coupling.

---

# 4. Simulation Update Model

Use a fixed simulation timestep.

Example:

```text
Physics:       20 Hz
Environment:    5 Hz
Instruments:   10 Hz
UI rendering:  device refresh rate
Economy:       event driven
```

A fixed physics timestep prevents simulation behaviour from changing between low- and high-refresh devices.

---

# 5. Vessel Data Model

Each vessel should be defined using external data, ideally JSON.

Example conceptual schema:

```json
{
  "id": "starter_cutter",
  "name": "Harbour Cutter",
  "loa_m": 6.4,
  "lwl_m": 5.9,
  "beam_m": 2.2,
  "base_draft_m": 0.85,
  "displacement_kg": 1350,
  "max_payload_kg": 500,
  "fuel_capacity_l": 45,
  "engine_kw": 12,
  "sail_area_main_m2": 14,
  "sail_area_headsail_m2": 10,
  "cargo_volume_m3": 3.4
}
```

Important vessel characteristics:

- LOA
- LWL
- Beam
- Dry displacement
- Base draft
- Payload limit
- Cargo volume
- Fuel capacity
- Engine power
- Propeller efficiency
- Rudder area
- Sail area
- Reef points
- Stability coefficient
- Windage
- Electrical capacity
- Instrument slots

---

# 6. Hull Physics

The game should use simplified force-based vessel motion.

For each physics step:

```text
Total Force =
    Sail Force
  + Engine Thrust
  + Current Influence
  + Wave Influence
  - Hydrodynamic Drag
  - Aerodynamic Drag
```

The vessel state contains:

```text
Position
Heading
Velocity
Angular Velocity
Heel
Draft
Displacement
```

---

# 7. Hull Speed

For displacement vessels:

```text
HullSpeed_kn = 1.34 × sqrt(LWL_ft)
```

The game should not impose hull speed as a hard maximum.

Instead drag should rise significantly near and above hull speed.

This allows:

- Surfing
- Strong-current SOG greater than hull speed
- Powerful engines to exceed normal cruising speed inefficiently
- Different hull forms in future

---

# 8. Hydrodynamic Drag

A simplified drag curve should be used.

Example conceptual model:

```text
drag = baseDrag × velocity² × hullResistanceMultiplier
```

As speed approaches hull speed:

```text
hullResistanceMultiplier increases sharply
```

This creates realistic behaviour without full fluid simulation.

---

# 9. Cargo and Displacement

Loaded displacement:

```text
LoadedDisplacement =
    VesselDryMass
  + FuelMass
  + CargoMass
  + EquipmentMass
```

Fuel can be approximated using configurable density.

Additional displacement affects:

- Draft
- Acceleration
- Turning
- Drag
- Fuel efficiency
- Sail response

---

# 10. Draft Model

A simplified draft model:

```text
CurrentDraft =
BaseDraft + PayloadDraftAdjustment
```

PayloadDraftAdjustment can be generated from a vessel-specific tonnes-per-centimetre immersion value or a simplified coefficient.

Draft directly affects grounding risk.

---

# 11. Grounding

At the vessel position:

```text
AvailableWater =
ChartedDepth + TideHeight
```

Under-keel clearance:

```text
UKC = AvailableWater - CurrentDraft
```

States:

```text
UKC > SafetyMargin       Normal
0 < UKC <= SafetyMargin  Shallow-water warning
UKC <= 0                 Grounded
```

Grounding severity may depend on:

- Vessel speed
- Bottom type
- Wave action
- Tide direction
- Hull type

Bottom types:

- Mud
- Sand
- Gravel
- Rock

Mud grounding may be recoverable.

Rock grounding may cause hull damage.

---

# 12. Wind Model

Environment should expose:

```text
TrueWindDirection
TrueWindSpeed
GustStrength
GustFrequency
```

Local modifiers may include:

- Headlands
- Valleys
- Buildings
- Islands
- Squalls

Initial MVP can use uniform regional wind with time-based variation.

---

# 13. Apparent Wind

Apparent wind should be calculated from true wind and vessel velocity.

Conceptually:

```text
ApparentWindVector =
TrueWindVector - VesselVelocityVector
```

This determines:

- Apparent wind angle
- Apparent wind speed
- Sail force
- Instrument readings

The player therefore experiences apparent wind rather than receiving it as a purely theoretical lesson.

---

# 14. Sailing Force Model

Each sail should produce force based on:

- Apparent wind speed
- Apparent wind angle
- Sail area
- Reef state
- Sheet position
- Sail efficiency
- Stall/luff state

Conceptual form:

```text
SailForce =
0.5 × airDensity × apparentWind² × sailArea × efficiency
```

The exact aerodynamic coefficient can be approximated using lookup curves.

---

# 15. Sail Trim

Each sail has an ideal trim range based on apparent wind angle.

States:

```text
Luffing
Under-trimmed
Efficient
Over-trimmed
Stalled
```

These states should have visible feedback.

Examples:

- Sail animation
- Tell-tales
- Flutter sound
- Speed loss
- Heel change

The player should be able to learn correct trim visually.

---

# 16. Reefing

Reefing reduces:

- Effective sail area
- Heel
- Weather helm
- Maximum sail force

And improves:

- Control
- Stability
- Safety in strong wind

Reefing should take time.

Advanced difficulty modes may require the player to head up or reduce sail load before reefing.

---

# 17. Rudder Model

Rudder authority should depend on water flow.

At very low water speed:

```text
rudderEffectiveness ≈ low
```

At normal sailing speed:

```text
rudderEffectiveness ≈ high
```

This naturally teaches why vessels can be difficult to steer when nearly stationary.

Prop wash may improve rudder authority under engine.

---

# 18. Engine Model

The engine system contains:

```text
EngineState
RPM
Throttle
Gear
FuelFlow
Temperature
Health
```

Approximate fuel burn:

```text
FuelFlow = engineCurve(RPM, Load)
```

The efficiency curve should encourage reasonable cruising RPM rather than maximum throttle.

---

# 19. Fuel System

Fuel state:

```text
FuelRemainingLitres
FuelCapacityLitres
FuelMass
EstimatedRange
```

Estimated range should depend on:

- Engine RPM
- Vessel speed
- Wind
- Tidal stream
- Sea state
- Load

The game should distinguish between:

```text
Range through water
Range over ground
```

where appropriate.

---

# 20. Tidal Height System

Each region can define harmonic or simplified tidal data.

MVP approach:

- High-water times
- Low-water times
- Heights
- Interpolated curve

Future approach:

- Harmonic constituents

API:

```text
getTideHeight(position, time)
```

Output:

```text
heightAboveChartDatum
rateOfRise
risingOrFalling
nextHighWater
nextLowWater
```

---

# 21. Tidal Stream System

The world should contain tidal stream fields.

Each field provides:

```text
Direction
Speed
TimeRelationshipToTide
```

API:

```text
getCurrentVector(position, time)
```

The vessel velocity over ground is affected by this vector.

This permits:

- Tidal gates
- Races
- Estuary currents
- Eddies
- Ferry-gliding
- Set and drift

---

# 22. Speed Definitions

Maintain separate simulation values for:

```text
STW = Speed Through Water
SOG = Speed Over Ground
```

These should be independently available to instruments.

The distinction is educationally important.

---

# 23. Course and Heading

Maintain separate values for:

```text
Heading
Course Through Water
Course Over Ground
Bearing To Waypoint
```

This allows later systems such as:

- Leeway
- Current correction
- Course to steer

---

# 24. Leeway

Side force from wind should create lateral movement.

Simplified model:

```text
Leeway =
WindSideForce × HullLeewayCoefficient
```

Keel design may reduce leeway.

This makes sailing upwind and navigation more realistic.

---

# 25. Weather System

Weather state can contain:

```text
Wind
Visibility
Cloud
Rain
Pressure
SeaState
Temperature
StormRisk
```

Initial gameplay emphasis:

- Wind changes
- Gusts
- Visibility
- Rain
- Squalls

Weather forecasts can have uncertainty.

Higher-quality forecast services or instruments may reduce uncertainty.

---

# 26. Sea State

Sea state should affect:

- Speed
- Heading stability
- Sail efficiency
- Passenger comfort
- Cargo security
- Engine efficiency

MVP can model this numerically with visual wave animation rather than full wave physics.

---

# 27. World Map

The game world should use layered geospatial data.

Layers:

```text
Land
Water
Depth
Seabed
Harbours
Buoys
Hazards
Routes
Tidal Zones
Wind Zones
Ports
Economy Nodes
```

The visible world can remain stylised while the navigation data remains coherent.

---

# 28. Bathymetry

Depth data should support:

- Depth contours
- Point depth queries
- Drying areas
- Shallow-water warnings

Suggested representation:

- Grid
- Heightmap
- Tile-based depth raster

Query:

```text
getChartedDepth(x, y)
```

---

# 29. Charts

Charts are functional UI, not decorative maps.

They should contain:

- Depth contours
- Soundings
- Drying areas
- Buoys
- Rocks
- Lights
- Harbour entrances
- Channels
- Anchorages

Optional advanced overlays:

- Tidal arrows
- AIS
- Radar
- Weather
- Route plan

---

# 30. Navigation Instruments

Possible equipment:

## Basic

- Compass
- Clock
- Depth sounder
- Log / STW
- Fuel gauge

## Intermediate

- Wind instrument
- GPS
- SOG
- COG
- Chartplotter

## Advanced

- AIS
- Radar
- Autopilot
- Advanced weather
- Multi-function display

Equipment upgrades primarily reduce uncertainty and workload.

---

# 31. Autopilot

Autopilot should steer:

- Heading
- Wind angle
- Route waypoint

depending on installed capability.

Autopilot does not:

- Trim sails
- Avoid all hazards
- Guarantee safe depth
- Make passage decisions

This preserves gameplay.

---

# 32. Contract System

Contracts should be generated from port economies.

Contract fields:

```text
Origin
Destination
CargoType
Mass
Volume
Deadline
Reward
ReputationReward
Risk
SpecialRequirements
```

Examples:

```text
Mail
Fresh fish
Engine parts
Medical delivery
Timber
Fuel
Passengers
Groceries
Construction supplies
Urgent yacht repair part
```

---

# 33. Cargo Properties

Cargo can define:

```text
Mass
Volume
Fragility
Perishability
TemperatureRequirement
Hazard
WeatherSensitivity
PassengerComfort
```

Cargo condition can affect payment.

---

# 34. Cargo Placement

Advanced simulation may include cargo placement zones:

```text
Forward
Midships
Aft
Deck
Below
Port
Starboard
```

Placement affects:

- Trim
- List
- Stability
- Windage

MVP may treat cargo as centrally loaded.

---

# 35. Economy

Revenue:

```text
ContractRevenue
+ Bonuses
- Penalties
```

Costs:

```text
Fuel
Berthing
Repairs
Maintenance
Insurance
Equipment
Vessel purchase
```

Bonuses may reward:

- Early arrival
- Undamaged cargo
- Low fuel usage
- Difficult weather
- Reliable service

---

# 36. Reputation

Ports and companies may track reputation.

High reputation unlocks:

- Better contracts
- Urgent courier jobs
- Valuable cargo
- Passenger work
- Long-distance freight

Reputation should represent reliability rather than generic XP.

---

# 37. Vessel Progression

Possible tiers:

```text
Tier 1: Dinghy / launch
Tier 2: Small working sailboat
Tier 3: Cruiser
Tier 4: Cutter
Tier 5: Motor-sailer
Tier 6: Cargo sailing vessel
Tier 7: Coastal trader
```

Multiple vessel ownership should be supported eventually.

---

# 38. Upgrades

Upgrade categories:

## Sailing

- Better sails
- Roller furling
- Additional reef points
- Better winches

## Engine

- Larger fuel tank
- Improved propeller
- Better engine
- Fuel monitoring

## Navigation

- GPS
- Chartplotter
- AIS
- Radar

## Automation

- Autopilot
- Electric windlass
- Powered winches

## Cargo

- Refrigeration
- Cargo tie-downs
- Larger hold
- Passenger seating

## Safety

- Bilge pumps
- Better anchoring equipment
- Storm gear

---

# 39. Damage and Maintenance

Possible vessel systems:

```text
Hull
Rig
Sails
Engine
Rudder
Electrical
Navigation Equipment
```

Wear can depend on:

- Engine runtime
- Heavy weather
- Groundings
- Collisions
- Poor maintenance

The system should create decisions without becoming a maintenance simulator.

---

# 40. Mobile UI

Recommended screen layout:

```text
┌─────────────────────┐
│                     │
│      WORLD VIEW     │
│                     │
│                     │
├─────────────────────┤
│ instruments         │
│ sail / engine / helm│
└─────────────────────┘
```

The exact proportions should adapt to phone aspect ratio.

---

# 41. Helm Controls

Possible control scheme:

- Drag wheel/tiller left/right
- Throttle slider
- Forward / neutral / reverse selector
- Engine start button

Optional assisted steering modes:

```text
Casual
Standard
Simulation
```

---

# 42. Sail Controls

Sheets should use direct touch input.

Example:

```text
Drag inward  -> sheet in
Drag outward -> ease sheet
```

Controls may be context-sensitive to avoid overcrowding the phone screen.

Starter vessels should expose only essential sail controls.

---

# 43. Instrument Interaction

Small instrument display:

```text
Tap -> enlarge
Long press -> configure
Swipe -> next instrument
```

Instrument displays should be readable at a glance.

---

# 44. Chart Interaction

Chart mode should support:

- Pan
- Zoom
- Measure distance
- Measure bearing
- Place waypoint
- Inspect depth
- Inspect navigation mark
- View tidal data
- Plot route

Advanced route planning may calculate estimated arrival using predicted wind and tide.

---

# 45. Educational System

The education layer should observe player behaviour.

Example concept triggers:

```text
Player attempts to sail into wind
=> Unlock "No-Go Zone"

Player completes first tack
=> Unlock "Tacking"

Player sees STW != SOG
=> Unlock "Tidal Stream"

Player enters shallow water near low tide
=> Unlock "Draft and UKC"
```

---

# 46. Skipper's Handbook

The handbook stores unlocked knowledge.

Each entry should include:

```text
Concept
Short explanation
Diagram
Why it matters
In-game example
Optional deeper theory
```

The handbook is optional.

The core game remains playable through experimentation.

---

# 47. Difficulty Layers

## Assisted

- Sail trim hints
- Route guidance
- Grounding warning
- Automatic reef suggestions
- Simplified collision avoidance

## Standard

- Minimal hints
- Real instrument interpretation required

## Simulation

- Limited aids
- More complete navigation
- Less perfect weather information
- More equipment management

All modes should use the same underlying sailing model where possible.

---

# 48. Tutorial Design

Avoid conventional lesson screens.

Opening scenario:

```text
Contract:
Deliver marina parts 2.5 NM across the bay.
```

The player learns:

1. Start engine.
2. Leave berth.
3. Raise sail.
4. Trim sail.
5. Follow compass/chart.
6. Notice wind direction.
7. Arrive.
8. Receive payment.

Subsequent contracts naturally introduce:

- Tacking
- Reefing
- Tides
- Depth
- Fuel
- Night navigation

---

# 49. Save Data

Player save should contain:

```text
Money
Reputation
OwnedVessels
VesselCondition
Equipment
Fuel
ActiveContracts
CompletedContracts
UnlockedHandbookEntries
Settings
WorldTime
```

Use versioned save schemas from the beginning.

---

# 50. Data-Driven Content

Major gameplay content should live outside executable code.

Recommended data sets:

```text
/data/vessels
/data/cargo
/data/ports
/data/contracts
/data/equipment
/data/weather
/data/tutorials
/data/handbook
```

This enables rapid content expansion.

---

# 51. Suggested Runtime Architecture

A modular architecture could use systems such as:

```text
WorldManager
EnvironmentManager
TideSystem
WindSystem
WeatherSystem
VesselController
HullPhysics
SailSystem
EngineSystem
RudderSystem
CargoSystem
NavigationSystem
InstrumentSystem
ContractManager
EconomyManager
EducationManager
SaveManager
UIManager
```

Each system exposes a narrow interface.

---

# 52. Example Vessel Update

Pseudo-code:

```text
updateVessel(dt):

    wind = environment.getWind(position, time)
    current = tideSystem.getCurrent(position, time)

    apparentWind = calculateApparentWind(
        wind,
        vessel.velocity
    )

    sailForce = sailSystem.calculateForce(
        apparentWind,
        sailState
    )

    engineForce = engineSystem.calculateThrust(
        rpm,
        throttle,
        gear
    )

    waterVelocity = vessel.velocity - current

    drag = hullPhysics.calculateDrag(
        waterVelocity,
        vessel
    )

    rudderTorque = rudderSystem.calculateTorque(
        waterVelocity,
        rudderAngle
    )

    integrateForces(
        sailForce,
        engineForce,
        drag,
        rudderTorque,
        dt
    )

    vessel.position += current * dt

    updateDepthAndGrounding()
    updateInstruments()
```

---

# 53. Example Depth Check

```text
chartedDepth = world.getDepth(position)
tideHeight = tides.getHeight(position, time)

actualDepth = chartedDepth + tideHeight
draft = vessel.calculateDraft()

ukc = actualDepth - draft

if ukc <= 0:
    vessel.ground()
else if ukc < warningThreshold:
    instruments.depthWarning = true
```

---

# 54. Example Contract

```json
{
  "origin": "Westhaven",
  "destination": "Saint Mary's Quay",
  "cargo": "fresh_fish",
  "mass_kg": 180,
  "volume_m3": 1.1,
  "deadline": "08:00",
  "reward": 420,
  "late_penalty_per_minute": 4,
  "requires_refrigeration": false,
  "condition_sensitive": true
}
```

The difficulty comes from environmental conditions rather than artificial enemy encounters.

---

# 55. MVP Scope

The first playable version should include:

## World

- One coastal bay or estuary
- 3–5 ports
- Depth map
- Navigation buoys
- Tidal height
- Tidal current

## Vessel

- One starter sailboat
- Main sail
- Headsail
- Rudder
- Small diesel engine
- Fuel
- Cargo capacity
- Draft

## Instruments

- Compass
- Depth
- STW
- SOG
- Fuel
- Wind indicator

## Gameplay

- Contract selection
- Cargo loading
- Passage
- Delivery
- Payment
- Basic repairs
- Basic upgrades

## Educational Topics

- Wind direction
- Points of sail
- Tacking
- Sail trim
- STW vs SOG
- Tidal height
- Draft
- Under-keel clearance

---

# 56. Post-MVP

Potential extensions:

- Multiple regions
- Real-world-inspired coastlines
- Larger vessels
- Dynamic storms
- AIS traffic
- COLREG scenarios
- Anchoring
- Mooring
- Night sailing
- Fog
- Radar
- Mechanical failures
- Crew
- Passenger transport
- Fishing
- Vessel ownership fleet
- Company management
- Procedural contracts
- Long coastal passages
- Online leaderboards
- Multiplayer shipping economy

---

# 57. Design Principle

Every major simulation variable should answer at least one gameplay question.

Examples:

```text
Wind:
Can I sail there efficiently?

Tide:
When should I leave?

Depth:
Can I safely go there?

Draft:
Can my boat enter?

Cargo:
How much can I carry?

Hull speed:
How fast can this vessel realistically travel?

Fuel:
Can I afford to motor?

Weather:
Should I leave at all?

Navigation instruments:
What do I actually know?
```

If a simulation feature creates no meaningful decision, it should be simplified or removed.

---

# 58. Success Criterion

The project succeeds when a player begins by thinking:

> "The arrow says go this way."

But eventually thinks:

> "I need to leave before the tide turns, stay east of the shoal, use the south-westerly to reach the headland, then motor the final channel because the wind will be directly ahead."

At that point the game has successfully converted sailing theory into intuitive player knowledge.
