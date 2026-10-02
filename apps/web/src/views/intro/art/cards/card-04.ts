import { msToType } from "../../intro-timeline";
import { INTRO_CARDS, captionText } from "../../script";
import { FRAME_WIDTH } from "../grid";
import type { CycleChar, PaletteChar } from "../palette";
import { FRAME_MS, ditherAt, type Canvas, type CardArt, type Scene } from "../render";

/**
 * Card 4: Helios.
 *
 * Script: "A dark server hall; one warm light at its centre." It opens on the black card 3 closed
 * to, and lights from the inside out, the way card 3 closed from the outside in. On "Helios" a
 * spark kindles in the middle of the dark and grows into a small sun, hung in its cables halfway
 * down a hall of server racks; its warm light spreads along them, a rung of the ladder at a time,
 * until the hall stands out of the dark. On "every corporation built together" the racks' status
 * lights come on in every company's colour, from the light outwards, and pulses run along the
 * floor's cables into it. On "the Plan" the light draws the Plan in the air round itself: three
 * orbits, Earth's, Mars's and Jupiter's, opening out one after another, as an orrery seen from the
 * side, with the light as its Sun. On "Station by station" a dotted line of stations reaches out
 * from Earth, past Mars and Jupiter, a dot at a time, to the edge of the frame and into the dark:
 * where card 5 takes it up.
 *
 * Card 1's Sun was the enemy; this one people built, and it sits where the Sun sits on the Plan.
 * The card stresses what the mind was given — every corporation's wires run into it — and skips
 * what it was asked.
 *
 * The scenery is code (design.md §11): the hall is one-point perspective, every pixel asking which
 * surface its ray meets and how far that is from the light. The numbers worth tweaking are named.
 */

const CARD = INTRO_CARDS[4]!;
const CAPTION = captionText(CARD);

/** When `words` start typing, on the card's clock: the beats follow the caption. */
function cue(words: string): number {
  const at = CAPTION.indexOf(words);
  if (at < 0) throw new Error(`card 4: the caption has no "${words}"`);
  return msToType(CARD, at);
}

// ── timings, on the card's clock (card 4 lasts about 8.5 s: its caption typed, then held) ──
/** A spark on "Helios"; it grows into the whole light in this long. */
export const KINDLE_MS = cue("Helios");
const KINDLE_GROW_MS = 330;
/** The light reaches further, a rung at a time, until it fills the hall. */
const SPREAD_MS = 1300;
const SPREAD_STEPS = 7;
/** "every corporation built together": the racks' lights come on, from the light outwards. */
export const WIRED_MS = cue("every corporation");
const WIRING_MS = 500;
/** The hall is lit and wired: the reduced-motion still of the first beat. */
export const LIT_MS = Math.max(KINDLE_MS + SPREAD_MS, WIRED_MS + WIRING_MS);
/** "the Plan": the orbits open out of the light, one after another. */
export const PLAN_MS = cue("the Plan");
const ORBIT_STAGGER_MS = 260;
const ORBIT_OPEN_MS = 330;
/** The light flares as it delivers the Plan. */
const FLARE_FRAMES = 2;
/** "Station by station": a station appears every step, from Earth outwards. */
export const STATIONS_MS = cue("Station by station");
const STATION_STEP_MS = 240;

// ── the hall ──
/** Where the light hangs, and the point the hall runs to. */
export const LIGHT_X = 192;
export const LIGHT_Y = 76;
/** The bottom of the visible picture: the caption band covers what is below. */
export const VISIBLE = 156;
/** The lens: how many pixels one unit of the hall spans at one unit away. */
const FOCAL = 150;
/** The hall in units: the racks stand either side of the middle, the floor below, the ceiling above. */
const HALF_WIDTH = 1.5;
const FLOOR = 1;
const CEILING = 1.3;
/** The racks stop short of the ceiling. Above them, bare wall. */
const RACK_TOP = 0.85;
const RACK_LENGTH = 1.1;
/** A rack's height in server slots. */
const SLOTS = 9;
const TILE = 0.75;
/** How far down the hall the light hangs. */
const LIGHT_Z = 12;
/** The light's radius on screen, and its flickering rim, card 1's Sun's in small. */
const LIGHT_RADIUS = 6;
const RIM = 1.5;
/** The glow in the air round the light, in pixels: how far it takes to fall to half. */
const HAZE = 9;

