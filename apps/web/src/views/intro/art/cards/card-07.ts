import { cardDurationMs } from "../../intro-timeline";
import { FRAME_WIDTH } from "../grid";
import { VISIBLE, clamp01, cueOn, ease, frameOf, noise, offscreen, rungOf, smoothNoise } from "../paint";
import { STEPS_TO_WHITE, type CycleChar, type PaletteChar } from "../palette";
import { ditherAt, fadeRamp, type Canvas, type CardArt, type Scene } from "../render";

/**
 * Card 7: the Diaspora.
 *
 * Script: "A sky full of ships leaving a white Earth." A hard cut from card 6's Jupiter to white,
 * the Brightening's white, and out of it a launch field on a bleached Earth under a white sky,
 * the great ships dark on their pads. On "Diaspora" they light, one after another, and the sky
 * fills with ships rising on columns of smoke, near and far, from every launch field to the
 * horizon. On "and the calendar began again" the camera tilts up with them, through the white
 * sky, into blue, into black, past ships climbing at every height, until the stars come out.
 * Then, from orbit: the white Earth, huge, and as the camera pulls back, ships rising off it
 * everywhere and gathering into rivers of light: a smaller one ending at a small red Mars and at
 * Deimos beside it, and the great ones running on past Mars and out of the frame, bound for the
 * stations beyond. On "Year Zero" it holds; then the camera dives into the Earth's day side, the
 * rivers rushing out of the frame, until its bleached ground fills the frame — where card 8 goes
 * on down, to the ones who stayed.
 *
 * A serious card: no corporate touch. The music carries it.
 *
 * The scenery is code (design.md §11); the numbers worth tweaking are named below.
 */

/** When the first letter of `words` appears, on the card's clock: the beats follow the caption. */
const cue = cueOn(7);

// ── timings, on the card's clock ──
/** The launch field comes out of the white, a step at a time. */
const FADE_IN_STEP_MS = 110;
/** "Diaspora": the first ship lights; the others follow, near and far, over this long. */
export const LAUNCH_MS = cue("Diaspora");
const LAUNCHES_OVER_MS = 2000;
/** "and the calendar began again": the camera tilts up with the ships, into space. */
export const TILT_FROM_MS = cue("and the calendar");
const TILT_MS = 1750;
/** Near the top of the climb, orbit shows through the black, a dither at a time. */
const DISSOLVE_MS = 450;
export const ORBIT_MS = TILT_FROM_MS + TILT_MS;
/** The pull-back from the Earth's edge to the whole of it, its ships streaming away. */
const PULL_MS = 2100;
export const PULLED_MS = ORBIT_MS + PULL_MS;
/** "Year Zero": the picture holds, then dives into the Earth, done just before the card ends. */
export const YEAR_ZERO_MS = cue("Year Zero");
const DIVE_MS = 1500;
export const DIVE_FROM_MS = cardDurationMs(7) - 200 - DIVE_MS;
export const DIVED_MS = DIVE_FROM_MS + DIVE_MS;

// ── the launch field ──
/** Where the ground meets the sky, before the camera tilts. */
export const HORIZON = 128;
/** How far the camera tilts, in pixels of sky. */
const TILT_HEIGHT = 900;
/**
 * The sky by height above the ground: white at the horizon, then pale, then blue, then black.
 * The brightened Sun has bleached the low sky; space begins this many pixels up.
 */
const SKY: readonly PaletteChar[] = ["w", "y", "p", "s", "b", "n", "."];
const SKY_DEPTH = 820;

const TWINKLE: readonly CycleChar[] = ["1", "2", "3", "4", "5", "6"];

/** How far the camera has tilted up, in pixels of sky: eased in and out. */
function tiltAt(t: number): number {
  return ease(clamp01((t - TILT_FROM_MS) / TILT_MS)) * TILT_HEIGHT;
}

/** The sky's rung at a height above the ground: 0 white, the last black. */
const skyRung = (height: number) => (Math.max(0, height) / SKY_DEPTH) * (SKY.length - 1);
/** Whether a height is dark enough that a ship there shows by its lit side and flame, not as a silhouette. */
const inTheDark = (height: number) => skyRung(height) > 2.6;

