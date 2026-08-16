/* data.js — data-driven content: vessels, cargo, equipment, handbook.
   Kept out of the simulation code so content can grow without touching systems. */
(function (S) {
  'use strict';
  var D = S.DATA = {};

  /* =======================================================================
     VESSELS  (§5 Vessel Data Model)
     Derived values (hull speed, drag coefficients, TPC) are computed in
     vessel.js from these physical dimensions.
     ======================================================================= */
  D.VESSELS = [
    {
      id: 'corribee', name: 'Newbridge Corribee 21', tier: 1,
      blurb: 'Tiny, tough and everywhere on this coast. She will teach you more per pound than anything afloat.',
      loa_m: 6.40, lwl_m: 5.49, beam_m: 2.06, base_draft_m: 0.76,
      displacement_kg: 750, max_payload_kg: 200, cargo_volume_m3: 0.9,
      fuel_capacity_l: 10, engine_kw: 3,
      sail_area_main_m2: 7.4, sail_area_headsail_m2: 6.1, reefs: 1,
      rudder_area_m2: 0.18, gm_m: 0.80, ce_height_m: 2.4, windage_m2: 2.5,
      chain_m: 20, anchor_kg: 5, bilge: true,
      price: 2900, berth: 3
    },
    {
      id: 'drascombe', name: 'Drascombe Lugger', tier: 1,
      blurb: 'An open beach boat, yawl rigged. Draws almost nothing with the plate up, carries almost nothing, and gets very wet.',
      loa_m: 5.72, lwl_m: 5.05, beam_m: 1.90, base_draft_m: 0.28,
      displacement_kg: 380, max_payload_kg: 280, cargo_volume_m3: 1.1,
      fuel_capacity_l: 12, engine_kw: 4,
      sail_area_main_m2: 8.4, sail_area_headsail_m2: 3.2, reefs: 1,
      rudder_area_m2: 0.22, gm_m: 0.85, ce_height_m: 2.6, windage_m2: 3,
      chain_m: 20, anchor_kg: 6, bilge: true, open: true,
      price: 4200, berth: 4
    },
    {
      id: 'achilles24', name: 'Achilles 24', tier: 1,
      blurb: 'A slippery little cruiser-racer. Carries almost nothing, sails rings round everything her size.',
      loa_m: 7.32, lwl_m: 5.94, beam_m: 2.18, base_draft_m: 1.09,
      displacement_kg: 1130, max_payload_kg: 300, cargo_volume_m3: 1.6,
      fuel_capacity_l: 12, engine_kw: 4,
      sail_area_main_m2: 9.5, sail_area_headsail_m2: 8.5, reefs: 1,
      rudder_area_m2: 0.25, gm_m: 0.85, ce_height_m: 2.9, windage_m2: 3.5,
      chain_m: 25, anchor_kg: 6,
      price: 5200, berth: 5
    },
    {
      id: 'contessa26', name: 'Contessa 26', tier: 2,
      blurb: 'Narrow, wet and utterly seaworthy. A boat this size has been sailed round the world more than once.',
      loa_m: 7.77, lwl_m: 6.10, beam_m: 2.29, base_draft_m: 1.22,
      displacement_kg: 2450, max_payload_kg: 350, cargo_volume_m3: 2.0,
      fuel_capacity_l: 20, engine_kw: 7,
      sail_area_main_m2: 10.9, sail_area_headsail_m2: 11.9, reefs: 2,
      rudder_area_m2: 0.30, gm_m: 0.85, ce_height_m: 3.2, windage_m2: 4,
      chain_m: 30, anchor_kg: 10,
      price: 8500, berth: 6
    },
    {
      id: 'centaur', name: 'Westerly Centaur', tier: 2,
      blurb: 'Twin bilge keels, 0.9 m draft, and she will sit upright on the mud when the tide leaves her. The obvious first boat.',
      loa_m: 7.93, lwl_m: 6.55, beam_m: 2.57, base_draft_m: 0.91,
      displacement_kg: 2950, max_payload_kg: 700, cargo_volume_m3: 4.2,
      fuel_capacity_l: 27, engine_kw: 18,
      sail_area_main_m2: 12.1, sail_area_headsail_m2: 19.5, reefs: 2,
      rudder_area_m2: 0.42, gm_m: 1.05, ce_height_m: 3.6, windage_m2: 8,
      chain_m: 30, anchor_kg: 12, bilge: true,
      price: 9800, berth: 8
    },
    {
      id: 'colvic286', name: 'Colvic Sailer 28\'6', tier: 3,
      blurb: 'The family motor-sailer half this coast learned on. Roomy, sensible, happy on the mud, and she motors like she means it.',
      loa_m: 8.69, lwl_m: 7.01, beam_m: 2.90, base_draft_m: 1.07,
      displacement_kg: 3600, max_payload_kg: 800, cargo_volume_m3: 4.8,
      fuel_capacity_l: 68, engine_kw: 20,
      sail_area_main_m2: 14.0, sail_area_headsail_m2: 12.0, reefs: 2,
      rudder_area_m2: 0.50, gm_m: 1.10, ce_height_m: 3.8, windage_m2: 10,
      chain_m: 40, anchor_kg: 14, bilge: true,
      price: 12800, berth: 9
    },
    {
      id: 'crabber', name: 'Cornish Crabber 24', tier: 3,
      blurb: 'Gaff cutter with a lifting plate. Slower to windward than she looks, lovely everywhere else, and she can creep anywhere.',
      loa_m: 7.32, lwl_m: 6.50, beam_m: 2.59, base_draft_m: 0.91,
      displacement_kg: 2200, max_payload_kg: 550, cargo_volume_m3: 3.6,
      fuel_capacity_l: 45, engine_kw: 15,
      sail_area_main_m2: 18.0, sail_area_headsail_m2: 14.5, reefs: 2,
      rudder_area_m2: 0.40, gm_m: 1.00, ce_height_m: 3.9, windage_m2: 8,
      chain_m: 30, anchor_kg: 12, bilge: true,
      price: 14500, berth: 10
    },
    {
      id: 'sadler29', name: 'Sadler 29', tier: 3,
      blurb: 'Foam-cored and famously unsinkable. Stiff, kindly, and quick enough to surprise bigger boats to windward.',
      loa_m: 8.84, lwl_m: 7.01, beam_m: 2.87, base_draft_m: 1.40,
      displacement_kg: 3400, max_payload_kg: 700, cargo_volume_m3: 3.8,
      fuel_capacity_l: 45, engine_kw: 13,
      sail_area_main_m2: 15.2, sail_area_headsail_m2: 15.7, reefs: 2,
      rudder_area_m2: 0.50, gm_m: 1.05, ce_height_m: 3.9, windage_m2: 8,
      chain_m: 35, anchor_kg: 12,
      price: 15900, berth: 9
    },
    {
      id: 'konsort29', name: 'Westerly Konsort 29', tier: 3,
      blurb: 'The Centaur\'s bigger sister: twin keels, standing headroom, and a hold that swallows a week\'s cargo.',
      loa_m: 8.84, lwl_m: 7.47, beam_m: 3.05, base_draft_m: 1.00,
      displacement_kg: 4100, max_payload_kg: 950, cargo_volume_m3: 5.5,
      fuel_capacity_l: 55, engine_kw: 21,
      sail_area_main_m2: 14.5, sail_area_headsail_m2: 17.5, reefs: 2,
      rudder_area_m2: 0.55, gm_m: 1.15, ce_height_m: 4.0, windage_m2: 10,
      chain_m: 40, anchor_kg: 14, bilge: true,
      price: 17500, berth: 10
    },
    {
      id: 'catalina30', name: 'Catalina 30', tier: 4,
      blurb: 'Roomy, quick and cheap to run — but a fin keel drawing 1.68 m closes half this coast to you.',
      loa_m: 9.14, lwl_m: 7.62, beam_m: 3.30, base_draft_m: 1.68,
      displacement_kg: 4630, max_payload_kg: 1100, cargo_volume_m3: 7.5,
      fuel_capacity_l: 68, engine_kw: 16,
      sail_area_main_m2: 15.6, sail_area_headsail_m2: 25.8, reefs: 2,
      rudder_area_m2: 0.66, gm_m: 1.15, ce_height_m: 4.6, windage_m2: 12,
      chain_m: 45, anchor_kg: 16,
      price: 23500, berth: 14
    },
    {
      id: 'contessa32', name: 'Contessa 32', tier: 4,
      blurb: 'The one that came home from the \'79 Fastnet. Points high, tracks like a train, and never frightens her crew.',
      loa_m: 9.75, lwl_m: 7.32, beam_m: 2.90, base_draft_m: 1.68,
      displacement_kg: 4300, max_payload_kg: 800, cargo_volume_m3: 4.6,
      fuel_capacity_l: 60, engine_kw: 15,
      sail_area_main_m2: 16.9, sail_area_headsail_m2: 18.5, reefs: 2,
      rudder_area_m2: 0.60, gm_m: 1.00, ce_height_m: 4.4, windage_m2: 9,
      chain_m: 40, anchor_kg: 16,
      price: 26500, berth: 11
    },
    {
      id: 'moody31', name: 'Moody 31', tier: 4,
      blurb: 'Centre cockpit, aft cabin, and space below that boats ten feet longer would envy. A proper little ship.',
      loa_m: 9.60, lwl_m: 7.90, beam_m: 3.28, base_draft_m: 1.35,
      displacement_kg: 4800, max_payload_kg: 1100, cargo_volume_m3: 7.0,
      fuel_capacity_l: 90, engine_kw: 20,
      sail_area_main_m2: 15.3, sail_area_headsail_m2: 19.8, reefs: 2,
      rudder_area_m2: 0.65, gm_m: 1.18, ce_height_m: 4.4, windage_m2: 12,
      chain_m: 45, anchor_kg: 16,
      price: 29500, berth: 12
    },
    {
      id: 'moody336', name: 'Moody 336', tier: 5,
      blurb: 'A proper cruising yacht. Fast, dry, well found, and she will carry a tonne and a half without noticing.',
      loa_m: 10.06, lwl_m: 8.38, beam_m: 3.45, base_draft_m: 1.52,
      displacement_kg: 5670, max_payload_kg: 1500, cargo_volume_m3: 9.5,
      fuel_capacity_l: 100, engine_kw: 20,
      sail_area_main_m2: 20.0, sail_area_headsail_m2: 28.0, reefs: 2,
      rudder_area_m2: 0.78, gm_m: 1.20, ce_height_m: 5.0, windage_m2: 15,
      chain_m: 50, anchor_kg: 20,
      price: 38000, berth: 18
    },
    {
      id: 'nicholson35', name: 'Nicholson 35', tier: 5,
      blurb: 'A gentleman\'s offshore cruiser. Heavy, powerful, and utterly composed when the forecast goes wrong.',
      loa_m: 10.67, lwl_m: 8.10, beam_m: 3.20, base_draft_m: 1.68,
      displacement_kg: 7300, max_payload_kg: 1600, cargo_volume_m3: 9.8,
      fuel_capacity_l: 136, engine_kw: 27,
      sail_area_main_m2: 22.0, sail_area_headsail_m2: 26.0, reefs: 3,
      rudder_area_m2: 0.80, gm_m: 1.15, ce_height_m: 4.9, windage_m2: 14,
      chain_m: 55, anchor_kg: 20,
      price: 44500, berth: 16
    },
    {
      id: 'colvic34', name: 'Colvic Watson 34', tier: 6,
      blurb: 'Motor-sailer. Heavy, slow under sail, and utterly unbothered by weather that would send a yacht home.',
      loa_m: 10.36, lwl_m: 9.30, beam_m: 3.35, base_draft_m: 1.37,
      displacement_kg: 8200, max_payload_kg: 3000, cargo_volume_m3: 18,
      fuel_capacity_l: 300, engine_kw: 55,
      sail_area_main_m2: 22.0, sail_area_headsail_m2: 18.0, reefs: 3,
      rudder_area_m2: 1.05, gm_m: 1.35, ce_height_m: 4.8, windage_m2: 22,
      chain_m: 60, anchor_kg: 30,
      price: 57000, berth: 24
    },
    {
      id: 'fisher37', name: 'Fisher 37', tier: 7,
      blurb: 'Ketch-rigged motor-sailer with a wheelhouse. Four and a half tonnes of cargo and the range to go anywhere on this coast.',
      loa_m: 11.28, lwl_m: 10.10, beam_m: 3.66, base_draft_m: 1.60,
      displacement_kg: 13000, max_payload_kg: 4500, cargo_volume_m3: 26,
      fuel_capacity_l: 450, engine_kw: 60,
      sail_area_main_m2: 28.0, sail_area_headsail_m2: 24.0, reefs: 3,
      rudder_area_m2: 1.30, gm_m: 1.45, ce_height_m: 5.4, windage_m2: 28,
      chain_m: 75, anchor_kg: 40,
      price: 96000, berth: 30
    }
  ];
  D.vessel = function (id) {
    for (var i = 0; i < D.VESSELS.length; i++) if (D.VESSELS[i].id === id) return D.VESSELS[i];
    return D.VESSELS[0];
  };

  /* =======================================================================
     CARGO  (§33)  density_kg_m3 converts mass to hold volume.
     ======================================================================= */
  D.CARGO = {
    mail:      { name: 'Mail sacks',      dens: 180, frag: 0.1, perish: 0,    wx: 0.2, cold: false, unit: '£/kg 1.9', rate: 1.90 },
    groceries: { name: 'Groceries',       dens: 260, frag: 0.3, perish: 0.35, wx: 0.4, cold: false, unit: '£/kg 1.2', rate: 1.20 },
    fish:      { name: 'Fresh fish',      dens: 620, frag: 0.2, perish: 0.9,  wx: 0.3, cold: true,  unit: '£/kg 1.6', rate: 1.60 },
    produce:   { name: 'Fresh produce',   dens: 340, frag: 0.4, perish: 0.7,  wx: 0.5, cold: false, unit: '£/kg 1.3', rate: 1.30 },
    medical:   { name: 'Medical supplies',dens: 200, frag: 0.7, perish: 0.5,  wx: 0.6, cold: true,  unit: '£/kg 4.4', rate: 4.40 },
    parts:     { name: 'Marina parts',    dens: 480, frag: 0.5, perish: 0,    wx: 0.3, cold: false, unit: '£/kg 1.5', rate: 1.50 },
    yachtpart: { name: 'Urgent yacht part',dens:420, frag: 0.6, perish: 0,    wx: 0.3, cold: false, unit: '£/kg 3.8', rate: 3.80 },
    gear:      { name: 'Fishing gear',    dens: 300, frag: 0.2, perish: 0,    wx: 0.2, cold: false, unit: '£/kg 1.0', rate: 1.00 },
    tools:     { name: 'Tools',           dens: 900, frag: 0.3, perish: 0,    wx: 0.2, cold: false, unit: '£/kg 1.1', rate: 1.10 },
    timber:    { name: 'Timber',          dens: 550, frag: 0.1, perish: 0,    wx: 0.5, cold: false, unit: '£/kg 0.6', rate: 0.60 },
    building:  { name: 'Building materials',dens:1400,frag:0.1, perish: 0,    wx: 0.3, cold: false, unit: '£/kg 0.5', rate: 0.50 },
    machinery: { name: 'Machinery',       dens: 1100,frag: 0.5, perish: 0,    wx: 0.3, cold: false, unit: '£/kg 1.4', rate: 1.40 },
    fuel:      { name: 'Drummed fuel',    dens: 840, frag: 0.4, perish: 0,    wx: 0.7, cold: false, unit: '£/kg 0.9', rate: 0.90, hazard: true },
    passenger: { name: 'Passengers',      dens: 90,  frag: 0.8, perish: 0.2,  wx: 0.9, cold: false, unit: '£/head', rate: 3.20, pax: true }
  };

  /* =======================================================================
     EQUIPMENT & UPGRADES  (§30, §38)
     'inst' entries add instruments; others change vessel behaviour.
     ======================================================================= */
  D.EQUIP = [
    { id: 'gps',        name: 'GPS receiver',        price: 1400,  cat: 'Navigation',
      desc: 'Continuous position, SOG and COG. Ends dead-reckoning error.' },
    { id: 'windinst',   name: 'Masthead wind unit',  price: 900,   cat: 'Navigation',
      desc: 'Numeric apparent wind angle and speed, plus calculated true wind.' },
    { id: 'plotter',    name: 'Chartplotter',        price: 2600,  cat: 'Navigation', needs: 'gps',
      desc: 'Own-ship position drawn live on the chart, with course vector.' },
    { id: 'almanac',    name: 'Tidal almanac',       price: 350,   cat: 'Navigation',
      desc: 'Predicted tide heights and stream rates ahead of time, and harbour access windows.' },
    { id: 'autopilot',  name: 'Autopilot',           price: 3100,  cat: 'Automation', needs: 'gps',
      desc: 'Holds a compass heading or an apparent wind angle. Will not trim, watch depth, or think.' },
    { id: 'furler',     name: 'Roller furling',      price: 1150,  cat: 'Sailing',
      desc: 'Reef the headsail progressively instead of all or nothing.' },
    { id: 'sails2',     name: 'Cruising laminate sails', price: 2400, cat: 'Sailing',
      desc: 'Flatter, better shaped sails: about 8% more drive and a wider efficient trim band.' },
    { id: 'prop',       name: 'Feathering propeller', price: 1600, cat: 'Engine',
      desc: 'Less drag under sail, more thrust astern, roughly 10% better fuel economy.' },
    { id: 'tank',       name: 'Auxiliary fuel tank', price: 700,   cat: 'Engine',
      desc: 'Adds 50% to fuel capacity. The extra weight rides low.' },
    { id: 'fridge',     name: 'Refrigerated locker', price: 1900,  cat: 'Cargo',
      desc: 'Required for chilled cargo. Draws current whenever it runs.' },
    { id: 'tiedowns',   name: 'Cargo tie-downs',     price: 480,   cat: 'Cargo',
      desc: 'Halves damage to fragile cargo from slamming and heavy weather.' },
    { id: 'anchor2',    name: 'Oversize anchor & chain', price: 640, cat: 'Safety',
      desc: 'A heavier anchor and half as much chain again: better holding, and scope to spare in deep water.' },
    { id: 'windlass',   name: 'Electric windlass',   price: 1450,  cat: 'Automation',
      desc: 'Weighs anchor three times faster, and without breaking your back.' },
    { id: 'radar',      name: 'Radar',               price: 5200,  cat: 'Navigation',
      desc: 'Ranges on coastline and marks in poor visibility. Fixes your position at night.' }
  ];
  D.equip = function (id) {
    for (var i = 0; i < D.EQUIP.length; i++) if (D.EQUIP[i].id === id) return D.EQUIP[i];
    return null;
  };

  /* =======================================================================
     SKIPPER'S HANDBOOK  (§46)
     Entries unlock from observed behaviour (education.js), never from a menu.
     ======================================================================= */
  var svgWrap = function (inner, h) {
    return '<svg viewBox="0 0 320 ' + (h || 190) + '" width="320" height="' + (h || 190) + '">' +
      '<style>.l{stroke:#4fd1c5;fill:none;stroke-width:1.6}.d{stroke:#2c5c74;fill:none;stroke-width:1;' +
      'stroke-dasharray:3 3}.t{fill:#dcecf3;font:10px ui-monospace,Menlo,monospace}' +
      '.ta{fill:#f2b134;font:10px ui-monospace,Menlo,monospace}.b{fill:#183744;stroke:#4fd1c5;stroke-width:1.4}' +
      '.r{fill:#ef5b5b;opacity:.18}.g{fill:#63d471;opacity:.15}.s{fill:#f2b134;opacity:.9}</style>' + inner + '</svg>';
  };

  D.HANDBOOK = [
    {
      id: 'nogo', title: 'The no-go zone',
      body: '<p>A sailing boat cannot sail directly towards the wind. Roughly 45° either side of the wind is a dead zone: the sails cannot fill, they flap, and the boat stops.</p>' +
        '<p>To reach a destination that lies upwind you sail as close as the boat will go — about 45° off the wind — first on one side, then on the other. That is <b>tacking</b>, and the price is distance: getting somewhere dead upwind takes about 1.4 times the straight-line distance.</p>',
      diagram: svgWrap(
        '<path d="M160 30 L110 175 L210 175 Z" class="r"/>' +
        '<line x1="160" y1="10" x2="160" y2="30" class="l"/>' +
        '<polygon points="160,34 156,24 164,24" fill="#4fd1c5"/>' +
        '<text x="168" y="18" class="t">wind</text>' +
        '<text x="126" y="80" class="ta">NO-GO</text>' +
        '<line x1="160" y1="30" x2="75" y2="160" class="d"/><line x1="160" y1="30" x2="245" y2="160" class="d"/>' +
        '<text x="30" y="150" class="t">close-hauled</text><text x="238" y="150" class="t">close-hauled</text>' +
        '<text x="18" y="105" class="t">reach</text><text x="262" y="105" class="t">reach</text>' +
        '<text x="140" y="186" class="t">running</text>'),
      why: 'Every upwind delivery costs more time and distance than the chart shows. Plan for it before you accept a deadline.'
    },
    {
      id: 'points_of_sail', title: 'Points of sail',
      body: '<p>The angle between the wind and the boat sets everything: how fast you go, how much you heel, and how the sails must be trimmed.</p>' +
        '<p><b>Close-hauled</b> (about 45°) — sails sheeted in hard, boat heels, slowest through the water but the only way to make ground upwind.<br>' +
        '<b>Close reach</b> (60°) and <b>beam reach</b> (90°) — sheets eased, usually the fastest and most comfortable points of sail.<br>' +
        '<b>Broad reach</b> (135°) — fast and easy.<br>' +
        '<b>Run</b> (180°) — dead downwind. Slow, rolly, and the boom can cross without warning.</p>' +
        '<p>The simple rule for trim: <b>ease the sheet until the sail luffs, then pull in until it stops.</b></p>',
      why: 'A course only 20° different can double your speed. Choosing the angle you sail is more important than steering neatly.'
    },
    {
      id: 'tacking', title: 'Tacking',
      body: '<p>Tacking turns the bow through the wind so the sails fill on the other side. Carry speed into the turn, put the helm over firmly, and let the boat swing through the no-go zone before the sails refill.</p>' +
        '<p>Too slow and you stop head-to-wind — <b>in irons</b> — with no water flowing over the rudder and no steering. The cure is patience: back the headsail or use a touch of reverse until the bow falls off onto one side.</p>',
      diagram: svgWrap(
        '<line x1="160" y1="12" x2="160" y2="34" class="l"/><polygon points="160,38 156,28 164,28" fill="#4fd1c5"/>' +
        '<text x="168" y="20" class="t">wind</text>' +
        '<path d="M70 178 L145 60" class="l"/><path d="M145 60 L235 168" class="l"/>' +
        '<circle cx="145" cy="60" r="4" class="s"/><text x="152" y="58" class="ta">tack here</text>' +
        '<text x="46" y="176" class="t">start</text><text x="222" y="182" class="t">goal</text>' +
        '<line x1="70" y1="178" x2="235" y2="168" class="d"/><text x="120" y="192" class="t">direct course: impossible</text>', 200),
      why: 'Two good tacks beat six bad ones. Every extra tack loses speed and about a boat length of ground.'
    },
    {
      id: 'gybing', title: 'Gybing',
      body: '<p>A gybe turns the stern through the wind. The mainsail crosses the boat, and downwind it crosses <b>fast</b> and loaded.</p>' +
        '<p>Sheet the main in towards the centreline before you turn, make the turn, then ease out on the new side. An uncontrolled gybe is the commonest way to break a boom, a rig, or a head.</p>' +
        '<p>Sailing <b>by the lee</b> — the wind creeping round behind the boom — is the danger zone: nothing looks wrong until the boom comes across on its own.</p>',
      diagram: svgWrap(
        '<line x1="160" y1="12" x2="160" y2="34" class="l"/><polygon points="160,38 156,28 164,28" fill="#4fd1c5"/>' +
        '<text x="168" y="20" class="t">wind</text>' +
        '<path d="M105 175 A80 80 0 0 1 215 175" class="r"/>' +
        '<text x="122" y="150" class="ta">by the lee</text>' +
        '<path d="M60 120 Q160 190 260 120" class="d"/>' +
        '<circle cx="160" cy="172" r="4" class="s"/>' +
        '<text x="30" y="112" class="t">boom out here</text>' +
        '<text x="216" y="112" class="t">…slams to here</text>' +
        '<text x="96" y="192" class="t">sheet in before this point</text>', 200),
      why: 'Running dead downwind risks an accidental gybe if you wander a few degrees. Sail a touch high of dead run, and gybe deliberately with the main sheeted home.'
    },
    {
      id: 'apparent_wind', title: 'True wind and apparent wind',
      body: '<p><b>True wind</b> is the wind over the water. <b>Apparent wind</b> is the wind you feel on a moving boat: the true wind plus the headwind your own motion creates.</p>' +
        '<p>Sail upwind and the apparent wind is stronger and further forward than the true wind. Sail downwind and it is weaker and further aft — which is why a run feels calm even in a fresh breeze, and why it can be gusty and overpowering when you turn back upwind.</p>' +
        '<p>Your sails only ever respond to the apparent wind. Your passage plan only ever depends on the true wind.</p>',
      diagram: svgWrap(
        '<line x1="60" y1="40" x2="180" y2="40" class="l"/><polygon points="184,40 174,36 174,44" fill="#4fd1c5"/>' +
        '<text x="188" y="44" class="t">true wind</text>' +
        '<line x1="60" y1="40" x2="60" y2="130" stroke="#f2b134" stroke-width="1.6" fill="none"/>' +
        '<polygon points="60,134 56,124 64,124" fill="#f2b134"/><text x="8" y="92" class="ta">boat</text>' +
        '<line x1="180" y1="40" x2="60" y2="130" stroke="#ef5b5b" stroke-width="1.8" fill="none"/>' +
        '<text x="120" y="105" fill="#ef5b5b" font-family="ui-monospace,Menlo,monospace" font-size="10">apparent</text>' +
        '<text x="30" y="170" class="t">apparent = true wind − boat velocity</text>', 185),
      why: 'The wind instrument shows apparent. Before you decide whether to reef or whether a passage is sailable, work back to the true wind.'
    },
    {
      id: 'sail_trim', title: 'Sail trim',
      body: '<p>A sail is a wing. It works when the air stays attached to both sides of it.</p>' +
        '<p><b>Luffing</b> — sheet too far out, the front of the sail flutters, almost no drive.<br>' +
        '<b>Efficient</b> — the sail is just full, the boat accelerates and settles at a steady angle of heel.<br>' +
        '<b>Stalled</b> — sheet too far in for the angle, the flow separates. The boat heels more and goes slower: the classic beginner error.</p>' +
        '<p>Ease until it luffs, trim in until it fills. Repeat every time you change course or the wind shifts.</p>',
      why: 'Bad trim costs 20–40% of your speed while feeling perfectly acceptable. Over a season that is real money.'
    },
    {
      id: 'telltales', title: 'Telltales',
      body: '<p>Telltales are short ribbons on each side of the sail, and they show what the air is doing better than any instrument.</p>' +
        '<p><b>Both streaming aft</b> — the flow is attached on both sides. The sail is working. Leave it alone.<br>' +
        '<b>Windward telltale lifting or spinning</b> — the sail is starting to luff: sheet in a touch, or bear away.<br>' +
        '<b>Leeward telltale drooping or swirling</b> — the flow has separated: the sail is stalled. Ease the sheet until it streams again.</p>' +
        '<p>The habit that makes sailors fast: glance at the telltales every minute, and after every course change.</p>',
      diagram: svgWrap(
        '<path d="M160 20 Q205 95 172 170 L160 170 Z" fill="#efe9da" stroke="#4fd1c5" stroke-width="1.4"/>' +
        '<line x1="150" y1="70" x2="132" y2="66" stroke="#ef5b5b" stroke-width="2"/>' +
        '<text x="60" y="62" class="t">windward</text>' +
        '<line x1="196" y1="74" x2="214" y2="72" stroke="#63d471" stroke-width="2"/>' +
        '<text x="222" y="78" class="t">leeward</text>' +
        '<line x1="149" y1="120" x2="131" y2="118" stroke="#ef5b5b" stroke-width="2"/>' +
        '<line x1="200" y1="124" x2="218" y2="122" stroke="#63d471" stroke-width="2"/>' +
        '<text x="70" y="188" class="t">both streaming = drawing well</text>'),
      why: 'Telltales are the difference between trimming by guesswork and trimming by sight. They are also free.'
    },
    {
      id: 'heaveto', title: 'Heaving to',
      body: '<p>Back the jib — haul its sheet to the <b>windward</b> side — ease the main, and lash the helm down to leeward. The backed jib pushes the bow off, the main and rudder push it up, and they cancel: the boat parks, lying quietly about 60° off the wind, drifting slowly downwind.</p>' +
        '<p>That is <b>heaving to</b>: the oldest heavy-weather trick there is, and just as useful for eating lunch, reefing in peace, or waiting for a tide gate to open.</p>' +
        '<p>To sail on: haul the jib back across, straighten the helm, and she fills away.</p>',
      why: 'A boat that can stop at sea without an anchor gives you time — and time is what gets crews out of trouble.'
    },
    {
      id: 'vmg', title: 'VMG — velocity made good',
      body: '<p>Boat speed is not progress. What matters is how fast you close the place you are going — <b>velocity made good</b>.</p>' +
        '<p>Beating upwind, pointing higher <i>feels</i> better but the boat slows: pinch too hard and your VMG collapses even though the bow aims closer to the mark. ' +
        'Foot off a few degrees, the boat accelerates, and you arrive sooner while pointing worse.</p>' +
        '<p>The cyan bugs on the wind dial mark the best beat angle for the day. Sail on the bug, tack when headed, and watch VMG — not the compass — when deciding whether a pinch is paying.</p>',
      diagram: svgWrap(
        '<line x1="160" y1="12" x2="160" y2="34" class="l"/><polygon points="160,38 156,28 164,28" fill="#4fd1c5"/>' +
        '<text x="168" y="20" class="t">wind</text>' +
        '<circle cx="160" cy="52" r="4" class="s"/><text x="170" y="55" class="ta">mark</text>' +
        '<line x1="160" y1="178" x2="120" y2="70" class="l"/><text x="70" y="120" class="t">fast, low</text>' +
        '<line x1="160" y1="178" x2="152" y2="88" class="d"/><text x="196" y="120" class="t">pinching:</text>' +
        '<text x="196" y="132" class="t">slower to</text><text x="196" y="144" class="t">the mark</text>', 195),
      why: 'Upwind passages are won by VMG, not by pointing. Ten degrees of pinch can cost a quarter of your progress.'
    },
    {
      id: 'reefing', title: 'Reefing',
      body: '<p>Reefing reduces sail area. Less area means less heeling force, less weather helm, and — above a certain wind strength — <b>more</b> speed, because a boat sailing on its ear is dragging its hull sideways through the water.</p>' +
        '<p>Rule of thumb: the first time you wonder whether to reef, reef. Sustained heel beyond about 25° means you are overpowered.</p>' +
        '<p>Reefing takes time and is far easier before conditions get bad than after.</p>',
      why: 'An overpowered boat is slower, wetter, harder to steer and much more likely to lose control near a lee shore.'
    },
    {
      id: 'weather_helm', title: 'Weather helm and balance',
      body: '<p>If you let go of the tiller and the boat turns towards the wind, that is <b>weather helm</b>. A little is desirable and safe. A lot means you are dragging the rudder sideways as a brake.</p>' +
        '<p>The mainsail is behind the pivot point and turns the bow into the wind; the headsail is in front of it and pushes the bow away. Reef the main, or unroll more headsail, to reduce weather helm. Heel makes it worse.</p>',
      why: 'Persistent heavy helm is the boat telling you to reduce sail. Listen to it and you go faster.'
    },
    {
      id: 'leeway', title: 'Leeway',
      body: '<p>The wind does not only push the boat forward; it pushes it sideways too. The keel resists this, but not perfectly, so the boat slides slightly downwind of the direction it is pointing. That slip is <b>leeway</b>, typically 3–8° when close-hauled and rather more in light airs or when heavily heeled.</p>' +
        '<p>Your course through the water is therefore not your heading. Add leeway to the downwind side when working out where you will actually arrive.</p>',
      why: 'Steer to clear a rock by exactly the width of the rock and you will hit it. Leeway is why.'
    },
    {
      id: 'stw_sog', title: 'Speed through water vs speed over ground',
      body: '<p><b>STW</b> comes from a paddlewheel or impeller: it measures the water flowing past the hull. <b>SOG</b> comes from GPS: it measures movement across the seabed.</p>' +
        '<p>They differ whenever the water itself is moving. Five knots through the water with two knots of tide under you is seven knots over the ground — or three against.</p>' +
        '<p>The sails care about STW. Your arrival time cares about SOG.</p>',
      why: 'Fuel and sail performance are judged on STW. Deadlines are met on SOG. Confusing them is how passages run late.'
    },
    {
      id: 'set_drift', title: 'Set and drift',
      body: '<p><b>Set</b> is the direction the tidal stream flows towards; <b>drift</b> is its rate. Together they displace the boat from the course you steered.</p>' +
        '<p>Two ways to handle it. <b>Course to steer</b>: aim upstream by enough that the tide carries you onto the track — you point away from your destination and still arrive at it. <b>Ferry gliding</b>: hold a transit — two fixed marks in line — and adjust heading until they stay in line.</p>',
      diagram: svgWrap(
        '<line x1="40" y1="150" x2="270" y2="60" class="d"/><text x="140" y="120" class="t">ground track wanted</text>' +
        '<line x1="40" y1="150" x2="215" y2="30" class="l"/><text x="120" y="52" style="fill:#4fd1c5;font:10px ui-monospace,Menlo,monospace">heading steered</text>' +
        '<line x1="215" y1="30" x2="270" y2="60" stroke="#f2b134" stroke-width="1.8"/>' +
        '<polygon points="273,62 262,58 265,52" fill="#f2b134"/><text x="228" y="26" class="ta">tide</text>' +
        '<circle cx="40" cy="150" r="4" class="s"/><circle cx="270" cy="60" r="4" fill="#63d471"/>', 175),
      why: 'A cross-tide of one knot across a five-mile passage puts you a mile off if you ignore it.'
    },
    {
      id: 'tidal_height', title: 'Tidal height',
      body: '<p>The tide rises and falls roughly twice a day — a cycle of about 12 hours 25 minutes, which is why high water comes about 50 minutes later each day.</p>' +
        '<p>The range is not constant. Around new and full moon, <b>springs</b> give the biggest range; a week later, <b>neaps</b> give the smallest. A harbour you can enter at spring high water may be unreachable at neaps.</p>' +
        '<p>The rise is not linear either. The middle two hours of the tide bring roughly half the total range: the old <b>rule of twelfths</b> — 1, 2, 3, 3, 2, 1 twelfths per hour.</p>',
      why: 'Depth is not a property of a place. It is a property of a place at a time.'
    },
    {
      id: 'chart_datum', title: 'Chart datum and soundings',
      body: '<p>Every sounding printed on a chart is the depth below <b>chart datum</b> — a level chosen so the tide almost never falls below it. So charted depths are pessimistic on purpose.</p>' +
        '<p style="font-family:ui-monospace,Menlo,monospace;color:#f2b134">Actual depth = charted depth + height of tide</p>' +
        '<p>Figures in green with an underline are <b>drying heights</b>: that ground stands above chart datum, and dries out. A drying height of 0.8 m needs a tide above 0.8 m before there is any water there at all.</p>',
      why: 'The chart never changes; the water does. Always add the tide before deciding a place is too shallow.'
    },
    {
      id: 'ukc', title: 'Draft and under-keel clearance',
      body: '<p><b>Draft</b> is how deep your boat sits. Loading cargo and fuel pushes her deeper — a little, but measurably.</p>' +
        '<p style="font-family:ui-monospace,Menlo,monospace;color:#f2b134">UKC = charted depth + height of tide − draft</p>' +
        '<p>Keep a margin. Charts are surveys, not guarantees; waves lift and drop you; the echo sounder reads from the transducer, not the bottom of the keel. Half a metre is a sensible minimum in calm water.</p>',
      diagram: svgWrap(
        '<rect x="0" y="60" width="320" height="70" fill="#0e3a4a"/>' +
        '<path d="M0 130 Q80 120 150 138 T320 128 L320 190 L0 190 Z" fill="#4a3c24"/>' +
        '<line x1="0" y1="60" x2="320" y2="60" class="l"/><text x="6" y="55" class="t">sea surface</text>' +
        '<line x1="0" y1="98" x2="320" y2="98" class="d"/><text x="6" y="94" class="t">chart datum</text>' +
        '<path d="M140 40 L200 40 L192 82 Q170 96 148 82 Z" class="b"/>' +
        '<line x1="240" y1="60" x2="240" y2="98" stroke="#f2b134"/><text x="246" y="80" class="ta">tide</text>' +
        '<line x1="240" y1="98" x2="240" y2="129" stroke="#4fd1c5"/><text x="246" y="118" style="fill:#4fd1c5;font:10px ui-monospace,Menlo,monospace">charted</text>' +
        '<line x1="170" y1="92" x2="170" y2="134" stroke="#ef5b5b" stroke-width="1.6"/>' +
        '<text x="96" y="150" fill="#ef5b5b" font-family="ui-monospace,Menlo,monospace" font-size="10">UKC</text>', 195),
      why: 'Grounding on mud on a rising tide is embarrassing. Grounding on rock on a falling tide can end the boat.'
    },
    {
      id: 'tidal_gate', title: 'Tidal gates',
      body: '<p>Some places can only be passed during part of the tide: a drying bar, a narrow entrance with a fierce stream, a headland with an overfalls race. These are <b>tidal gates</b>.</p>' +
        '<p>Plan a passage backwards from the gate. Work out the window when you can safely pass, then work out when you must leave to arrive inside it — allowing for the tide you will have on the way.</p>',
      why: 'Arriving two hours early at a drying harbour means anchoring off and waiting. Arriving two hours late means the tide has gone.'
    },
    {
      id: 'hull_speed', title: 'Hull speed',
      body: '<p>A displacement hull pushes a wave along with it. As it speeds up, that wave gets longer, until the boat is sitting in a trough of its own making and simply cannot climb out.</p>' +
        '<p style="font-family:ui-monospace,Menlo,monospace;color:#f2b134">hull speed (kn) ≈ 1.34 × √(waterline length in feet)</p>' +
        '<p>It is not a wall, it is a cliff in the drag curve. Doubling engine power near hull speed buys a fraction of a knot and burns fuel enormously.</p>',
      why: 'Know your hull speed and you know the honest answer to "can I get there by five o\'clock?" — no amount of throttle will change it.'
    },
    {
      id: 'engine_range', title: 'Fuel, range and cruising RPM',
      body: '<p>Fuel burn rises roughly with the cube of engine speed while thrust rises with the square. The last knot of speed is always the expensive one.</p>' +
        '<p>Most auxiliary diesels are most economical around 65–75% of maximum revs. Above that you buy very little speed for a lot of diesel.</p>' +
        '<p>Range through the water and range over the ground are different numbers when there is tide. Plan on the worse one, and keep a reserve — a third out, a third back, a third in hand.</p>',
      why: 'Running out of fuel in a foul tide with the wind on the nose is the classic way to turn a delivery into a rescue.'
    },
    {
      id: 'rudder_low_speed', title: 'Steering at low speed',
      body: '<p>A rudder is a wing working in water. No flow past it, no force. That is why a boat that handles beautifully at five knots becomes almost unsteerable while drifting into a berth.</p>' +
        '<p>Two remedies. A brief burst of forward throttle throws propeller wash straight over the rudder and kicks the stern round — <b>steerage</b> without much speed. And keeping just enough way on so that water flows over the blade.</p>',
      why: 'Harbour manoeuvring is where boats get damaged. Slow is right, but stopped is not steerable.'
    },
    {
      id: 'dead_reckoning', title: 'Dead reckoning and fixing',
      body: '<p>Without GPS, position comes from arithmetic: from a known point, apply the course steered and the distance run through the water, then apply the tidal stream and leeway. That estimate is your <b>DR</b>, and its error grows steadily with every minute.</p>' +
        '<p>So you <b>fix</b> it. Pass close by a charted buoy, take a bearing on a headland, line up two marks as a transit — and reset the estimate to the truth.</p>',
      why: 'Never trust a position you have not checked recently. Electronics fail; the arithmetic and the buoys do not.'
    },
    {
      id: 'buoyage', title: 'Buoyage and lights',
      body: '<p>In IALA Region A, entering harbour with the flood: <b>red cans to port, green cones to starboard</b>. Leaving, the other way round.</p>' +
        '<p><b>Cardinal marks</b> — black and yellow — tell you which side to pass a danger by naming a compass quadrant. A north cardinal means pass to the north of it: safe water is north.</p>' +
        '<p>A red-and-white striped safe-water mark shows the middle of the channel, and generally the start of the buoyed approach.</p>',
      why: 'Buoys are the only navigation aid that keeps working when the batteries are flat.'
    },
    {
      id: 'passage_planning', title: 'Passage planning',
      body: '<p>Before you leave, answer five questions and you have a plan.</p>' +
        '<p><b>1. What is the wind going to do?</b> Is the passage a fetch, a beat, or a run — and will it change?<br>' +
        '<b>2. When does the tide turn?</b> Leave to carry a fair stream if you can.<br>' +
        '<b>3. What is the depth at the far end, when I get there?</b><br>' +
        '<b>4. What is my escape?</b> Where can I go if it turns nasty?<br>' +
        '<b>5. What is the deadline, honestly?</b> Distance ÷ realistic speed, not hull speed.</p>',
      why: 'The decision that makes or loses money is usually made in harbour, before the engine starts.'
    },
    {
      id: 'anchoring', title: 'Anchoring: scope',
      body: '<p>An anchor does not hold by weight. It holds by digging in, and it can only dig in if the pull on it is close to horizontal. That is what <b>scope</b> is for.</p>' +
        '<p style="font-family:ui-monospace,Menlo,monospace;color:#f2b134">scope = chain veered ÷ depth of water</p>' +
        '<p>Three to one is a fair-weather minimum with chain. Five to one is a proper anchorage. Seven or more if it is blowing, or if you intend to sleep.</p>' +
        '<p>Two things people forget. First, the depth to use is the depth at <b>high</b> water, not the depth when you dropped it — the tide will rise and quietly shorten your scope. Second, veering more chain also lets the boat swing further.</p>',
      diagram: svgWrap(
        '<rect x="0" y="46" width="320" height="94" fill="#0e3a4a"/>' +
        '<path d="M0 140 L320 140 L320 190 L0 190 Z" fill="#4a3c24"/>' +
        '<line x1="0" y1="46" x2="320" y2="46" class="l"/>' +
        '<path d="M232 30 L268 30 L262 62 Q250 72 238 62 Z" class="b"/>' +
        '<path d="M60 140 Q140 138 200 96 T250 56" class="l"/>' +
        '<polygon points="60,140 52,128 68,128" fill="#f2b134"/>' +
        '<text x="150" y="118" class="ta">chain lies along the bottom: the pull stays flat</text>' +
        '<line x1="300" y1="46" x2="300" y2="140" stroke="#4fd1c5"/>' +
        '<text x="272" y="98" style="fill:#4fd1c5;font:10px ui-monospace,Menlo,monospace">depth</text>' +
        '<text x="14" y="164" class="t">anchor digs in when the pull is horizontal</text>', 195),
      why: 'Short scope is the reason most anchors drag. It costs nothing to veer more chain, and it is the cheapest insurance afloat.'
    },
    {
      id: 'swinging', title: 'Swinging room and the falling tide',
      body: '<p>An anchored boat lies to the wind or the tide, whichever has the stronger hold on her, and she moves as they change. She will sweep a circle whose radius is roughly the chain you have out — so you must have that much clear water all the way round.</p>' +
        '<p>Two questions before you turn in:</p>' +
        '<p><b>How much water will I have at low tide?</b> Take the depth now, subtract the fall still to come, subtract your draft.<br>' +
        '<b>What is inside my swinging circle?</b> Not just now — at low water, when the shallow patch you anchored beside has dried out.</p>',
      why: 'A boat that anchors in six metres at high water and draws one and a half can still sit on the mud by breakfast.'
    },
    {
      id: 'grounding', title: 'When you touch the bottom',
      body: '<p>The moment you feel it, note the state of the tide — everything follows from that. On a rising tide, wait, and she will lift off. On a falling tide, you have minutes, not hours.</p>' +
        '<p>Try astern immediately if you went on slowly. Heeling the boat over reduces draft on a fin keel. Above all, know the bottom: mud forgives, sand mostly forgives, rock does not.</p>',
      why: 'Half of grounding damage is caused in the twenty minutes after the grounding, not during it.'
    }
  ];
  D.entry = function (id) {
    for (var i = 0; i < D.HANDBOOK.length; i++) if (D.HANDBOOK[i].id === id) return D.HANDBOOK[i];
    return null;
  };

})(window.SCS);