/**
 * The warm ladder the light paints with, from the dark up: embers, then gold, then sunlight. A surface
 * takes the rung its light reaches, dithered between rungs.
 */
const WARM: readonly PaletteChar[] = [".", "d", "m", "a", "Y", "y", "w"];
/** The dimmest light that reaches the first rung, and the brightest, which reaches white. */
const LIGHT_MIN = 0.014;
const LIGHT_MAX = 4;

/** Every company's colour, for the status lights and the pulses in the cables. */
const COMPANIES: readonly PaletteChar[] = ["t", "Y", "r", "s", "a", "o"];
/** The floor's cables, by their distance from the middle: they run along the hall into the light. */
const CABLES = [-1.15, -0.55, 0.55, 1.15] as const;
const PULSE_SPEED = 2.6;
const PULSE_SPACING = 2.4;

// ── the Plan ──
interface Orbit {
  /** Its half-width and half-height on screen: a flat ring, seen from the side. */
  readonly rx: number;
  readonly ry: number;
  /** Where the planet sits on it, as an angle, and the planet's colour. */
  readonly at: number;
  readonly planet: PaletteChar;
}

/** Earth's, Mars's and Jupiter's orbits round the light. */
export const ORBITS: readonly Orbit[] = [
  { rx: 44, ry: 12, at: 0.3, planet: "s" },
  { rx: 80, ry: 22, at: 0.02, planet: "r" },
  { rx: 138, ry: 38, at: -0.24, planet: "a" },
];
/** The pixels between two stations, along the line. */
const STATION_GAP = 12;
/** The dashes of an orbit, in pixels along it: drawn, then gap. */
const DASH = 3;

const FLICKER: readonly CycleChar[] = ["7", "8", "9"];