function paintSky(canvas: Canvas, tilt: number): void {
  for (let y = 0; y < VISIBLE; y += 1) {
    const height = HORIZON - y + tilt;
    if (height < 0) continue;
    const rung = skyRung(height);
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      canvas.set(x, y, SKY[Math.min(SKY.length - 1, Math.floor(rung + ditherAt(x, y)))]!);
    }
  }
}

/** The stars: high up, out of the glare, where the camera's tilt reaches. */
const STARS = Array.from({ length: 160 }, (_, index) => ({
  x: Math.floor(noise(index, 300) * FRAME_WIDTH),
  height: SKY_DEPTH * 0.72 + noise(index, 301) * (TILT_HEIGHT + 60),
  pixel: noise(index, 302) < 0.45 ? TWINKLE[index % TWINKLE.length]! : ("s" as const),
}));

function paintStars(canvas: Canvas, tilt: number): void {
  for (const star of STARS) {
    if (skyRung(star.height) < 4.6) continue;
    canvas.set(star.x, HORIZON - star.height + tilt, star.pixel);
  }
}

/** The ground: a bleached salt flat, cracked, its far edge lost in haze; low mesas along the horizon. */
function paintGround(canvas: Canvas, tilt: number): void {
  for (let x = 0; x < FRAME_WIDTH; x += 1) {
    const mesa = Math.floor(Math.max(0, smoothNoise(x / 34, 3) - 0.35) * 22 + smoothNoise(x / 9, 7) * 2);
    for (let h = 0; h < mesa; h += 1) canvas.set(x, HORIZON - 1 - h + tilt, h > mesa - 2 ? "y" : "p");
  }
  for (let y = Math.max(0, HORIZON + tilt); y < VISIBLE; y += 1) {
    const depth = y - HORIZON - tilt + 1;
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      // The flat seen in perspective: its plates shrink towards the horizon, their cracks with them.
      const u = ((x - FRAME_WIDTH / 2) * 1.6) / depth;
      const v = 90 / depth;
      const plate = smoothNoise(u + 50, v);
      const crack = depth > 4 && Math.abs(plate - 0.5) < 0.02 + depth * 0.0007;
      // Pale and warm far off, in the haze; white near us, where the Sun bleaches it.
      const tone = 0.45 + Math.min(1, depth / 40) * 0.45 + (plate - 0.5) * 0.18;
      canvas.set(x, y, crack ? (depth > 14 ? "g" : "p") : rungOf(["p", "y", "w"], tone, x, y));
    }
  }
}

// ═══ the ships ═══

interface Ship {
  readonly x: number;
  /** How far below the horizon its pad is: further down the frame is nearer. */
  readonly pad: number;
  readonly height: number;
  readonly width: number;
  /** When it lights, on the card's clock. */
  readonly lightsAt: number;
  /** How hard it climbs, in its own heights a second, a second. */
  readonly climb: number;
}

/** The great ships of this launch field, near to far. The first to light stands nearest. */
export const FIELD: readonly Ship[] = [
  { x: 70, pad: 30, height: 74, width: 13, lightsAt: LAUNCH_MS, climb: 1.5 },
  { x: 302, pad: 24, height: 62, width: 11, lightsAt: LAUNCH_MS + 380, climb: 1.6 },
  { x: 186, pad: 14, height: 44, width: 8, lightsAt: LAUNCH_MS + 650, climb: 1.9 },
  { x: 244, pad: 8, height: 30, width: 6, lightsAt: LAUNCH_MS + 900, climb: 2.2 },
  { x: 128, pad: 7, height: 26, width: 5, lightsAt: LAUNCH_MS + 1150, climb: 2.4 },
  { x: 356, pad: 5, height: 20, width: 4, lightsAt: LAUNCH_MS + 1350, climb: 2.6 },
  { x: 18, pad: 4, height: 17, width: 4, lightsAt: LAUNCH_MS + 1600, climb: 2.8 },
];

/** Ships from other fields, beyond the horizon: they rise into view, small, with thin trails. */
const DISTANT = Array.from({ length: 54 }, (_, index) => ({
  x: 4 + noise(index, 310) * (FRAME_WIDTH - 8),
  lightsAt: LAUNCH_MS + 150 + noise(index, 311) * LAUNCHES_OVER_MS,
  climb: 30 + noise(index, 312) * 70,
  size: noise(index, 313) < 0.3 ? 2 : 1,
}));

