// ---------- Level data ----------
// Types: 'ground' solid, 'plat' solid platform, 'fake' looks solid, vanishes on touch,
// 'crumble' solid, vanishes ~400ms after you land on it (warning shake first),
// 'spike' kills, 'hiddenspike' invisible until triggered, 'togglespike' hazard that
// pulses on/off on a visible timer, 'bounce' launches you, 'reverserzone' flips
// controls temporarily, 'checkpoint' (a property on ground/plat) saves progress,
// 'fakecheckpoint' looks like a checkpoint, isn't, 'moveplat' oscillates and carries
// the player, 'fakeflag' looks like the end but isn't, 'flag' real end (or
// level-complete, if this isn't the last level).
const GROUND_Y = 240;

function rect(x,y,w,h,type,extra={}) { return {x,y,w,h,type,...extra}; }

const LEVEL1_SOLIDS = [
  rect(0, GROUND_Y, 300, 30, 'ground'),
  rect(300, GROUND_Y, 60, 30, 'fake'),               // looks like ground, drops you
  rect(420, GROUND_Y, 500, 30, 'ground'),
  rect(560, GROUND_Y-20, 30, 20, 'hiddenspike'),      // invisible spike mid-ground
  rect(760, 190, 60, 12, 'plat'),
  rect(860, 160, 60, 12, 'fake'),                     // fake platform mid-air -> pit
  rect(960, 190, 60, 12, 'plat'),
  rect(1060, GROUND_Y, 40, 30, 'spike'),
  rect(1130, GROUND_Y, 260, 30, 'ground', {checkpoint:true, name:'BRIDGE OF LIES'}),
  rect(1180, GROUND_Y-70, 20, 70, 'reverserzone'),    // control-reverse trap zone (visual pole)
  rect(1390, GROUND_Y, 60, 30, 'gap'),                // pit (no solid) - death by fall
  rect(1450, GROUND_Y, 260, 30, 'ground'),
  rect(1520, 200, 50, 12, 'bounce'),
  rect(1600, 90, 60, 12, 'plat'),
  rect(1660, 90, 60, 12, 'fake'),
  rect(1720, 60, 260, 12, 'plat'),
  rect(1790, 20, 30, 30, 'hiddenspike'),
  rect(1980, 60, 40, 12, 'gap'),
  rect(2050, 60, 300, 12, 'plat', {checkpoint:true, name:'SKY OF BETRAYAL'}),
  rect(2150, 40, 30, 20, 'fake'),
  rect(2300, 60, 40, 12, 'gap'),
  rect(2380, GROUND_Y, 500, 30, 'ground'),
  rect(2500, GROUND_Y-15, 20, 15, 'spike'),
  rect(2620, GROUND_Y-15, 20, 15, 'hiddenspike'),
  rect(2740, GROUND_Y-15, 20, 15, 'spike'),
  rect(2900, GROUND_Y, 260, 30, 'ground', {checkpoint:true, name:'ONE MORE TRICK...'}),
  rect(2970, 190, 260, 12, 'fake'),                    // huge inviting fake platform near "end"
  rect(3120, GROUND_Y, 60, 30, 'gap'),
  rect(3180, GROUND_Y, 200, 30, 'ground'),
  rect(3260, GROUND_Y-70, 10, 70, 'fakeflag'),         // fake victory flag - actually a spike trigger
  rect(3400, GROUND_Y-70, 10, 70, 'flag'),             // real flag
  rect(3380, GROUND_Y, 220, 30, 'ground'),
];

// Level 2: same proven geometry/rhythm as level 1 (identical x/y/w/h for every
// load-bearing solid, so reachability is guaranteed), with a handful of safe
// substitutions to introduce the new trap types:
//  - hazard-for-hazard swaps (hiddenspike/spike -> togglespike): never solid either
//    way, so solidity/reachability is unaffected.
//  - 'fake' -> 'crumble' on a couple of tiles: both are "solid until triggered",
//    same collision class, only the vanish timing changes.
//  - a fakecheckpoint marker and a moveplat are ADDED on top of existing solid
//    ground (safety net underneath), never replacing anything on the critical path.
const LEVEL2_SOLIDS = [
  rect(0, GROUND_Y, 300, 30, 'ground'),
  rect(300, GROUND_Y, 60, 30, 'crumble'),
  rect(420, GROUND_Y, 500, 30, 'ground'),
  rect(560, GROUND_Y-20, 30, 20, 'togglespike'),
  rect(700, GROUND_Y, 4, 2, 'fakecheckpoint'),         // sits on solid ground, just a troll
  rect(760, 190, 60, 12, 'plat'),
  rect(860, 160, 60, 12, 'moveplat', {axis:'x', baseX:860, range:35, speed:0.024}),
  rect(960, 190, 60, 12, 'plat'),
  rect(1060, GROUND_Y, 40, 30, 'spike'),
  rect(1130, GROUND_Y, 260, 30, 'ground', {checkpoint:true, name:'BRIDGE OF LIES II'}),
  rect(1180, GROUND_Y-70, 20, 70, 'reverserzone'),
  rect(1390, GROUND_Y, 60, 30, 'gap'),
  rect(1450, GROUND_Y, 260, 30, 'ground'),
  rect(1520, 200, 50, 12, 'bounce'),
  rect(1600, 90, 60, 12, 'plat'),
  rect(1660, 90, 60, 12, 'fake'),
  rect(1720, 60, 260, 12, 'plat'),
  rect(1790, 20, 30, 30, 'hiddenspike'),
  rect(1980, 60, 40, 12, 'gap'),
  rect(2050, 60, 300, 12, 'plat', {checkpoint:true, name:'SKY OF BETRAYAL II'}),
  rect(2150, 40, 30, 20, 'crumble'),
  rect(2300, 60, 40, 12, 'gap'),
  rect(2380, GROUND_Y, 500, 30, 'ground'),
  rect(2500, GROUND_Y-15, 20, 15, 'spike'),
  rect(2600, 190, 55, 12, 'moveplat', {axis:'x', baseX:2600, range:60, speed:0.025}), // optional, ground below is a safety net
  rect(2620, GROUND_Y-15, 20, 15, 'togglespike'),
  rect(2740, GROUND_Y-15, 20, 15, 'spike'),
  rect(2900, GROUND_Y, 260, 30, 'ground', {checkpoint:true, name:"ONE MORE TRICK (STILL)"}),
  rect(2970, 190, 260, 12, 'fake'),
  rect(3120, GROUND_Y, 60, 30, 'gap'),
  rect(3180, GROUND_Y, 200, 30, 'ground'),
  rect(3260, GROUND_Y-70, 10, 70, 'fakeflag'),
  rect(3400, GROUND_Y-70, 10, 70, 'flag'),
  rect(3380, GROUND_Y, 220, 30, 'ground'),
];

const LEVELS = [
  { width: 3600, solids: LEVEL1_SOLIDS },
  { width: 3600, solids: LEVEL2_SOLIDS },
];