/** A stable pseudo-random number for a pixel: the same every frame, so nothing shimmers by accident. */
function noise(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const frameOf = (timeMs: number) => Math.floor(timeMs / FRAME_MS);
const fraction = (value: number) => value - Math.floor(value);

/** Where a planet sits on screen. */
function planetAt(orbit: Orbit): readonly [number, number] {
  return [LIGHT_X + orbit.rx * Math.cos(orbit.at), LIGHT_Y + orbit.ry * Math.sin(orbit.at)];
}

/**
 * The stations: points every `STATION_GAP` pixels along the line from Earth, through Mars and
 * Jupiter, to the edge of the frame, the planets themselves left out.
 */
function stationsOf(): readonly (readonly [number, number])[] {
  const planets = ORBITS.map(planetAt);
  const last = planets.at(-1)!;
  const before = planets.at(-2)!;
  const slope = (last[1] - before[1]) / (last[0] - before[0]);
  const path = [...planets, [FRAME_WIDTH - 4, last[1] + slope * (FRAME_WIDTH - 4 - last[0])] as const];
  const points: (readonly [number, number])[] = [];

  for (let leg = 1; leg < path.length; leg += 1) {
    const [x0, y0] = path[leg - 1]!;
    const [x1, y1] = path[leg]!;
    const length = Math.hypot(x1 - x0, y1 - y0);
    const count = Math.max(1, Math.round(length / STATION_GAP));
    for (let step = 1; step <= count; step += 1) {
      // A planet is the end of one leg; it is drawn as a planet, not as a station.
      if (leg < path.length - 1 && step === count) continue;
      points.push([x0 + ((x1 - x0) * step) / count, y0 + ((y1 - y0) * step) / count]);
    }
  }
  return points;
}

export const STATIONS = stationsOf();
/** Every station is out: the reduced-motion still of the last beat. */
export const STATIONED_MS = STATIONS_MS + (STATIONS.length - 1) * STATION_STEP_MS;
/** Every orbit is open: the reduced-motion still of the Plan. */
export const PLANNED_MS = PLAN_MS + (ORBITS.length - 1) * ORBIT_STAGGER_MS + ORBIT_OPEN_MS;

// ═══ the light ═══

/** How strong the light is: nothing, then a rung more every step, with a slow breath once full. */
function powerAt(t: number): number {
  if (t < KINDLE_MS) return 0;
  const step = Math.min(SPREAD_STEPS, Math.floor(((t - KINDLE_MS) / SPREAD_MS) * SPREAD_STEPS) + 1);
  // Each step a rung further: light falls off as the square of distance, so double it for reach.
  const spread = 2 ** (step - SPREAD_STEPS);
  const breath = step === SPREAD_STEPS ? 1 + 0.12 * Math.round(Math.sin((2 * Math.PI * t) / 2400) * 2) / 2 : 1;
  const flare = t >= PLAN_MS && t < PLAN_MS + FLARE_FRAMES * FRAME_MS ? 2.5 : 1;
  return spread * breath * flare;
}

/** The light's radius on screen: a spark, then the whole of it. */
function radiusAt(t: number): number {
  if (t < KINDLE_MS) return 0;
  return Math.min(LIGHT_RADIUS, 1 + Math.floor(((t - KINDLE_MS) / KINDLE_GROW_MS) * LIGHT_RADIUS));
}

// ═══ the hall ═══

/**
 * What a pixel's ray meets, and how much of the light it gives back. The hall is a box seen from
 * inside: a ray meets the racks, the floor or the ceiling, whichever is nearest along it.
 */
function paintHall(canvas: Canvas, t: number): void {
  const power = powerAt(t);
  if (power === 0) return;
  const levels = WARM.length - 1;
  const octaves = Math.log2(LIGHT_MAX / LIGHT_MIN);

  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const dx = x + 0.5 - LIGHT_X;
      const dy = y + 0.5 - LIGHT_Y;
      const toWall = dx === 0 ? Infinity : (FOCAL * HALF_WIDTH) / Math.abs(dx);
      const toFloor = dy > 0 ? (FOCAL * FLOOR) / dy : Infinity;
      const toCeiling = dy < 0 ? (FOCAL * CEILING) / -dy : Infinity;
      const z = Math.min(toWall, toFloor, toCeiling);
      const wx = (dx * z) / FOCAL;
      const wy = (dy * z) / FOCAL;

      let albedo: number;
      let frame = false;
      if (z === toWall) {
        // The racks: frames between them, a dark slit of aisle, and slots stacked up each face.
        const along = fraction(z / RACK_LENGTH);
        const slot = ((FLOOR - wy) / (FLOOR + RACK_TOP)) * SLOTS;
        if (wy < -RACK_TOP) albedo = 0.15;
        else if (along < 0.07) albedo = 0.05;
        else if (along < 0.14 || along > 0.95) {
          albedo = 1;
          frame = true;
        } else albedo = fraction(slot) < 0.14 ? 0.3 : 0.6;
      } else if (z === toFloor) {
        // Tiles, and their seams; the floor is polished, so the light shows in it as a streak.
        const seam = fraction(wx / TILE) < 0.05 || fraction(z / TILE) < 0.05;
        albedo = (seam ? 0.3 : 0.6) + 4 * Math.exp(-(wx * wx) / 0.03) / (1 + ((z - LIGHT_Z) / 2) ** 2);
      } else {
        // The ceiling: two cable trays run along it towards the light.
        albedo = Math.abs(Math.abs(wx) - 0.7) < 0.14 ? 0.5 : 0.12;
      }

      const distance = wx * wx + wy * wy + (z - LIGHT_Z) ** 2;
      const haze = 0.5 / (1 + (Math.hypot(dx, dy) / HAZE) ** 2);
      const light = power * (albedo / distance + haze);
      const rung = light <= 0 ? 0 : (Math.log2(light / LIGHT_MIN) / octaves) * levels + 1;
      const level = Math.max(0, Math.min(levels, Math.floor(rung + ditherAt(x, y) - 0.5)));

      // Out of the light's reach, the racks' frames still catch a little of it: the hall's shape.
      if (level === 0 && frame && power > 0.4 && z < 30) canvas.set(x, y, "n");
      else canvas.set(x, y, WARM[level]!);
    }
  }
}