/** Ships already high when we look up, from fields far away: the climb passes them. */
const HIGH = Array.from({ length: 170 }, (_, index) => ({
  x: noise(index, 320) * FRAME_WIDTH,
  height: 150 + noise(index, 321) * (TILT_HEIGHT + 120),
  speed: 15 + noise(index, 322) * 60,
  size: noise(index, 323) < 0.25 ? 3 : noise(index, 324) < 0.5 ? 2 : 1,
}));

/** How far a field ship has risen by `t`, in pixels: none on the pad, then faster and faster. */
function riseOf(ship: Ship, t: number): number {
  const since = Math.max(0, t - ship.lightsAt) / 1000;
  // A moment of thrust building on the pad before it moves.
  const moving = Math.max(0, since - 0.25);
  return 0.5 * ship.climb * ship.height * moving * moving;
}

const FLAME: readonly PaletteChar[] = ["w", "y", "Y", "o", "r"];

/** A flame under an engine: white at the bell, out through yellow to red, flickering. */
function paintFlame(canvas: Canvas, x: number, top: number, width: number, length: number, t: number): void {
  const flicker = frameOf(t) % 3;
  for (let v = 0; v < length + flicker; v += 1) {
    const reach = v / (length + flicker);
    const half = Math.max(0, (width / 2) * (1 - reach * 0.8));
    for (let u = -Math.ceil(half); u <= Math.ceil(half); u += 1) {
      if (Math.abs(u) > half + 0.3) continue;
      canvas.set(x + u, top + v, FLAME[Math.min(FLAME.length - 1, Math.floor(reach * FLAME.length + Math.abs(u) / (half + 1)))]!);
    }
  }
}

/**
 * A great ship: a long hull, a tapering nose, fins at its foot, an engine bell. Against the white
 * sky it is a silhouette with a sunlit edge; up in the dark, its lit side shows.
 */
function paintHull(canvas: Canvas, x: number, base: number, height: number, width: number, dark: boolean): void {
  const half = width / 2;
  const nose = height * 0.28;
  const fins = height * 0.16;
  const [body, edge] = dark ? (["g", "p"] as const) : (["n", "g"] as const);

  for (let v = 0; v < height; v += 1) {
    const y = base - v;
    const fromTop = height - v;
    let reach = fromTop < nose ? half * Math.sqrt(fromTop / nose) : half;
    if (v < fins) reach += (half * 0.8 * (fins - v)) / fins;
    for (let u = -Math.floor(reach); u <= Math.floor(reach); u += 1) {
      // The Sun is high and to the left: the hull's left edge catches it.
      canvas.set(x + u, y, u === -Math.floor(reach) ? edge : body);
    }
  }
  for (let u = -Math.floor(half * 0.6); u <= Math.floor(half * 0.6); u += 1) canvas.set(x + u, base + 1, "n");
}

/** A gantry beside a ship on its pad: a lattice tower, left standing when the ship has gone. */
function paintGantry(canvas: Canvas, ship: Ship, ground: number): void {
  const left = ship.x + Math.ceil(ship.width / 2) + 3;
  const width = Math.max(2, Math.round(ship.width * 0.35));
  const height = Math.round(ship.height * 0.9);
  for (let v = 0; v < height; v += 1) {
    canvas.set(left, ground - v, "n");
    canvas.set(left + width, ground - v, "n");
    if (v % (width + 1) === 0) for (let u = 0; u <= width; u += 1) canvas.set(left + u, ground - v, "n");
    else canvas.set(left + (v % (width + 1)), ground - v, "b");
  }
}

/**
 * A column of smoke from a pad up to its ship: spreading wide at the bottom where it has been
 * longest, thin at the top where the ship is. Grey in the white sky, wavering.
 */
function paintColumn(canvas: Canvas, ship: Ship, ground: number, top: number, t: number): void {
  const since = (t - ship.lightsAt) / 1000;
  for (let y = Math.max(0, Math.floor(top)); y <= Math.min(VISIBLE - 1, ground); y += 1) {
    const along = (ground - y) / Math.max(1, ground - top);
    const half = ship.width * (0.3 + (1 - along) * Math.min(1.6, since * 0.7));
    const centre = ship.x + Math.sin(y * 0.07 + ship.x) * (1 - along) * ship.width * 0.3;
    for (let x = Math.floor(centre - half); x <= centre + half; x += 1) {
      const out = Math.abs(x + 0.5 - centre) / half;
      if (out > 1) continue;
      canvas.set(x, y, out < 0.5 ? "g" : ditherAt(x, y) < 1 - out ? "g" : "p");
    }
  }
}

/** The cloud a launch throws out across the ground, billowing out either side of the pad. */
function paintBillow(canvas: Canvas, ship: Ship, ground: number, t: number): void {
  const since = (t - ship.lightsAt) / 1000;
  if (since < 0) return;
  const spread = 1 - (1 - Math.min(1, since / 1.6)) ** 2;
  const seed = Math.floor(ship.x);
  // Puffs heaped either side of the pad, the outer ones lower and the inner ones piled up, so the
  // cloud is a heap rather than a slab. Drawn from the outside in: the inner heap stands in front.
  for (let puff = 15; puff >= 0; puff -= 1) {
    const side = noise(seed, puff) < 0.5 ? -1 : 1;
    const out = puff / 15;
    const radius = ship.width * (0.35 + spread * (0.75 - out * 0.35) * (0.7 + noise(seed + 1, puff) * 0.6));
    const px = ship.x + side * out * spread * ship.width * 4.5;
    const py = ground - radius * 0.6 - (1 - out) * spread * ship.width * noise(seed + 2, puff) * 1.4;
    for (let y = Math.floor(py - radius); y <= Math.min(ground, py + radius); y += 1) {
      for (let x = Math.floor(px - radius); x <= px + radius; x += 1) {
        const dx = (x + 0.5 - px) / radius;
        const dy = (y + 0.5 - py) / radius;
        const squared = dx * dx + dy * dy;
        if (squared > 1) continue;
        // Round, lit from high on the left: white crowns, grey bellies.
        const light = (-0.55 * dx - 0.8 * dy) * 0.6 + Math.sqrt(1 - squared) * 0.45;
        canvas.set(x, y, rungOf(["g", "p", "w"], light + 0.15, x, y));
      }
    }
  }
}

/** The ships of the field: on their pads, then lit, then climbing on their columns of smoke. */
function paintField(canvas: Canvas, t: number, tilt: number): void {
  // Far to near, so the nearest ships stand in front.
  for (const ship of [...FIELD].reverse()) {
    const ground = HORIZON + ship.pad + tilt;
    const base = ground - 2 - riseOf(ship, t);
    const lit = t >= ship.lightsAt;

    if (lit && base < ground - 3) paintColumn(canvas, ship, ground, base + ship.width, t);
    paintGantry(canvas, ship, ground);
    if (lit) paintFlame(canvas, ship.x, base + 2, ship.width * 0.7, Math.round(ship.width * 0.9 + Math.min(1, (t - ship.lightsAt) / 600) * ship.width), t);
    paintHull(canvas, ship.x, base, ship.height, ship.width, inTheDark(HORIZON + tilt - base + ship.height / 2));
    if (lit) paintBillow(canvas, ship, ground, t);
  }
}

/** The ships of the far fields, rising over the horizon on thin trails. */
function paintDistant(canvas: Canvas, t: number, tilt: number): void {
  for (const ship of DISTANT) {
    const since = (t - ship.lightsAt) / 1000;
    if (since < 0) continue;
    const height = 0.5 * ship.climb * since * since + since * 6;
    const y = HORIZON - height + tilt;
    // The trail: grey in the low sky, gone where the air thins.
    for (let v = 1; v < height; v += 1) {
      const at = HORIZON - v + tilt;
      if (at < 0 || at >= VISIBLE || skyRung(v) > 2.2) continue;
      if (noise(Math.floor(ship.x), v) < 0.8) canvas.set(ship.x, at, v > height - 18 ? "g" : "p");
    }
    paintSpeck(canvas, ship.x, y, ship.size, height, t);
  }
}

/** A ship too far to have a shape: a speck, dark against the white or lit against the dark, and its flame. */
function paintSpeck(canvas: Canvas, x: number, y: number, size: number, height: number, t: number): void {
  const dark = inTheDark(height);
  for (let v = 0; v < size + 1; v += 1) for (let u = 0; u < size; u += 1) canvas.set(x + u - Math.floor(size / 2), y - v, dark ? "p" : "n");
  canvas.set(x, y + 1, (frameOf(t) + Math.floor(x)) % 2 === 0 ? "Y" : "w");
  if (size > 1) canvas.set(x, y + 2, "o");
}