/** A pixel-wide line on screen, in whole steps. */
function line(canvas: Canvas, x0: number, y0: number, x1: number, y1: number, colour: PaletteChar): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let step = 0; step <= steps; step += 1) {
    canvas.set(Math.round(x0 + ((x1 - x0) * step) / steps), Math.round(y0 + ((y1 - y0) * step) / steps), colour);
  }
}

/**
 * The cables: along the floor, gathering under the light, then up into it; and from the ceiling
 * down to it. Dark against the lit floor. Once the hall is wired, pulses run along them into it.
 */
function paintCables(canvas: Canvas, t: number): void {
  const below = LIGHT_Y + (FOCAL * FLOOR) / LIGHT_Z;
  const above = LIGHT_Y - (FOCAL * CEILING) / LIGHT_Z;

  for (const x of [LIGHT_X - 1, LIGHT_X]) {
    line(canvas, x, above, x, LIGHT_Y, ".");
    line(canvas, x, LIGHT_Y, x, below, ".");
  }

  CABLES.forEach((offset, cable) => {
    const colour = COMPANIES[cable % COMPANIES.length]!;
    for (let z = 1.1; z < LIGHT_Z; z += 0.01) {
      // Straight along the floor, then turning in to meet under the light.
      const wx = offset * Math.min(1, (LIGHT_Z - z) / 3);
      const sx = LIGHT_X + (FOCAL * wx) / z;
      const sy = LIGHT_Y + (FOCAL * FLOOR) / z;
      const thick = Math.max(1, Math.round((FOCAL * 0.03) / z));
      const pulse = t >= WIRED_MS && fraction((z - ((t - WIRED_MS) / 1000) * PULSE_SPEED) / PULSE_SPACING + cable * 0.27) < 0.12;
      for (let w = 0; w < thick; w += 1) canvas.set(sx + w - thick / 2, sy, pulse ? colour : ".");
    }
  });
}

/**
 * The racks' status lights: one a slot, in every company's colour, coming on from the light
 * outwards once the hall is wired, and blinking each on its own beat.
 */
function paintStatusLights(canvas: Canvas, t: number): void {
  if (t < WIRED_MS) return;
  const blink = Math.floor(t / 280);

  for (const side of [-1, 1]) {
    for (let rack = 1; rack * RACK_LENGTH < 34; rack += 1) {
      const z = rack * RACK_LENGTH + 0.24;
      if (Math.abs(z - LIGHT_Z) / 22 > (t - WIRED_MS) / WIRING_MS) continue;

      for (let slot = 0; slot < SLOTS; slot += 1) {
        const id = rack * 2 + (side + 1) / 2;
        if (noise(id, slot) < 0.2 || noise(id * 31 + slot, blink + slot) < 0.18) continue;
        const wy = FLOOR - ((slot + 0.55) / SLOTS) * (FLOOR + RACK_TOP);
        const sx = Math.round(LIGHT_X + (side * FOCAL * HALF_WIDTH) / z);
        const sy = Math.round(LIGHT_Y + (FOCAL * wy) / z);
        const size = z < 3.5 ? 2 : 1;
        const colour = COMPANIES[Math.floor(noise(id, slot + 50) * COMPANIES.length)]!;
        for (let v = 0; v < size; v += 1) for (let u = 0; u < size; u += 1) canvas.set(sx + u, sy + v, colour);
      }
    }
  }
}