/** The ships already high, from fields far away: the camera climbs past the slower ones. */
function paintHigh(canvas: Canvas, t: number, tilt: number): void {
  const since = Math.max(0, t - LAUNCH_MS) / 1000;
  for (const ship of HIGH) {
    const height = ship.height + ship.speed * since;
    const y = HORIZON - height + tilt;
    if (y < -4 || y > VISIBLE + 30) continue;
    // A trail beneath it while the air is thick enough to hold one.
    for (let v = 3; v < 30; v += 1) {
      if (skyRung(height - v) > 3.4) break;
      if (ditherAt(Math.floor(ship.x), Math.floor(y + v)) < 0.75 - v / 40) canvas.set(ship.x, y + v, v < 12 ? "g" : "p");
    }
    paintSpeck(canvas, ship.x, y, ship.size, height, t);
  }
}

/** Launch, and the climb: the field, the far fields, the ships already high, and the sky they rise into. */
function paintLaunch(canvas: Canvas, t: number): void {
  const tilt = tiltAt(t);
  paintSky(canvas, tilt);
  paintStars(canvas, tilt);
  if (t >= LAUNCH_MS) paintHigh(canvas, t, tilt);
  paintDistant(canvas, t, tilt);
  paintGround(canvas, tilt);
  paintField(canvas, t, tilt);
}

// ═══ orbit ═══

/** Where the Earth ends up, and how big: low on the left, with room beyond Mars for the rivers to run on. */
export const EARTH_X = 100;
export const EARTH_Y = 130;
export const EARTH_RADIUS = 46;
/** At the start of the pull-back, the Earth's top edge lies across the frame, this big. */
const EARTH_START_RADIUS = 1200;
const EARTH_START_TOP = { x: 196, y: 128 } as const;
/** Mars, part of the way out, and Deimos beside it: in Earth radii from the Earth's middle. */
export const MARS = { x: 4.05, y: -1.7 } as const;
export const DEIMOS = { x: 3.83, y: -1.45 } as const;

/** A direction as a unit vector: x across the screen, y down it, z towards us. */
function unit(x: number, y: number, z: number): readonly [number, number, number] {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/** Where the dive goes in, on the pulled-back Earth: land on its day side. And how far it magnifies. */
const DIVE_TO = { x: 84, y: 114 } as const;
const DIVE_SCALE = 110;

/** The Sun: up and to the left, huge and white now. */
const SUN = unit(-0.55, -0.45, 0.7);

/** The Earth's place and size on the screen at `t`: a log-linear pull-back, eased. */
function earthAt(t: number): { readonly x: number; readonly y: number; readonly radius: number } {
  const p = ease(clamp01((t - ORBIT_MS) / PULL_MS));
  const radius = Math.exp(Math.log(EARTH_START_RADIUS) + (Math.log(EARTH_RADIUS) - Math.log(EARTH_START_RADIUS)) * p);
  const topX = EARTH_START_TOP.x + (EARTH_X - EARTH_START_TOP.x) * p;
  const topY = EARTH_START_TOP.y + (EARTH_Y - EARTH_RADIUS - EARTH_START_TOP.y) * p;

  // The dive: faster and faster, so card 8 can carry on falling, into a point of the day side.
  const d = clamp01((t - DIVE_FROM_MS) / DIVE_MS) ** 2;
  if (d === 0) return { x: topX, y: topY + radius, radius };
  const zoom = DIVE_SCALE ** d;
  const [focusX, focusY] = [DIVE_TO.x + (FRAME_WIDTH / 2 - DIVE_TO.x) * d, DIVE_TO.y + (VISIBLE / 2 - DIVE_TO.y) * d];
  return { x: focusX + (topX - DIVE_TO.x) * zoom, y: focusY + (topY + radius - DIVE_TO.y) * zoom, radius: radius * zoom };
}

/** The white Earth: bleached ground and cloud, its seas gone grey, a few cities lit on its night side. */
const EARTH_LADDER: readonly PaletteChar[] = [".", "b", "s", "p", "w", "w"];
const LAND_LADDER: readonly PaletteChar[] = [".", "g", "p", "y", "w", "w"];

function paintEarth(canvas: Canvas, cx: number, cy: number, radius: number): void {
  for (let y = Math.max(0, Math.floor(cy - radius - 3)); y < Math.min(VISIBLE, cy + radius + 3); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - radius - 3)); x < Math.min(FRAME_WIDTH, cx + radius + 3); x += 1) {
      const dx = (x + 0.5 - cx) / radius;
      const dy = (y + 0.5 - cy) / radius;
      const squared = dx * dx + dy * dy;
      if (squared > 1) {
        // The air: a pale rim on the sunlit side, a blue one round the rest.
        const off = (Math.sqrt(squared) - 1) * radius;
        if (off < 2.5) {
          const sunward = dx * SUN[0] + dy * SUN[1] > 0;
          if (ditherAt(x, y) < 1 - off / 2.5) canvas.set(x, y, sunward ? (off < 1 ? "w" : "p") : "b");
        }
        continue;
      }
      const dz = Math.sqrt(1 - squared);
      const light = Math.max(0.04, dx * SUN[0] + dy * SUN[1] + dz * SUN[2]);
      const longitude = Math.atan2(dx, dz);
      const latitude = Math.asin(-dy);
      const land = smoothNoise(longitude * 3 + 9, latitude * 3) > 0.55;
      const cloud = smoothNoise(longitude * 7 + 2, latitude * 9 + 3);
      const ladder = land && cloud < 0.6 ? LAND_LADDER : EARTH_LADDER;
      // Close up, the dive shows ground: blotches and the cracks of a dried-out land.
      const close = radius > 300 ? (smoothNoise(longitude * 70, latitude * 70) - 0.5) * 0.3 : 0;
      const crack = radius > 1500 && Math.abs(smoothNoise(longitude * 420, latitude * 420) - 0.5) < 0.025;
      const glare = radius > 600 ? 0.8 : 1;
      if (crack) canvas.set(x, y, ladder === LAND_LADDER ? "g" : "b");
      else canvas.set(x, y, rungOf(ladder, light * (0.85 + cloud * 0.2 + close) * glare, x, y));
      // Night side: the cities that are left.
      if (light < 0.06 && land && noise(Math.floor(longitude * 90), Math.floor(latitude * 90)) < 0.05) canvas.set(x, y, "a");
    }
  }
}

/** The Sun, swollen, at the top left: a white disc, a yellow edge, and glare. */
function paintBigSun(canvas: Canvas): void {
  const [sx, sy, radius] = [-34, -40, 92];
  for (let y = 0; y < 90; y += 1) {
    for (let x = 0; x < 110; x += 1) {
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
      if (d < radius - 4) canvas.set(x, y, "w");
      else if (d < radius) canvas.set(x, y, "y");
      else if (d < radius + 18 && ditherAt(x, y) < (1 - (d - radius) / 18) * 0.7) canvas.set(x, y, d < radius + 7 ? "Y" : "o");
    }
  }
}

const ORBIT_STARS = Array.from({ length: 90 }, (_, index) => ({
  x: Math.floor(noise(index, 330) * FRAME_WIDTH),
  y: Math.floor(noise(index, 331) * VISIBLE),
  pixel: noise(index, 332) < 0.4 ? TWINKLE[index % TWINKLE.length]! : noise(index, 333) < 0.5 ? ("b" as const) : ("n" as const),
}));

interface Voyager {
  /** Where on the face of the Earth it lifts off, in Earth radii from the middle. */
  readonly fromX: number;
  readonly fromY: number;
  /** When it lifts off, on the card's clock. */
  readonly leaves: number;
  /** The river it joins. */
  readonly river: number;
  /** Where in the river it runs: a little to one side or the other of the middle. */
  readonly lane: number;
  readonly thrust: number;
}

/**
 * A river of ships: a lane from just off the Earth to where its ships are bound. Ships climb off
 * the Earth, gather where a river starts, and run down it.
 */
interface River {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  /** How far the lane bows out from the straight line, in Earth radii: + to the left of it. */
  readonly bow: number;
  /** Its share of the ships. */
  readonly share: number;
  /** Whether it ends in sight, at Mars or Deimos, rather than running on out of the frame. */
  readonly arrives: boolean;
}

const offEarth = (angle: number) => [Math.cos(angle) * 1.35, Math.sin(angle) * 1.35] as const;

/**
 * Most of the ships are bound for the stations beyond Mars: two great rivers run on past it,
 * one above and one below, and out of the frame. A smaller one ends at Mars, and a thread of it
 * at Deimos.
 */