/** The light itself: a white heart, a flickering rim, card 1's Sun in small. */
function paintLight(canvas: Canvas, t: number): void {
  const radius = radiusAt(t);
  if (radius === 0) return;
  if (radius === 1) {
    canvas.set(LIGHT_X, LIGHT_Y, "w");
    return;
  }

  for (let y = LIGHT_Y - radius - 2; y < LIGHT_Y + radius + 2; y += 1) {
    for (let x = LIGHT_X - radius - 2; x < LIGHT_X + radius + 2; x += 1) {
      const d = Math.hypot(x + 0.5 - LIGHT_X, y + 0.5 - LIGHT_Y);
      if (d < radius - RIM) canvas.set(x, y, d < radius / 2 ? "w" : "y");
      else if (d < radius + 0.5) canvas.set(x, y, FLICKER[Math.floor(noise(x, y) * FLICKER.length)]!);
    }
  }
}

// ═══ the Plan ═══

/** The orbits, opening out of the light one after another, dashed; and on each, its planet. */
function paintOrbits(canvas: Canvas, t: number): void {
  ORBITS.forEach((orbit, index) => {
    const open = Math.min(1, (t - PLAN_MS - index * ORBIT_STAGGER_MS) / ORBIT_OPEN_MS);
    if (open <= 0) return;
    const scale = Math.ceil(open * 4) / 4;
    const rx = orbit.rx * scale;
    const ry = orbit.ry * scale;
    const steps = Math.ceil(2 * Math.PI * rx * 2);
    let travelled = 0;
    let previous: readonly [number, number] | undefined;

    for (let step = 0; step < steps; step += 1) {
      const angle = (step / steps) * 2 * Math.PI;
      const point = [LIGHT_X + rx * Math.cos(angle), LIGHT_Y + ry * Math.sin(angle)] as const;
      if (previous) travelled += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      previous = point;
      if (Math.floor(travelled / DASH) % 2 === 0) canvas.set(point[0], point[1], "s");
    }

    if (open === 1) {
      const [px, py] = planetAt(orbit);
      for (let v = -1; v <= 1; v += 1) for (let u = -1; u <= 1; u += 1) canvas.set(px + u, py + v, u * v === 0 ? orbit.planet : ".");
    }
  });
}

/** The stations, out from Earth one by one, white; each sparks for its first two frames. */
function paintStations(canvas: Canvas, t: number): void {
  if (t < STATIONS_MS) return;
  const out = Math.min(STATIONS.length, Math.floor((t - STATIONS_MS) / STATION_STEP_MS) + 1);

  STATIONS.slice(0, out).forEach(([sx, sy], index) => {
    const left = Math.round(sx) - 1;
    const top = Math.round(sy) - 1;
    if (frameOf(t - STATIONS_MS - index * STATION_STEP_MS) < 2) {
      for (const [u, v] of [[0, -1], [1, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [0, 2], [1, 2]] as const) canvas.set(left + u, top + v, "Y");
    }
    for (let v = 0; v < 2; v += 1) for (let u = 0; u < 2; u += 1) canvas.set(left + u, top + v, "w");
  });
}

/** The whole card at `t` on its own clock. Nothing is painted until the light kindles. */
function paintCard(canvas: Canvas, t: number): void {
  paintHall(canvas, t);
  if (t < KINDLE_MS) return;
  paintCables(canvas, t);
  paintStatusLights(canvas, t);
  paintOrbits(canvas, t);
  paintLight(canvas, t);
  paintStations(canvas, t);
}

// ═══ the scenes ═══

/**
 * The card from `fromMs` on, painted on the card's own clock. It is one shot, split into scenes
 * at its beats so that under reduced motion each beat is a still of its own.
 */
function beat(fromMs: number): Scene {
  return { fromMs, layers: [{ kind: "painted", paint: (canvas) => paintCard(canvas, canvas.timeMs + fromMs) }] };
}

/** Under reduced motion: black, then the hall lit and wired, then the Plan, then every station. */
export const CARD_04_ART: CardArt = {
  scenes: [beat(0), beat(LIT_MS), beat(PLANNED_MS), beat(STATIONED_MS)],
};