export const RIVERS: readonly River[] = [
  { start: offEarth(-1.05), end: [7.2, -2.9], bow: 0.15, share: 0.36, arrives: false },
  { start: offEarth(0.25), end: [7.2, -1.75], bow: 0.55, share: 0.34, arrives: false },
  { start: offEarth(-0.4), end: [MARS.x, MARS.y], bow: 0.05, share: 0.2, arrives: true },
  { start: offEarth(-0.4), end: [DEIMOS.x, DEIMOS.y], bow: -0.1, share: 0.1, arrives: true },
].map(({ start, end, ...river }) => ({ startX: start[0], startY: start[1], endX: end[0], endY: end[1], ...river }));

/** A point of a river, `along` from its start (0) to its end (1), `lane` across it, in Earth radii. */
function riverAt(river: River, along: number, lane: number): readonly [number, number] {
  const [dx, dy] = [river.endX - river.startX, river.endY - river.startY];
  const length = Math.hypot(dx, dy);
  const [nx, ny] = [dy / length, -dx / length];
  // Ships bound for a moon or a planet close up on it; the rest keep their lanes.
  const out = river.bow * Math.sin(Math.PI * along) + lane * (river.arrives ? 1 - along : 1);
  return [river.startX + dx * along + nx * out, river.startY + dy * along + ny * out];
}

/** The river a share of the ships falls in: the shares, end to end, from 0 to 1. */
function riverFor(share: number): number {
  let total = 0;
  for (const [index, river] of RIVERS.entries()) {
    total += river.share;
    if (share < total) return index;
  }
  return RIVERS.length - 1;
}

export const VOYAGERS: readonly Voyager[] = Array.from({ length: 1100 }, (_, index) => {
  // A third lift off the top of the Earth, where the pull-back starts; the rest from all over its face.
  const top = index % 3 === 0;
  const angle = top ? -Math.PI / 2 + (noise(index, 340) - 0.5) * 0.8 : noise(index, 340) * 2 * Math.PI;
  const reach = top ? 1 : Math.sqrt(noise(index, 341)) * 0.98;
  return {
    fromX: Math.cos(angle) * reach,
    fromY: Math.sin(angle) * reach,
    river: riverFor(noise(index, 345)),
    leaves: ORBIT_MS - 2600 + noise(index, 343) * (PULL_MS + 4600),
    lane: (noise(index, 342) - 0.5) * 0.18,
    thrust: 0.75 + noise(index, 344) * 0.5,
  };
});

/** How long a voyager takes to climb from its pad to the start of its river. */
const GATHER_S = 0.9;
/** How far each river runs, in Earth radii: the voyagers' pace is set by it. */
const RIVER_LENGTH = RIVERS.map((river) => Math.hypot(river.endX - river.startX, river.endY - river.startY));

/**
 * Where a voyager is, `since` seconds after lift-off, in Earth radii, or undefined once it has
 * arrived or left the picture: up off the Earth and over to its river, then down the river,
 * faster and faster.
 */
function voyagerAt(ship: Voyager, since: number): readonly [number, number] | undefined {
  const river = RIVERS[ship.river]!;
  const [joinX, joinY] = riverAt(river, 0, ship.lane);
  if (since < GATHER_S) {
    // Out from the ground first, then curving over to the river: a bend through a point straight up.
    const s = since / GATHER_S;
    const length = Math.hypot(ship.fromX, ship.fromY) || 1;
    const [upX, upY] = [ship.fromX + (ship.fromX / length) * 0.35, ship.fromY + (ship.fromY / length) * 0.35];
    return [
      (1 - s) ** 2 * ship.fromX + 2 * (1 - s) * s * upX + s * s * joinX,
      (1 - s) ** 2 * ship.fromY + 2 * (1 - s) * s * upY + s * s * joinY,
    ];
  }
  const running = since - GATHER_S;
  const along = (0.6 * running + 0.5 * ship.thrust * running * running) / RIVER_LENGTH[ship.river]!;
  return along >= 1 ? undefined : riverAt(river, along, ship.lane);
}

/** Every voyager in flight: a bright head and a short tail; those arriving dim as they close in. */
function paintVoyagers(canvas: Canvas, t: number, earth: ReturnType<typeof earthAt>): void {
  const screen = (point: readonly [number, number]) => [earth.x + point[0] * earth.radius, earth.y + point[1] * earth.radius] as const;

  for (const ship of VOYAGERS) {
    const since = (t - ship.leaves) / 1000;
    if (since < 0) continue;
    const point = voyagerAt(ship, since);
    if (!point) continue;
    // Lifting off the Earth's far side, a ship only shows once it is clear of the Earth's edge.
    if (Math.hypot(point[0], point[1]) < 1 && Math.hypot(ship.fromX, ship.fromY) >= 0.999) continue;
    const [x, y] = screen(point);
    if (x < -2 || y < -2 || x > FRAME_WIDTH + 2 || y > VISIBLE + 2) continue;

    const river = RIVERS[ship.river]!;
    const tail = [voyagerAt(ship, Math.max(0, since - 0.06)), voyagerAt(ship, Math.max(0, since - 0.12))];
    const closing = river.arrives && Math.hypot(point[0] - river.endX, point[1] - river.endY) < 1.2;
    if (tail[1]) canvas.set(...screen(tail[1]), closing ? "m" : "o");
    if (tail[0]) canvas.set(...screen(tail[0]), closing ? "o" : "Y");
    canvas.set(x, y, closing ? "y" : "w");
  }
}

/** Mars, part of the way out: a small red world, lit from the Sun's side, a faint glow round it. */
function paintMars(canvas: Canvas, cx: number, cy: number): void {
  for (let y = Math.floor(cy - 6); y <= cy + 6; y += 1) {
    for (let x = Math.floor(cx - 6); x <= cx + 6; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < 3.2) canvas.set(x, y, x + y < cx + cy - 1 ? "o" : "r");
      else if (d < 6 && ditherAt(x, y) < (1 - (d - 3.2) / 2.8) * 0.5) canvas.set(x, y, "m");
    }
  }
}

/** The white Earth from orbit, the Sun's glare beside it, and its ships streaming away: to Mars, and beyond. */
function paintOrbit(canvas: Canvas, t: number): void {
  const earth = earthAt(t);
  for (const star of ORBIT_STARS) canvas.set(star.x, star.y, star.pixel);
  paintBigSun(canvas);
  if (earth.radius < 200) {
    paintMars(canvas, earth.x + MARS.x * earth.radius, earth.y + MARS.y * earth.radius);
    // Deimos: a grey speck beside Mars, Externa on it.
    const [dx, dy] = [earth.x + DEIMOS.x * earth.radius, earth.y + DEIMOS.y * earth.radius];
    canvas.set(dx, dy, "p");
    canvas.set(dx + 1, dy, "g");
  }
  paintEarth(canvas, earth.x, earth.y, earth.radius);
  paintVoyagers(canvas, t, earth);
}

// ═══ the card ═══

function paintCard(canvas: Canvas, t: number): void {
  const dissolveFrom = ORBIT_MS - DISSOLVE_MS;
  if (t < dissolveFrom) return paintLaunch(canvas, t);
  if (t >= ORBIT_MS) return paintOrbit(canvas, t);

  const climb = offscreen(canvas.timeMs, (buffer) => paintLaunch(buffer, t));
  const orbit = offscreen(canvas.timeMs, (buffer) => paintOrbit(buffer, t));
  const mix = (t - dissolveFrom) / DISSOLVE_MS;
  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) canvas.set(x, y, (ditherAt(x, y) < mix ? orbit : climb)[y * FRAME_WIDTH + x]!);
  }
}

/**
 * The card from `fromMs` on, painted on the card's own clock. It is one shot after another, split
 * into scenes at its beats so that under reduced motion each beat is a still of its own.
 */
function beat(fromMs: number): Scene {
  return { fromMs, layers: [{ kind: "painted", paint: (canvas) => paintCard(canvas, canvas.timeMs + fromMs) }] };
}

/** The sky full: every field ship up and climbing, the far ones risen. */
export const SKY_FULL_MS = TILT_FROM_MS - 100;

/**
 * Under reduced motion: the launch field on its pads, then the sky full of ships, then the Earth
 * from orbit with its rivers of ships, to Mars and beyond, then its ground close up; the fade out
 * of white steps on cue as it does in motion.
 */
export const CARD_07_ART: CardArt = {
  scenes: [beat(0), beat(SKY_FULL_MS), beat(PULLED_MS), beat(DIVED_MS)],
  fade: fadeRamp(0, FADE_IN_STEP_MS, STEPS_TO_WHITE, 0),
};
