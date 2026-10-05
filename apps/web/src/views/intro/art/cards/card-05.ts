import { FRAME_WIDTH, parsePicture, type Picture } from "../grid";
import { VISIBLE, cueOn, ease, fraction, frameOf, lastFrameOf, noise, offscreen, paintPicture, rungOf, smoothNoise } from "../paint";
import { STEPS_TO_BLACK, darker, type CycleChar, type PaletteChar } from "../palette";
import { FRAME_MS, ditherAt, type Canvas, type CardArt, type Scene } from "../render";
import { CARD_04_ART, LIGHT_X, LIGHT_Y, ORBITS } from "./card-04";

/**
 * Card 5: Mars and Deimos, and the Corridor beyond them.
 *
 * Script: "Mars and Deimos; a dotted line of stations reaching into the dark." It opens on card
 * 4's last frame and zooms into the Plan along Mars's orbit: the hall blows up into chunky pixels
 * and sinks into black, stars come out, and Mars's dot grows into the planet, turning, lit from
 * the left where the Sun is, while Deimos comes out from beside it. The zoom ends with both
 * magnified, and the caption waits for it. On "Externa" the city on Deimos lights up and shuttles
 * start to run to it from Mars, whose night side lights up city by city; then the camera pushes in
 * on Externa Prima, close: a city on Deimos's curved horizon, its towers rising from among domes
 * and palaces, a shuttle lifting off the landing deck in front, and Mars hanging dark over it all,
 * its cities lit. Then it jumps along the Corridor, the
 * stars streaking past: to Steady Foot among Mars's trojans, Mars small behind it, lighting up on
 * its name; and again, through the belt, its rocks rushing past, to Steady Hand, a turning ring
 * with Jupiter ahead. On "A corridor of light" it pulls out to the whole of it — the Sun at the
 * edge, Mars, the belt round the Sun, Jupiter — and every station between them comes on in turn,
 * a pulse of light running along them.
 *
 * The belt lies far beyond Mars, so the Corridor is told in jumps rather than in one shot: each
 * place its own picture, joined by the travel between them (chosen 2026-10-03, over leaving the
 * stations out).
 *
 * The corporate touch is none: card 5 is the Plan carried out, told as plain achievement — bar
 * the teal of Absolute Connections' tower over Externa. What it skips is everyone who built the
 * stations.
 *
 * The scenery is code (design.md §11); the numbers worth tweaking are named below.
 */

/** When the first letter of `words` appears, on the card's clock: the beats follow the caption. */
const cue = cueOn(5);

// ── timings, on the card's clock ──
/** The zoom from card 4's Plan onto Mars and Deimos. The caption waits for it (script.ts). */
export const ZOOM_MS = 1600;
/** Card 4's hall sinks into black between these two points of the zoom; the Plan's orbits, later. */
const HALL_SINKS = [0.1, 0.6] as const;
const ORBITS_SINK = [0.55, 0.9] as const;
/**
 * Until the zoom has magnified this much, card 4's own orbits are left to it: drawn afresh they
 * would cross the light and the stations, which card 4 painted over them.
 */
const CRISP_FROM = 1.3;
/** "Externa": Deimos's city lights up, window by window, in this long. */
export const EXTERNA_MS = cue("Externa");
const EXTERNA_LIGHTING_MS = 400;
/** Then Mars's surface cities, one every step. */
const SURFACE_FROM_MS = EXTERNA_MS + 300;
const SURFACE_STEP_MS = 15;
/** The shuttles between Mars and Deimos: each trip takes this long, and one leaves every period. */
const TRIP_MS = 1500;
const SHUTTLE_PERIOD_MS = 750;
/** The push-in to Externa, close, while the caption pauses after "Externa, 2312." (script.ts). */
const PUSH_FROM_MS = EXTERNA_MS + EXTERNA_LIGHTING_MS + 100;
export const CLOSE_MS = PUSH_FROM_MS + 600;
/** Each jump along the Corridor lands as the next place's name starts typing. */
const JUMP_MS = 800;
export const STEADY_FOOT_MS = cue("Steady Foot");
export const JUMP_TO_FOOT_MS = STEADY_FOOT_MS - JUMP_MS;
export const STEADY_HAND_MS = cue("Steady Hand");
export const JUMP_TO_HAND_MS = STEADY_HAND_MS - JUMP_MS;
/** A station's lights come on this long after we arrive, with a spark on its mast. */
const LIGHTS_AFTER_MS = 120;
const SPARK_FRAMES = 2;
/** The pull-out to the whole Corridor lands as "A corridor of light" starts typing. */
export const CORRIDOR_FROM_MS = cue("A corridor");
export const PULL_FROM_MS = CORRIDOR_FROM_MS - 600;
/** "corridor of light": the stations come on in turn, then a pulse runs along them, again and again. */
export const CORRIDOR_MS = cue("corridor of light");
const CORRIDOR_STEP_MS = 45;
const PULSE_MS = 1300;
const MAP_STATION_GAP = 11;

// ── the frame ──

/** Where Mars sits in card 4's Plan: the middle of its three-pixel cross, which the zoom starts from. */
const FROM_X = Math.floor(LIGHT_X + ORBITS[1]!.rx * Math.cos(ORBITS[1]!.at)) + 0.5;
const FROM_Y = Math.floor(LIGHT_Y + ORBITS[1]!.ry * Math.sin(ORBITS[1]!.at)) + 0.5;
const FROM_RADIUS = 1.5;

/** Where the zoom ends: Mars, magnified, and Deimos beside it. */
export const MARS_X = 112;
export const MARS_Y = 98;
export const MARS_RADIUS = 62;
export const DEIMOS_X = 238;
export const DEIMOS_Y = 56;
const DEIMOS_RADIUS = 24;
/** The faint light the night sides still show, so their shapes read against the stars. */
const AMBIENT = 0.07;
/** How much the zoom magnifies card 4's picture, end to end. */
const MAGNIFICATION = MARS_RADIUS / FROM_RADIUS;

/** A direction as a unit vector: x across the screen, y down it, z towards us. */
function unit(x: number, y: number, z: number): readonly [number, number, number] {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/** Towards the Sun, which is off to the left: across the screen, a little up, and towards us. */
const SUN = unit(-0.85, -0.3, 0.3);
/** How fast Mars turns, in radians a second: slow, but never still. */
const MARS_SPIN = 0.05;

/** Lit Mars, from the dark up: earth, rust, red, orange, amber. The polar caps take the ice ladder. */
const MARS_LADDER: readonly PaletteChar[] = [".", "d", "m", "r", "o", "a"];
const ICE_LADDER: readonly PaletteChar[] = [".", "g", "p", "w"];
const ROCK_LADDER: readonly PaletteChar[] = [".", "d", "g", "p"];

const TWINKLE: readonly CycleChar[] = ["1", "2", "3", "4", "5", "6"];
const FLICKER: readonly CycleChar[] = ["7", "8", "9"];

// ═══ the zoom ═══

/**
 * Where the camera is: how far it has zoomed, from 0 to 1, and where that puts Mars and how big.
 * The zoom eases in and out, and magnifies by a constant factor each frame in between, which is
 * what makes it read as moving in rather than as the picture swelling.
 */
interface Camera {
  readonly progress: number;
  /** Screen pixels per pixel of card 4's picture. */
  readonly scale: number;
  readonly marsX: number;
  readonly marsY: number;
}

function cameraAt(t: number): Camera {
  const linear = Math.min(1, Math.max(0, t / ZOOM_MS));
  const eased = linear * linear * (3 - 2 * linear);
  return {
    progress: linear,
    scale: MAGNIFICATION ** eased,
    marsX: FROM_X + (MARS_X - FROM_X) * eased,
    marsY: FROM_Y + (MARS_Y - FROM_Y) * eased,
  };
}

/** A point of the final picture, where the camera shows it now. */
function view(camera: Camera, x: number, y: number): readonly [number, number] {
  const zoom = camera.scale / MAGNIFICATION;
  return [camera.marsX + (x - MARS_X) * zoom, camera.marsY + (y - MARS_Y) * zoom];
}

/** Card 4's last frame, worked out once: the picture the zoom starts from. */
const card4Frame = () => lastFrameOf(4, CARD_04_ART);

/** How many shades darker something is that sinks between two points of the zoom. */
function sinkAt(camera: Camera, [from, to]: readonly [number, number]): number {
  return Math.max(0, Math.min(1, (camera.progress - from) / (to - from))) * STEPS_TO_BLACK;
}

/** Card 4's picture, magnified pixel by pixel about Mars and sinking into black as it grows. */
function paintPlan(canvas: Canvas, camera: Camera): void {
  const sink = sinkAt(camera, HALL_SINKS);
  if (sink >= STEPS_TO_BLACK) return;
  const frame = card4Frame();

  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const u = Math.floor(FROM_X + (x + 0.5 - camera.marsX) / camera.scale);
      const v = Math.floor(FROM_Y + (y + 0.5 - camera.marsY) / camera.scale);
      if (u < 0 || v < 0 || u >= FRAME_WIDTH || v >= VISIBLE) continue;
      const colour = darker(frame[v * FRAME_WIDTH + u]!, Math.floor(sink + ditherAt(x, y)));
      if (colour !== ".") canvas.set(x, y, colour);
    }
  }
}

/**
 * The Plan's orbits, drawn afresh through the camera rather than magnified, so they stay crisp
 * dashes as the zoom flies into Mars's: its arc sweeps out past the frame and straightens into
 * the line Mars sits on, then sinks into the dark with the rest of the Plan.
 */
function paintOrbits(canvas: Canvas, camera: Camera): void {
  const sink = sinkAt(camera, ORBITS_SINK);
  if (sink >= STEPS_TO_BLACK) return;
  const colour = darker("s", Math.floor(sink));

  for (const orbit of ORBITS) {
    const rx = orbit.rx * camera.scale;
    const ry = orbit.ry * camera.scale;
    const cx = camera.marsX + (LIGHT_X - FROM_X) * camera.scale;
    const cy = camera.marsY + (LIGHT_Y - FROM_Y) * camera.scale;
    // Small steps where it is big, so the dashes are dashes of the screen, not of the orbit.
    const steps = Math.ceil(2 * Math.PI * Math.max(rx, ry) * 2);
    let travelled = 0;
    let previous: readonly [number, number] | undefined;

    for (let step = 0; step < steps; step += 1) {
      const angle = (step / steps) * 2 * Math.PI;
      const x = cx + rx * Math.cos(angle);
      const y = cy + ry * Math.sin(angle);
      if (previous) travelled += Math.hypot(x - previous[0], y - previous[1]);
      previous = [x, y];
      if (x < 0 || y < 0 || x >= FRAME_WIDTH || y >= VISIBLE) continue;
      if (Math.floor(travelled / 3) % 2 === 0) canvas.set(x, y, colour);
    }
  }
}

// ═══ space ═══

/** The stars, coming out as the hall goes: each has its moment in the zoom. */
const STARS = Array.from({ length: 120 }, (_, index) => ({
  x: Math.floor(noise(index, 70) * FRAME_WIDTH),
  y: Math.floor(noise(index, 71) * VISIBLE),
  appears: 0.2 + noise(index, 72) * 0.75,
  pixel: noise(index, 73) < 0.4 ? TWINKLE[index % TWINKLE.length]! : noise(index, 74) < 0.5 ? ("b" as const) : ("n" as const),
}));

function paintStars(canvas: Canvas, camera: Camera): void {
  for (const star of STARS) if (star.appears < camera.progress) canvas.set(star.x, star.y, star.pixel);
}

// ═══ Mars ═══

interface City {
  readonly longitude: number;
  readonly latitude: number;
  readonly big: boolean;
}

/** The surface cities, in the order they light. */
const CITIES: readonly City[] = Array.from({ length: 120 }, (_, index) => ({
  longitude: noise(index, 80) * 2 * Math.PI,
  latitude: (noise(index, 81) - 0.5) * 1.9,
  big: noise(index, 82) < 0.25,
}));

/** Where a point of Mars's surface faces now: x, y, z of the unit sphere, z towards us. */
function surfaceNormal(longitude: number, latitude: number, t: number): readonly [number, number, number] {
  const facing = longitude - (MARS_SPIN * t) / 1000;
  return [Math.sin(facing) * Math.cos(latitude), -Math.sin(latitude), Math.cos(facing) * Math.cos(latitude)];
}

const sunlight = (nx: number, ny: number, nz: number, sun = SUN) => nx * sun[0] + ny * sun[1] + nz * sun[2];

/** Mars in the wide shot, wherever the zoom has got to; a dot on the Plan until it is more. */
function paintMars(canvas: Canvas, camera: Camera, t: number): void {
  const radius = MARS_RADIUS * (camera.scale / MAGNIFICATION);

  // While it is still a dot, it is card 4's dot: the planet on the Plan.
  if (radius < 2.2) {
    const [px, py] = [Math.floor(camera.marsX), Math.floor(camera.marsY)];
    for (const [u, v] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) canvas.set(px + u, py + v, "r");
    return;
  }
  const lit = t < SURFACE_FROM_MS ? 0 : Math.min(CITIES.length, Math.floor((t - SURFACE_FROM_MS) / SURFACE_STEP_MS) + 1);
  paintMarsDisc(canvas, camera.marsX, camera.marsY, radius, SUN, t, lit);
}

/**
 * Mars: a lit sphere, its surface turning. Blotches of dark ground, polar caps, a thin rim of
 * atmosphere on the sunlit limb, and the first `citiesLit` cities' lights on its night side.
 */
function paintMarsDisc(canvas: Canvas, cx: number, cy: number, radius: number, sun: readonly [number, number, number], t: number, citiesLit: number): void {
  const spin = (MARS_SPIN * t) / 1000;
  const reach = Math.ceil(radius + 2);
  for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(VISIBLE, cy + reach); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(FRAME_WIDTH, cx + reach); x += 1) {
      const dx = (x + 0.5 - cx) / radius;
      const dy = (y + 0.5 - cy) / radius;
      const squared = dx * dx + dy * dy;

      if (squared > 1) {
        // The atmosphere: a thin haze just off the sunlit limb.
        const off = (Math.sqrt(squared) - 1) * radius;
        if (radius > 8 && off < 1.6 && dx * sun[0] + dy * sun[1] > 0.25 && ditherAt(x, y) < 0.6 - off * 0.3) canvas.set(x, y, "m");
        continue;
      }

      const dz = Math.sqrt(1 - squared);
      const light = Math.max(AMBIENT, sunlight(dx, dy, dz, sun));
      const latitude = Math.asin(-dy);
      const longitude = Math.atan2(dx, dz) + spin;
      const ground = smoothNoise((longitude / (2 * Math.PI)) * 14, latitude * 3, 14) * 0.6 + smoothNoise((longitude / (2 * Math.PI)) * 40, latitude * 9, 40) * 0.4;
      const cap = Math.abs(latitude) > 1.12 + (ground - 0.5) * 0.3;

      if (cap) canvas.set(x, y, rungOf(ICE_LADDER, light * 1.05, x, y));
      else canvas.set(x, y, rungOf(MARS_LADDER, light * (0.62 + ground * 0.55), x, y));
    }
  }

  // Too small, and the lights are only noise.
  if (radius < 16) return;
  for (const city of CITIES.slice(0, citiesLit)) {
    const [nx, ny, nz] = surfaceNormal(city.longitude, city.latitude, t);
    if (nz < 0.15 || sunlight(nx, ny, nz, sun) > 0.02) continue;
    const [px, py] = [Math.floor(cx + nx * radius), Math.floor(cy + ny * radius)];
    canvas.set(px, py, city.big ? "Y" : "a");
    if (city.big && radius > 20) for (const [u, v] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) canvas.set(px + u, py + v, "a");
  }
}

// ═══ Deimos ═══

/** Deimos is no sphere: its outline is a lumpy potato, the radius it reaches at each angle. */
const deimosShape = (angle: number) => 1 + 0.13 * Math.sin(2 * angle + 0.6) + 0.07 * Math.sin(3 * angle + 2.1) + 0.04 * Math.sin(5 * angle);

interface Tower {
  /** Where on the rim it stands, as a screen angle: up and to the right, the city's side. */
  readonly angle: number;
  readonly height: number;
  /** Its beacon is Absolute Connections teal. */
  readonly ours?: boolean;
}

const TOWERS: readonly Tower[] = [
  { angle: -1.2, height: 3 },
  { angle: -1.02, height: 5, ours: true },
  { angle: -0.9, height: 3 },
  { angle: -0.5, height: 4 },
  { angle: -0.4, height: 2 },
];

/** How far Externa's lights have come on, from 0 to 1. */
const externaLit = (t: number) => Math.max(0, Math.min(1, (t - EXTERNA_MS) / EXTERNA_LIGHTING_MS));
/** Whether the beacons are lit: on together, off together. */
const beaconLit = (t: number) => Math.floor(t / 450) % 2 === 0;

/**
 * Deimos, and Externa on it: grey rock, cratered, lit from the left; on its night side and along
 * its rim, the city — windows in rows, towers standing off the rim with their beacons.
 */
function paintDeimos(canvas: Canvas, camera: Camera, t: number): void {
  const [cx, cy] = view(camera, DEIMOS_X, DEIMOS_Y);
  const radius = DEIMOS_RADIUS * (camera.scale / MAGNIFICATION);
  if (radius < 0.7) return;
  if (radius < 2) {
    canvas.set(cx, cy, "g");
    return;
  }

  const city = externaLit(t);
  const reach = Math.ceil(radius * 1.3);
  for (let y = Math.floor(cy - reach); y <= cy + reach; y += 1) {
    for (let x = Math.floor(cx - reach); x <= cx + reach; x += 1) {
      const lx = x + 0.5 - cx;
      const ly = y + 0.5 - cy;
      const rim = radius * deimosShape(Math.atan2(ly, lx));
      const nx = lx / rim;
      const ny = ly / rim;
      const squared = nx * nx + ny * ny;
      if (squared > 1) continue;

      const light = Math.max(AMBIENT, sunlight(nx, ny, Math.sqrt(1 - squared)));
      const crater = smoothNoise(lx / 3 + 50, ly / 3 + 50, 1000) < 0.3 ? 0.55 : 1;
      canvas.set(x, y, rungOf(ROCK_LADDER, light * crater * 1.1, x, y));

      // Externa: rows of windows on the dark side, each coming on at its own moment.
      const gx = Math.floor(lx - DEIMOS_RADIUS);
      const gy = Math.floor(ly - DEIMOS_RADIUS);
      const district = smoothNoise(lx / 5 + 20, ly / 5 + 20, 1000) > 0.42;
      const window = district && (gx & 1) === 0 && ((gy % 3) + 3) % 3 === 0 && light < 0.3 && squared < 0.9;
      if (window && city > 0 && noise(gx, gy) < 0.6 && noise(gx + 7, gy + 3) < city) {
        canvas.set(x, y, noise(gx + 1, gy) < 0.15 ? "p" : noise(gx + 2, gy) < 0.5 ? "a" : "Y");
      }
    }
  }

  if (t < ZOOM_MS) return;
  for (const tower of TOWERS) {
    const [ux, uy] = [Math.cos(tower.angle), Math.sin(tower.angle)];
    const base = radius * deimosShape(tower.angle) - 1;
    for (let h = 0; h < tower.height; h += 1) {
      for (const w of [0, 1]) {
        const x = cx + ux * (base + h) - uy * w;
        const y = cy + uy * (base + h) + ux * w;
        const lit = city > 0.5 && h % 2 === 1 && w === 0;
        canvas.set(x, y, lit ? "a" : w === 0 ? "g" : "n");
      }
    }
    if (city > 0 && beaconLit(t)) canvas.set(cx + ux * (base + tower.height), cy + uy * (base + tower.height), tower.ours ? "t" : "r");
  }
}

/** Shuttles from Mars's night side up to Externa's docks, one leaving every period. */
function paintShuttles(canvas: Canvas, t: number): void {
  if (t < EXTERNA_MS) return;
  const [fromX, fromY] = [MARS_X + MARS_RADIUS * 0.72, MARS_Y - MARS_RADIUS * 0.62];
  const [toX, toY] = [DEIMOS_X - DEIMOS_RADIUS * 0.5, DEIMOS_Y + DEIMOS_RADIUS * 0.75];

  for (let leaving = Math.floor((t - EXTERNA_MS - TRIP_MS) / SHUTTLE_PERIOD_MS); ; leaving += 1) {
    const departed = EXTERNA_MS + leaving * SHUTTLE_PERIOD_MS;
    if (departed > t) break;
    const along = (t - departed) / TRIP_MS;
    if (along > 1 || departed < EXTERNA_MS) continue;
    // A gentle arc, so they climb away from Mars before turning in to the docks.
    const point = (s: number) => [fromX + (toX - fromX) * s, fromY + (toY - fromY) * s - Math.sin(s * Math.PI) * 10] as const;
    const [x, y] = point(along);
    const [tx, ty] = point(Math.max(0, along - 0.05));
    canvas.set(tx, ty, "o");
    canvas.set(x, y, "w");
  }
}

// ═══ painting off the frame ═══

function pick(frame: readonly PaletteChar[], u: number, v: number): PaletteChar {
  return u >= 0 && v >= 0 && u < FRAME_WIDTH && v < VISIBLE ? frame[Math.floor(v) * FRAME_WIDTH + Math.floor(u)]! : ".";
}

/** A field of stars for a shot, its own, so each place has its own sky. */
function starsOf(seed: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    x: Math.floor(noise(index, seed) * FRAME_WIDTH),
    y: Math.floor(noise(index, seed + 1) * VISIBLE),
    pixel: noise(index, seed + 2) < 0.4 ? TWINKLE[index % TWINKLE.length]! : noise(index, seed + 3) < 0.5 ? ("b" as const) : ("n" as const),
  }));
}

function paintSky(canvas: Canvas, stars: ReturnType<typeof starsOf>): void {
  for (const star of stars) canvas.set(star.x, star.y, star.pixel);
}

// ═══ bodies ═══

/** A rock: lumpy, cratered, lit from the Sun's side. The seed picks its shape and its craters. */
function paintRock(canvas: Canvas, cx: number, cy: number, radius: number, seed: number, ladder = ROCK_LADDER): void {
  if (radius < 1.2) {
    canvas.set(cx, cy, ladder[2] ?? "g");
    return;
  }
  const [a, b, c] = [noise(seed, 1), noise(seed, 2), noise(seed, 3)];
  const shape = (angle: number) => 1 + (0.08 + a * 0.12) * Math.sin(2 * angle + b * 6) + 0.08 * Math.sin(3 * angle + c * 6);
  const reach = Math.ceil(radius * 1.25);

  for (let y = Math.floor(cy - reach); y <= cy + reach; y += 1) {
    for (let x = Math.floor(cx - reach); x <= cx + reach; x += 1) {
      const lx = x + 0.5 - cx;
      const ly = y + 0.5 - cy;
      const rim = radius * shape(Math.atan2(ly, lx));
      const squared = (lx * lx + ly * ly) / (rim * rim);
      if (squared > 1) continue;
      const light = Math.max(AMBIENT, sunlight(lx / rim, ly / rim, Math.sqrt(1 - squared)));
      const crater = smoothNoise((lx / radius) * 3 + seed * 7, (ly / radius) * 3, 1000) < 0.32 ? 0.55 : 1;
      canvas.set(x, y, rungOf(ladder, light * crater * 1.1, x, y));
    }
  }
}

/** Jupiter, small and far: pale and dark bands, lit from the Sun's side. Each band is a tone. */
const JUPITER_LADDER: readonly PaletteChar[] = [".", "d", "m", "o", "a", "y"];
const JUPITER_BANDS = [0.8, 0.6, 1, 0.8, 0.45, 0.85, 0.6, 0.8] as const;

function paintJupiter(canvas: Canvas, cx: number, cy: number, radius: number): void {
  const reach = Math.ceil(radius);
  for (let y = Math.floor(cy - reach); y <= cy + reach; y += 1) {
    for (let x = Math.floor(cx - reach); x <= cx + reach; x += 1) {
      const dx = (x + 0.5 - cx) / radius;
      const dy = (y + 0.5 - cy) / radius;
      const squared = dx * dx + dy * dy;
      if (squared > 1) continue;
      const light = Math.max(AMBIENT, sunlight(dx, dy, Math.sqrt(1 - squared)));
      const band = JUPITER_BANDS[Math.floor(((dy + 1) / 2) * JUPITER_BANDS.length)]!;
      canvas.set(x, y, rungOf(JUPITER_LADDER, light * band * 1.15, x, y));
    }
  }
}

// ═══ the push-in to Externa ═══

/** The point of Deimos the push-in closes in on: the towers on its rim, where the city stands. */
const EXTERNA_X = DEIMOS_X + DEIMOS_RADIUS * deimosShape(-0.75) * Math.cos(-0.75);
const EXTERNA_Y = DEIMOS_Y + DEIMOS_RADIUS * deimosShape(-0.75) * Math.sin(-0.75);
/** How much the push-in magnifies before it gives way to the close-up. */
const PUSH_SCALE = 6;
/** How far into the push-in the close-up starts to show through, a dither at a time. */
const DISSOLVE_FROM = 0.5;

/**
 * The wide shot, magnified pixel by pixel about Externa, chunkier and chunkier, while the close-up
 * shows through it in an ordered dither: the camera arriving, the old way.
 */
function paintPush(canvas: Canvas, t: number): void {
  const progress = (t - PUSH_FROM_MS) / (CLOSE_MS - PUSH_FROM_MS);
  const scale = PUSH_SCALE ** (progress * progress);
  const anchorX = EXTERNA_X + (FRAME_WIDTH / 2 - EXTERNA_X) * ease(progress);
  const anchorY = EXTERNA_Y + (VISIBLE / 2 - EXTERNA_Y) * ease(progress);
  const wide = offscreen(canvas.timeMs, (buffer) => paintWide(buffer, t));
  const dissolve = Math.max(0, (progress - DISSOLVE_FROM) / (1 - DISSOLVE_FROM));
  const close = dissolve > 0 ? offscreen(canvas.timeMs, (buffer) => paintCloseUp(buffer, t)) : undefined;

  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      if (close && ditherAt(x, y) < dissolve) canvas.set(x, y, pick(close, x, y));
      else canvas.set(x, y, pick(wide, EXTERNA_X + (x + 0.5 - anchorX) / scale, EXTERNA_Y + (y + 0.5 - anchorY) / scale));
    }
  }
}

// ═══ the close-up: Externa Prima ═══

const CLOSE_STARS = starsOf(100, 90);
/** Mars, hanging over the city: from Deimos, mostly its night side, a thin crescent of day. */
const CLOSE_MARS = { x: 78, y: -24, radius: 112 } as const;
const BEHIND_SUN = unit(-0.95, -0.12, -0.32);
/**
 * The ground at the city's heart, where the towers stand. None of it shows: the city in front of
 * them hides their feet. Deimos is so small a moon that every line of its ground curves away
 * within the frame.
 */
const HORIZON = 128;
const HORIZON_CURVE = 2400;
const groundAt = (x: number) => HORIZON + ((x - FRAME_WIDTH / 2) ** 2) / HORIZON_CURVE;
/** Deimos's edge against the sky, beyond the heart: the far skyline stands on it. */
const LIMB_RISE = 18;
const limbAt = (x: number) => groundAt(x) - LIMB_RISE;
/** The middle ring of the city, nearer than the towers, and the near ring, nearer still: lower in the frame, flatter. */
const midAt = (x: number) => 148 + ((x - FRAME_WIDTH / 2) ** 2) / 3200;
const nearAt = (x: number) => 174 + ((x - FRAME_WIDTH / 2) ** 2) / 5000;

/** Where something standing `width` wide from `left` meets a line of ground: the heart's, unless told. */
const baseOf = (left: number, width: number, ground = groundAt) => Math.ceil(ground(left + width / 2)) + 2;

/** How high above the horizon the city's glow reaches. */
const GLOW_HEIGHT = 48;
/** The faintest glow drawn at all. */
const GLOW_FLOOR = 0.07;

/**
 * The glow of a city too big for the frame: light thrown up off its streets, dithered into the sky
 * along the horizon and strongest at the middle, behind the towers.
 */
function paintCityGlow(canvas: Canvas): void {
  for (let x = 0; x < FRAME_WIDTH; x += 1) {
    const middle = 1 - Math.abs(x - FRAME_WIDTH / 2) / (FRAME_WIDTH / 2);
    const ground = limbAt(x);
    for (let y = Math.floor(ground - GLOW_HEIGHT); y < ground; y += 1) {
      // Only behind the city: it fades out well before the frame's edges.
      const strength = (1 - (ground - y) / GLOW_HEIGHT) ** 1.5 * middle ** 2.5;
      // The dither's lowest cell is 0: below a minimum, a faint glow would still light it everywhere.
      const level = strength * 0.4;
      if (level > GLOW_FLOOR && ditherAt(x, y) < level) canvas.set(x, y, strength > 0.6 && ditherAt(x + 1, y) < 0.3 ? "b" : "k");
    }
  }
}

/** The far city: plain towers right along Deimos's edge, taller towards the middle, a few lights in each. */
const FAR_TOWERS: readonly { readonly left: number; readonly width: number; readonly height: number }[] = (() => {
  const towers: { left: number; width: number; height: number }[] = [];
  for (let left = 4; left < FRAME_WIDTH - 6; ) {
    const width = 4 + Math.floor(noise(left, 301) * 6);
    const middle = 1 - Math.abs(left + width / 2 - FRAME_WIDTH / 2) / (FRAME_WIDTH / 2);
    towers.push({ left, width, height: Math.floor((6 + 32 * middle) * (0.55 + noise(left, 302) * 0.7)) });
    left += width + (noise(left, 303) < 0.3 ? 1 : 0);
  }
  return towers;
})();

function paintFarCity(canvas: Canvas): void {
  for (const tower of FAR_TOWERS) {
    const base = baseOf(tower.left, tower.width, limbAt);
    const top = base - tower.height;
    for (let y = top; y < base; y += 1) {
      for (let x = tower.left; x < tower.left + tower.width; x += 1) {
        const lit = (y - top) % 3 === 2 && (x - tower.left) % 2 === 1 && noise(x, y + 7) < 0.22;
        canvas.set(x, y, lit ? (noise(x, y + 8) < 0.6 ? "a" : "y") : y === top ? "b" : "n");
      }
    }
  }
}

/** How a tower's top ends: flat under a mast, set back in steps, sloped, or drawn to a spire. */
type Crown = "mast" | "stepped" | "slant" | "spire";

interface Skyscraper {
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly crown: Crown;
  /** A zaibatsu's colour: a lit band under its crown, and its beacon. */
  readonly accent?: PaletteChar;
}

/** How deep a crown is, in rows: below it, the tower is full width. */
const CROWN_ROWS = 12;

/** How far in from each side a tower's row `v` (0 at its top) is, for its crown. */
function insetOf(tower: Skyscraper, v: number): { readonly left: number; readonly right: number } {
  if (v >= CROWN_ROWS) return { left: 0, right: 0 };
  switch (tower.crown) {
    case "mast":
      return { left: 0, right: 0 };
    case "stepped": {
      const step = v < 4 ? 2 : v < 8 ? 1 : 0;
      return { left: step * 2, right: step * 2 };
    }
    case "slant": {
      const cut = Math.round((1 - v / CROWN_ROWS) * (tower.width - 3));
      return { left: 0, right: cut };
    }
    case "spire": {
      const half = Math.round((1 - v / CROWN_ROWS) * (tower.width / 2 - 1));
      return { left: half, right: half };
    }
  }
}

/** The zaibatsu towers, either side of Absolute Connections' own, which stands from 178 to 206. */
const SKYSCRAPERS: readonly Skyscraper[] = [
  { left: 90, width: 9, height: 42, crown: "slant" },
  { left: 101, width: 12, height: 60, crown: "stepped", accent: "r" },
  { left: 115, width: 8, height: 50, crown: "mast" },
  { left: 125, width: 14, height: 82, crown: "spire", accent: "Y" },
  { left: 141, width: 10, height: 56, crown: "stepped" },
  { left: 153, width: 13, height: 94, crown: "slant", accent: "o" },
  { left: 168, width: 8, height: 64, crown: "mast" },
  { left: 208, width: 9, height: 70, crown: "mast" },
  { left: 219, width: 13, height: 98, crown: "spire", accent: "s" },
  { left: 234, width: 10, height: 58, crown: "stepped" },
  { left: 246, width: 14, height: 84, crown: "stepped", accent: "r" },
  { left: 262, width: 8, height: 46, crown: "slant" },
  { left: 272, width: 11, height: 66, crown: "spire", accent: "Y" },
  { left: 285, width: 9, height: 40, crown: "mast" },
  { left: 296, width: 10, height: 52, crown: "slant", accent: "o" },
];

/** Beacons blink each to its own beat, so the skyline never blinks as one. */
const beaconOf = (t: number, left: number) => beaconLit(t + left * 37);

/** A lit window's colour: mostly amber, some sun yellow, a few pale. */
const windowColour = (x: number, y: number): PaletteChar => (noise(x + 1, y) < 0.18 ? "p" : noise(x + 2, y) < 0.3 ? "Y" : "a");

function paintSkyscraper(canvas: Canvas, tower: Skyscraper, t: number): void {
  const base = baseOf(tower.left, tower.width);
  const top = base - tower.height;

  for (let y = top; y < base; y += 1) {
    const v = y - top;
    const inset = insetOf(tower, v);
    const from = tower.left + inset.left;
    const to = tower.left + tower.width - inset.right;
    for (let x = from; x < to; x += 1) {
      const u = x - tower.left;
      // The zaibatsu's band, lit under the crown; below it, windows on a 3×3 grid, most of them lit.
      const band = tower.accent !== undefined && (v === CROWN_ROWS || v === CROWN_ROWS + 1) && x > from && x < to - 1;
      const window = v > CROWN_ROWS + 2 && v % 3 === 1 && u % 3 === 2 && u < tower.width - 1;
      const flicker = noise(x * 7 + Math.floor(t / 900), y) < 0.02;
      if (band) canvas.set(x, y, tower.accent!);
      else if (window && noise(x, y) < 0.78 && !flicker) canvas.set(x, y, windowColour(x, y));
      // The face towards the Sun catches its light, and so does the crown's edge.
      else canvas.set(x, y, x === from || (v < CROWN_ROWS && x === to - 1) ? "g" : u < 2 ? "b" : "n");
    }
  }

  const mast = tower.left + Math.floor(tower.width / 2);
  const mastHeight = tower.crown === "spire" ? 6 : tower.crown === "mast" ? 5 : 3;
  for (let y = top - mastHeight; y < top; y += 1) canvas.set(mast, y, "g");
  if (beaconOf(t, tower.left)) canvas.set(mast, top - mastHeight - 1, tower.accent ?? "r");
}

/**
 * Absolute Connections' own tower, in the middle of the city and far above it: set back three
 * times to a spire, its windows teal, teal light running up its edges, and on its face the
 * four-colour square, lit, under the teal beacon that tops the city.
 */
const OURS = { left: 178, width: 28, height: 116 } as const;

/** The logo on the tower's face: the square's four corners in their colours, the dial at its heart. */
const LOGO: Picture = parsePicture(
  "card 5 logo",
  `
  ttttt___YYYYY
  ttttt___YYYYY
  tt_________YY
  tt___www___YY
  _____w.w_____
  ss___www___rr
  ss_________rr
  sssss___rrrrr
  sssss___rrrrr
`,
);

function paintOurs(canvas: Canvas, t: number): void {
  const base = baseOf(OURS.left, OURS.width);
  const top = base - OURS.height;
  const centre = OURS.left + OURS.width / 2;

  for (let y = top; y < base; y += 1) {
    const v = y - top;
    const step = v < 8 ? 9 : v < 16 ? 6 : v < 24 ? 3 : 0;
    const from = OURS.left + step;
    const to = OURS.left + OURS.width - step;
    for (let x = from; x < to; x += 1) {
      const u = x - from;
      const edge = x === from || x === to - 1;
      // Teal light up its edges and along each setback; windows teal on a 2-wide grid.
      const ledge = v === 8 || v === 16 || v === 24;
      const window = !edge && v > 26 && v % 3 === 1 && u % 2 === 1 && noise(x, y) < 0.85;
      if (edge) canvas.set(x, y, v % 2 === 0 ? "t" : x === from ? "g" : "n");
      else if (ledge) canvas.set(x, y, "t");
      else if (window) canvas.set(x, y, noise(x + 5, y) < 0.15 ? "p" : "t");
      else canvas.set(x, y, x < from + 3 ? "b" : "n");
    }
  }

  // The square on its face, on a dark panel so it reads from across the city.
  const logoLeft = Math.round(centre - LOGO.width / 2);
  const logoTop = top + 28;
  for (let y = logoTop - 1; y <= logoTop + LOGO.height; y += 1) {
    for (let x = logoLeft - 1; x <= logoLeft + LOGO.width; x += 1) canvas.set(x, y, ".");
  }
  paintPicture(canvas, LOGO, logoLeft, logoTop);

  // The spire, and the beacon over the whole city.
  const spire = Math.floor(centre);
  for (let y = top - 12; y < top; y += 1) canvas.set(spire, y, y < top - 6 ? "g" : "p");
  canvas.set(spire - 1, top - 1, "g");
  canvas.set(spire + 1, top - 1, "g");
  if (beaconLit(t)) {
    canvas.set(spire, top - 13, "t");
    canvas.set(spire - 1, top - 13, "t");
    canvas.set(spire + 1, top - 13, "t");
    canvas.set(spire, top - 14, "t");
  }
}

/** Skybridges between the towers, lit along their length: drawn behind, so only the spans between show. */
const BRIDGES: readonly { readonly left: number; readonly right: number; readonly above: number }[] = [
  { left: 99, right: 182, above: 34 },
  { left: 130, right: 252, above: 62 },
  { left: 202, right: 300, above: 40 },
  { left: 150, right: 232, above: 84 },
];

function paintBridges(canvas: Canvas): void {
  for (const bridge of BRIDGES) {
    const y = Math.round(HORIZON + 2 - bridge.above);
    for (let x = bridge.left; x <= bridge.right; x += 1) {
      canvas.set(x, y, "g");
      canvas.set(x, y + 1, x % 3 === 0 ? "a" : "n");
    }
  }
}

/**
 * The low city at the towers' feet: blocks shoulder to shoulder along the ground, every one lit.
 * The city in front hides most of it; it shows towards the edges, where the rings in front are low.
 */
const BLOCKS: readonly { readonly left: number; readonly width: number; readonly height: number }[] = (() => {
  const blocks: { left: number; width: number; height: number }[] = [];
  for (let left = 0; left < FRAME_WIDTH; ) {
    const width = 3 + Math.floor(noise(left, 311) * 5);
    const middle = 1 - Math.abs(left + width / 2 - FRAME_WIDTH / 2) / (FRAME_WIDTH / 2);
    blocks.push({ left, width, height: 3 + Math.floor(noise(left, 312) * (3 + 6 * middle)) });
    left += width;
  }
  return blocks;
})();

function paintLowCity(canvas: Canvas): void {
  for (const block of BLOCKS) {
    const base = baseOf(block.left, block.width);
    for (let y = base - block.height; y < base; y += 1) {
      for (let x = block.left; x < block.left + block.width; x += 1) {
        const window = (base - y) % 2 === 0 && noise(x, y + 9) < 0.55;
        canvas.set(x, y, window ? windowColour(x, y) : y === base - block.height ? "b" : "n");
      }
    }
  }
}

/** The step between a near dome's ribs, along it and up it: wide enough apart to show how big it is. */
const RIB_STEP = Math.PI / 9;

/** Where a point of a dome lies on it: its longitude across, its latitude up, both in radians. */
function domeAngles(cx: number, base: number, radius: number, x: number, y: number): readonly [number, number] {
  const up = Math.min(1, (base - y) / radius);
  const ring = Math.sqrt(1 - up * up) * radius;
  const across = ring > 0 ? Math.max(-1, Math.min(1, (x - cx) / ring)) : 0;
  return [Math.asin(across), Math.asin(up)];
}

/** Whether a dome's glass frame runs between this pixel and the next one right, or the one above. */
function onRib(cx: number, base: number, radius: number, x: number, y: number): boolean {
  const [longitude, latitude] = domeAngles(cx, base, radius, x + 0.5, y + 0.5);
  const [nextLongitude] = domeAngles(cx, base, radius, x + 1.5, y + 0.5);
  const [, upLatitude] = domeAngles(cx, base, radius, x + 0.5, y - 0.5);
  return Math.floor(longitude / RIB_STEP) !== Math.floor(nextLongitude / RIB_STEP) || Math.floor(latitude / RIB_STEP) !== Math.floor(upLatitude / RIB_STEP);
}

/** A glass dome over lit streets, standing on `base`. A near one shows its frame, ribs across and round. */
function paintDome(canvas: Canvas, cx: number, base: number, radius: number, ribs = false): void {
  for (let y = Math.floor(base - radius); y < base; y += 1) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - base) / radius;
      if (d > 1) continue;
      // Glass: a pale rim, a glint where the Sun strikes it, and the lights of the streets inside.
      if (d > 0.88 || (radius > 4 && d > 1 - 1.5 / radius)) canvas.set(x, y, x < cx ? "s" : "b");
      else if (d > 0.7 && x < cx - radius * 0.3 && y < base - radius * 0.5) canvas.set(x, y, "p");
      else if (ribs && onRib(cx, base, radius, x, y)) canvas.set(x, y, x < cx ? "s" : "b");
      else if (y > base - radius * 0.45 && noise(x, y) < 0.25) canvas.set(x, y, noise(x + 3, y) < 0.5 ? "a" : "Y");
      else canvas.set(x, y, ditherAt(x, y) < 0.5 ? "n" : "b");
    }
  }
}

/**
 * The middle ring: palaces with tall windows under their cornices, some crowned with a small dome;
 * terraces set back as they rise; domes on drums. Shoulder to shoulder in front of the towers and
 * tallest in the middle, so the towers rise from among them and only their tops show.
 */
interface MidBuilding {
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly kind: "palace" | "terrace" | "dome";
  readonly cupola: boolean;
}

const MID_RING: readonly MidBuilding[] = (() => {
  const buildings: MidBuilding[] = [];
  for (let left = -6; left < FRAME_WIDTH + 6; ) {
    const choice = noise(left, 321);
    const kind = choice < 0.22 ? "dome" : choice < 0.45 ? "terrace" : "palace";
    const width = (kind === "dome" ? 16 : 12) + Math.floor(noise(left, 322) * 14);
    const middle = 1 - Math.abs(left + width / 2 - FRAME_WIDTH / 2) / (FRAME_WIDTH / 2);
    const height = Math.floor((16 + 26 * middle) * (0.75 + noise(left, 323) * 0.45));
    buildings.push({ left, width, height, kind, cupola: kind === "palace" && noise(left, 324) < 0.4 });
    left += width + (noise(left, 325) < 0.25 ? 2 : 0);
  }
  return buildings;
})();

/** How far a terrace steps in from each side on its row `v`, counted from its top: it sets back every six rows. */
const TERRACE_ROWS = 6;
const terraceInset = (building: MidBuilding, v: number) => (building.kind === "terrace" ? Math.max(0, 2 - Math.floor(v / TERRACE_ROWS)) * 2 : 0);

/** A block of the middle ring, from `top` to `base`: a cornice that catches the light, then tall windows, most of them lit. */
function paintBlock(canvas: Canvas, building: MidBuilding, top: number, base: number): void {
  for (let y = top; y < base; y += 1) {
    const v = y - top;
    const inset = terraceInset(building, v);
    const from = building.left + inset;
    const to = building.left + building.width - inset;
    for (let x = from; x < to; x += 1) {
      const u = x - from;
      const cornice = v === 0 || (building.kind === "terrace" && v % TERRACE_ROWS === 0);
      // Windows two rows tall, every third column; both rows of a window lit or dark together.
      const row = v % 5;
      const window = v > 2 && (row === 2 || row === 3) && u % 3 === 1 && x < to - 1;
      const sill = row === 3 ? y - 1 : y;
      if (cornice) canvas.set(x, y, u < 2 ? "p" : "g");
      else if (window) canvas.set(x, y, noise(x, sill) < 0.62 ? windowColour(x, sill) : ".");
      else canvas.set(x, y, x === from ? "g" : u < 2 || v === 1 ? "b" : "n");
    }
  }
}

function paintMidBuilding(canvas: Canvas, building: MidBuilding): void {
  const base = baseOf(building.left, building.width, midAt);
  const top = base - building.height;
  const centre = building.left + building.width / 2;

  if (building.kind === "dome") {
    const radius = building.width / 2;
    const drum = base - Math.max(5, building.height - Math.floor(radius));
    paintDome(canvas, centre, drum, radius);
    paintBlock(canvas, building, drum, base);
    return;
  }
  paintBlock(canvas, building, top, base);
  if (building.cupola) {
    const radius = Math.min(5, Math.floor(building.width / 4));
    paintDome(canvas, centre, top, radius);
    canvas.set(Math.floor(centre), top - radius - 1, "g");
  }
}

/** The near ring: great glass domes, their frames showing, and long low halls between them. */
const NEAR_DOMES: readonly { readonly x: number; readonly radius: number }[] = [
  { x: 104, radius: 28 },
  { x: 198, radius: 22 },
  { x: 290, radius: 30 },
  { x: 372, radius: 18 },
];
const NEAR_HALLS: readonly { readonly left: number; readonly width: number; readonly height: number }[] = [
  { left: 66, width: 22, height: 18 },
  { left: 128, width: 52, height: 25 },
  { left: 214, width: 52, height: 29 },
  { left: 318, width: 44, height: 21 },
];

/** A hall: a roof edge bright in the Sun, and bands of glass lit along its length, split by mullions. */
function paintHall(canvas: Canvas, hall: (typeof NEAR_HALLS)[number]): void {
  const base = baseOf(hall.left, hall.width, nearAt);
  const top = base - hall.height;
  for (let y = top; y < Math.min(base, VISIBLE); y += 1) {
    const v = y - top;
    for (let x = hall.left; x < hall.left + hall.width; x += 1) {
      const u = x - hall.left;
      const band = (v % 8 === 4 || v % 8 === 5) && u > 1 && u < hall.width - 2;
      const mullion = u % 5 === 0;
      if (v === 0) canvas.set(x, y, u < hall.width / 2 ? "p" : "g");
      else if (band) canvas.set(x, y, mullion ? "n" : noise(x >> 2, y) < 0.8 ? windowColour(x >> 2, y) : "b");
      else canvas.set(x, y, u === 0 ? "g" : u < 3 || v === 1 ? "b" : "n");
    }
  }
}

function paintNearRing(canvas: Canvas): void {
  for (const hall of NEAR_HALLS) paintHall(canvas, hall);
  for (const dome of NEAR_DOMES) paintDome(canvas, dome.x, Math.ceil(nearAt(dome.x)) + 2, dome.radius, true);
}

/**
 * The docking spire: cheap docking is what Externa was founded on. A lattice mast with arms to
 * the right, standing behind the middle ring, freighters berthed on the upper two; the lowest is
 * where the incoming shuttle docks.
 */
const SPIRE_X = 336;
const SPIRE_HEIGHT = 90;
const SPIRE_ARMS = [26, 48, 70] as const;

/** A freighter, berthed side on: a long hull, its running lights. */
const FREIGHTER: Picture = parsePicture(
  "card 5 freighter",
  `
  _gggggggg__
  gpgngngngpg
  _ggggggggr_
`,
);

function paintDockingSpire(canvas: Canvas, t: number): void {
  const base = baseOf(SPIRE_X, 4);
  const top = base - SPIRE_HEIGHT;
  for (let y = top; y < base; y += 1) {
    canvas.set(SPIRE_X, y, "g");
    canvas.set(SPIRE_X + 3, y, "n");
    if ((y - top) % 5 === 0) for (let x = SPIRE_X; x <= SPIRE_X + 3; x += 1) canvas.set(x, y, "g");
  }
  for (const [index, above] of SPIRE_ARMS.entries()) {
    const y = base - above;
    for (let x = SPIRE_X + 4; x < SPIRE_X + 26; x += 1) canvas.set(x, y, "g");
    canvas.set(SPIRE_X + 25, y + 1, beaconOf(t, index * 5) ? "r" : "n");
    if (index > 0) paintPicture(canvas, FREIGHTER, SPIRE_X + 9, y + 1);
  }
  if (beaconOf(t, SPIRE_X)) canvas.set(SPIRE_X + 1, top - 1, "r");
}

/** Lights crossing between the towers: the city's own traffic, a few at a time. */
const FLYERS = [
  { y: 52, from: 96, speed: 38 },
  { y: 76, from: 300, speed: -30 },
  { y: 96, from: 120, speed: 52 },
] as const;

function paintFlyers(canvas: Canvas, t: number): void {
  for (const flyer of FLYERS) {
    const x = Math.round(flyer.from + (flyer.speed * Math.max(0, t - CLOSE_MS + 1200)) / 1000);
    if (x < 80 || x > 310) continue;
    canvas.set(x, flyer.y, "w");
    canvas.set(x - Math.sign(flyer.speed), flyer.y, frameOf(t) % 2 === 0 ? "r" : "o");
  }
}

/** The landing deck at the front of the city, where the shuttles lift off and land: its pads, and how high it stands. */
const PAD = { left: 8, right: 60 } as const;
const DECK_Y = 150;

/** A shuttle, nose up. */
const SHUTTLE: Picture = parsePicture(
  "card 5 shuttle",
  `
  __p__
  _pgp_
  _pgp_
  pgggp
  p_._p
`,
);

/**
 * The ground: grey rock, cratered, lit low from the left, its edge bright against the sky. Where
 * the rings of the city part, the streets between them show, lamps along each.
 */
function paintGround(canvas: Canvas): void {
  for (let x = 0; x < FRAME_WIDTH; x += 1) {
    const top = Math.floor(limbAt(x));
    const midStreet = Math.floor(midAt(x)) + 1;
    const nearStreet = Math.floor(nearAt(x)) + 1;
    for (let y = top; y < VISIBLE; y += 1) {
      if (y === top) {
        canvas.set(x, y, "p");
        continue;
      }
      if ((y === midStreet && x % 6 === 0) || (y === nearStreet && x % 8 === 0)) {
        canvas.set(x, y, "a");
        continue;
      }
      const crater = smoothNoise(x / 16, y / 6, 1000);
      const light = 0.5 - (y - top) * 0.008 + (crater < 0.35 ? -0.18 : 0);
      canvas.set(x, y, rungOf(ROCK_LADDER, light, x, y));
    }
  }
}

/** The landing deck: a slab on legs, its pads' edge lights blinking in turn, and a gantry over them. */
function paintDeck(canvas: Canvas, t: number): void {
  for (let x = PAD.left - 8; x < PAD.right + 8; x += 1) {
    canvas.set(x, DECK_Y, x < PAD.left + 16 ? "p" : "g");
    canvas.set(x, DECK_Y + 1, "b");
    canvas.set(x, DECK_Y + 2, "n");
  }
  // The legs, with the streets beyond showing between them.
  for (let x = PAD.left - 4; x < PAD.right + 8; x += 14) {
    for (let y = DECK_Y + 3; y < VISIBLE; y += 1) {
      canvas.set(x, y, "g");
      canvas.set(x + 1, y, "b");
      canvas.set(x + 2, y, "n");
    }
  }
  const chase = Math.floor(t / 120);
  for (let x = PAD.left; x < PAD.right; x += 6) canvas.set(x, DECK_Y - 1, (x / 6 + chase) % 4 === 0 ? "w" : "r");

  const gantry = PAD.right + 3;
  for (let y = DECK_Y - 30; y < DECK_Y; y += 1) {
    canvas.set(gantry, y, "g");
    canvas.set(gantry + 3, y, "n");
    if ((y - DECK_Y) % 6 === 0) for (let x = gantry; x <= gantry + 3; x += 1) canvas.set(x, y, "g");
  }
  for (let x = PAD.right - 14; x <= gantry + 3; x += 1) canvas.set(x, DECK_Y - 30, "g");
}

/** The shuttles: one lifting off the deck on a flame, one coming in to dock on the spire's lowest arm. */
function paintCloseShuttles(canvas: Canvas, t: number): void {
  const pad = DECK_Y - 1;
  const climb = fraction(Math.max(0, t - CLOSE_MS) / 1900);
  const rise = climb * climb * 150;
  const left = PAD.left + 22;
  const top = pad - SHUTTLE.height - Math.round(rise);
  paintPicture(canvas, SHUTTLE, left, top);
  const flame = ["Y", "o", "r"] as const;
  for (let v = 0; v < 2 + Math.floor(climb * 6); v += 1) {
    canvas.set(left + 2, top + SHUTTLE.height + v, flame[Math.min(2, Math.floor(v / 2) + (frameOf(t) % 2))]!);
  }

  const down = ease(Math.min(1, Math.max(0, t - CLOSE_MS + 700) / 2300));
  const dockX = SPIRE_X + 14;
  const dockY = baseOf(SPIRE_X, 4) - SPIRE_ARMS[0] - SHUTTLE.height;
  const x = 380 + (dockX - 380) * down;
  const y = 10 + (dockY - 10) * down;
  paintPicture(canvas, SHUTTLE, Math.round(x), Math.round(y));
  if (frameOf(t) % 2 === 0) canvas.set(Math.round(x) + 2, Math.round(y) + SHUTTLE.height, "o");
}

/**
 * Externa Prima, close: the oldest hub of the Diaspora, a city on Deimos's curved horizon too big
 * for the frame, seen from inside it, ring behind ring. Its glow behind it, and a far skyline along
 * Deimos's edge. At its heart the zaibatsu towers, each crowned in its company's colour and joined
 * by skybridges, and in the middle and far above them all, Absolute Connections' own tower, teal,
 * with the square on its face; the docking spire with its freighters. The towers rise from among
 * the city in front, and none of their feet show: a ring of palaces, terraces and domes, and nearer
 * still great glass domes, long halls and the landing deck, a shuttle lifting off it. In the sky over
 * it, Mars: mostly its night side, a thin crescent of day, its cities lit.
 */
function paintCloseUp(canvas: Canvas, t: number): void {
  paintSky(canvas, CLOSE_STARS);
  paintMarsDisc(canvas, CLOSE_MARS.x, CLOSE_MARS.y, CLOSE_MARS.radius, BEHIND_SUN, t, CITIES.length);
  paintCityGlow(canvas);
  paintGround(canvas);
  paintFarCity(canvas);
  paintBridges(canvas);
  for (const skyscraper of SKYSCRAPERS) paintSkyscraper(canvas, skyscraper, t);
  paintOurs(canvas, t);
  paintLowCity(canvas);
  paintDockingSpire(canvas, t);
  paintFlyers(canvas, t);
  for (const building of MID_RING) paintMidBuilding(canvas, building);
  paintNearRing(canvas);
  paintDeck(canvas, t);
  paintCloseShuttles(canvas, t);
}

// ═══ the jumps along the Corridor ═══

const STREAKS = Array.from({ length: 90 }, (_, index) => ({
  x: noise(index, 120) * FRAME_WIDTH,
  y: Math.floor(noise(index, 121) * VISIBLE),
  near: 0.4 + noise(index, 122) * 0.6,
}));

/** The belt's rocks, rushing past on the second jump: it lies between the two stations. */
const RUSHING_ROCKS = Array.from({ length: 9 }, (_, index) => ({
  y: 10 + noise(index, 130) * (VISIBLE - 20),
  radius: 3 + noise(index, 131) * 16,
  passes: 0.22 + index * 0.06,
}));

/**
 * A jump on along the Corridor: the shot we leave whips away to the left, the stars streak past
 * as we travel outwards, faster and then slower, and the next place whips in from the right and
 * settles. Crossing the belt, its rocks rush past too.
 */
function paintJump(
  canvas: Canvas,
  t: number,
  fromMs: number,
  toMs: number,
  leaving: (canvas: Canvas, t: number) => void,
  arriving: (canvas: Canvas, t: number) => void,
  belt: boolean,
): void {
  const progress = (t - fromMs) / (toMs - fromMs);
  const speed = Math.sin(Math.PI * progress);

  for (const streak of STREAKS) {
    const x = ((((streak.x - progress * FRAME_WIDTH * 5 * streak.near) % FRAME_WIDTH) + FRAME_WIDTH) % FRAME_WIDTH);
    const length = Math.round(1 + speed * 46 * streak.near);
    for (let step = 0; step < length; step += 1) canvas.set(x + step, streak.y, step === 0 ? "p" : streak.near > 0.75 ? "s" : "b");
  }

  if (belt) {
    for (const [index, rock] of RUSHING_ROCKS.entries()) {
      const x = FRAME_WIDTH + 30 - (progress - rock.passes) * FRAME_WIDTH * 3.4;
      if (x > -30 && x < FRAME_WIDTH + 30) paintRock(canvas, x, rock.y, rock.radius, index + 40);
    }
  }

  // The shot we leave accelerates away; the one we reach decelerates in.
  const away = progress < 0.45 ? -((progress / 0.45) ** 2) * FRAME_WIDTH : undefined;
  const into = progress > 0.55 ? (1 - (progress - 0.55) / 0.45) ** 2 * FRAME_WIDTH : undefined;
  for (const [shift, paint] of [
    [away, leaving],
    [into, arriving],
  ] as const) {
    if (shift === undefined) continue;
    const frame = offscreen(canvas.timeMs, (buffer) => paint(buffer, t));
    const dx = Math.round(shift);
    for (let y = 0; y < VISIBLE; y += 1) {
      for (let x = Math.max(0, dx); x < Math.min(FRAME_WIDTH, FRAME_WIDTH + dx); x += 1) {
        const colour = frame[y * FRAME_WIDTH + x - dx]!;
        if (colour !== ".") canvas.set(x, y, colour);
      }
    }
  }
}

// ═══ Steady Foot ═══

const FOOT_STARS = starsOf(140, 100);
export const FOOT_X = 200;
export const FOOT_Y = 84;
/** Mars's trojans round the station, drifting past, the near ones faster. */
const TROJANS = [
  { x: 304, y: 38, radius: 12 },
  { x: 336, y: 132, radius: 7 },
  { x: 92, y: 36, radius: 5 },
  { x: 258, y: 150, radius: 4 },
  { x: 140, y: 140, radius: 9 },
  { x: 362, y: 78, radius: 3 },
  { x: 28, y: 70, radius: 3 },
  { x: 118, y: 98, radius: 2 },
] as const;

/** The station's lights come on just after we arrive, with its name. */
const lightsOn = (t: number, cueMs: number) => t >= cueMs + LIGHTS_AFTER_MS;

/**
 * Steady Foot: a hub with rows of windows, a long truss, four solar wings, a dock below and a mast
 * above. Dark as we arrive; its lights come on with its name.
 */
function paintFootStation(canvas: Canvas, t: number): void {
  const lit = lightsOn(t, STEADY_FOOT_MS);
  for (let x = FOOT_X - 76; x <= FOOT_X + 76; x += 1) {
    canvas.set(x, FOOT_Y - 1, "g");
    canvas.set(x, FOOT_Y, "n");
  }
  for (const left of [FOOT_X - 72, FOOT_X - 42, FOOT_X + 14, FOOT_X + 44]) {
    for (let y = FOOT_Y - 12; y <= FOOT_Y + 11; y += 1) {
      if (y === FOOT_Y - 1 || y === FOOT_Y) continue;
      for (let x = left; x < left + 28; x += 1) {
        const edge = x === left || x === left + 27 || y === FOOT_Y - 12 || y === FOOT_Y + 11;
        const cell = (x - left) % 4 === 0 || (y - FOOT_Y) % 4 === 0;
        canvas.set(x, y, edge ? "g" : cell ? "n" : noise(x, y) < 0.04 ? "p" : "b");
      }
    }
  }
  for (let y = FOOT_Y - 22; y <= FOOT_Y + 20; y += 1) {
    for (let x = FOOT_X - 8; x <= FOOT_X + 8; x += 1) {
      const sunlit = x < FOOT_X - 4;
      const window = lit && (y - FOOT_Y) % 4 === 0 && (x - FOOT_X) % 3 === 0 && x > FOOT_X - 6 && x < FOOT_X + 7;
      canvas.set(x, y, window ? (noise(x, y) < 0.2 ? "Y" : "a") : sunlit ? "g" : x === FOOT_X + 8 ? "b" : "n");
    }
  }
  for (let y = FOOT_Y + 21; y <= FOOT_Y + 26; y += 1) for (let x = FOOT_X - 3; x <= FOOT_X + 3; x += 1) canvas.set(x, y, x < FOOT_X ? "g" : "n");
  for (let y = FOOT_Y - 36; y < FOOT_Y - 22; y += 1) canvas.set(FOOT_X, y, "g");
  if (lit && beaconLit(t)) {
    canvas.set(FOOT_X, FOOT_Y - 37, "r");
    canvas.set(FOOT_X - 76, FOOT_Y - 1, "w");
    canvas.set(FOOT_X + 76, FOOT_Y - 1, "w");
  }
  if (lit && beaconLit(t + 225)) canvas.set(FOOT_X, FOOT_Y + 27, "r");
  if (t >= STEADY_FOOT_MS && t < STEADY_FOOT_MS + LIGHTS_AFTER_MS + SPARK_FRAMES * FRAME_MS && lightsOn(t, STEADY_FOOT_MS)) {
    paintSpark(canvas, FOOT_X, FOOT_Y - 37);
  }
}

function paintSpark(canvas: Canvas, x: number, y: number): void {
  for (const [u, v] of [[0, -3], [0, 3], [-4, 0], [4, 0], [-2, -2], [2, 2], [2, -2], [-2, 2]] as const) canvas.set(x + u, y + v, "Y");
}

/** Steady Foot among Mars's trojans, Mars small behind us with Deimos beside it. */
function paintSteadyFoot(canvas: Canvas, t: number): void {
  const drift = (t - STEADY_FOOT_MS) / 1000;
  paintSky(canvas, FOOT_STARS);
  paintMarsDisc(canvas, 50, 128, 10, SUN, t, CITIES.length);
  canvas.set(66, 119, "g");
  for (const [index, rock] of TROJANS.entries()) paintRock(canvas, rock.x - drift * rock.radius * 0.6, rock.y, rock.radius, index + 10);
  paintFootStation(canvas, t);
}

// ═══ Steady Hand ═══

const HAND_STARS = starsOf(160, 100);
export const HAND_X = 196;
export const HAND_Y = 90;
const RING_RX = 72;
const RING_RY = 20;
/** The ring turns: its lit windows run round it. */
const RING_TURN_MS = 9000;

/** The belt, behind us now: a band of rocks and dust across the left of the sky. */
const BELT_BEHIND = Array.from({ length: 320 }, (_, index) => {
  const v = noise(index, 170);
  const spread = noise(index, 171);
  return {
    x: 6 + spread * spread * 96 + (1 - v) * 40,
    y: v * VISIBLE,
    colour: noise(index, 172) < 0.3 ? ("g" as const) : noise(index, 173) < 0.5 ? ("d" as const) : ("b" as const),
    rock: noise(index, 174) < 0.04,
  };
});

/**
 * Steady Hand: a ring round a hub on a long spine, the ring turning. The back of the ring passes
 * behind the hub and the front before it. Dark as we arrive; its lights come on with its name.
 */
function paintHandStation(canvas: Canvas, t: number): void {
  const lit = lightsOn(t, STEADY_HAND_MS);
  const turn = (t / RING_TURN_MS) * 2 * Math.PI;

  const ring = (front: boolean) => {
    for (let step = 0; step < 900; step += 1) {
      const angle = (step / 900) * 2 * Math.PI;
      if (Math.sin(angle) > 0 !== front) continue;
      const x = HAND_X + RING_RX * Math.cos(angle);
      const y = HAND_Y + RING_RY * Math.sin(angle);
      const window = lit && fraction((angle + turn) / (2 * Math.PI) * 24) < 0.35;
      for (let w = -2; w <= 2; w += 1) {
        const colour = w === -2 ? "g" : w === 2 ? "n" : window && w === 0 ? "a" : Math.cos(angle) < 0 ? "g" : "b";
        canvas.set(x, y + w, colour);
      }
    }
  };
  const spokes = (front: boolean) => {
    for (let spoke = 0; spoke < 4; spoke += 1) {
      const angle = turn + (spoke * Math.PI) / 2;
      if (Math.sin(angle) > 0 !== front) continue;
      for (let step = 0; step <= 60; step += 1) {
        canvas.set(HAND_X + RING_RX * Math.cos(angle) * (step / 60), HAND_Y + RING_RY * Math.sin(angle) * (step / 60), "n");
      }
    }
  };

  ring(false);
  spokes(false);
  for (let y = HAND_Y - 38; y <= HAND_Y + 34; y += 1) {
    canvas.set(HAND_X - 1, y, "g");
    canvas.set(HAND_X, y, "n");
  }
  for (let y = HAND_Y - 9; y <= HAND_Y + 9; y += 1) {
    for (let x = HAND_X - 9; x <= HAND_X + 9; x += 1) {
      const dx = (x + 0.5 - HAND_X) / 9;
      const dy = (y + 0.5 - HAND_Y) / 9;
      if (dx * dx + dy * dy > 1) continue;
      const window = lit && (y - HAND_Y) % 3 === 0 && (x - HAND_X) % 2 === 0 && dx > -0.5;
      canvas.set(x, y, window ? "a" : rungOf(ROCK_LADDER, Math.max(AMBIENT, sunlight(dx, dy, Math.sqrt(1 - dx * dx - dy * dy))), x, y));
    }
  }
  spokes(true);
  ring(true);
  if (lit && beaconLit(t)) {
    canvas.set(HAND_X, HAND_Y - 39, "r");
    canvas.set(HAND_X, HAND_Y + 35, "r");
  }
  if (t < STEADY_HAND_MS + LIGHTS_AFTER_MS + SPARK_FRAMES * FRAME_MS && lit) paintSpark(canvas, HAND_X, HAND_Y - 39);
}

/** Jupiter ahead of Steady Hand: far off, so the pull-out barely changes it (`paintPull`). */
const HAND_JUPITER = { x: 336, y: 44, radius: 15 } as const;

/**
 * Steady Hand, the first station beyond the belt, the belt behind us and Jupiter ahead. The
 * pull-out paints Jupiter itself: it must not shrink away with the station.
 */
function paintSteadyHand(canvas: Canvas, t: number, withJupiter = true): void {
  paintSky(canvas, HAND_STARS);
  for (const [index, speck] of BELT_BEHIND.entries()) {
    if (speck.rock) paintRock(canvas, speck.x, speck.y, 2 + noise(index, 175) * 2, index + 60);
    else canvas.set(speck.x, speck.y, speck.colour);
  }
  if (withJupiter) paintJupiter(canvas, HAND_JUPITER.x, HAND_JUPITER.y, HAND_JUPITER.radius);
  paintHandStation(canvas, t);
}

// ═══ the Corridor ═══

const MAP_STARS = starsOf(180, 110);
/** The Sun, at the left edge; Mars; the belt round the Sun; Jupiter at the right. */
const SUN_X = -26;
const SUN_Y = 90;
const SUN_RADIUS = 34;
const MAP_MARS = { x: 70, y: 104 } as const;
export const MAP_JUPITER = { x: 352, y: 64, radius: 11 } as const;
const BELT_RADIUS = 206;
const BELT_WIDTH = 26;

const MAP_BELT = Array.from({ length: 360 }, (_, index) => {
  const angle = (noise(index, 190) - 0.5) * 1.3;
  const r = BELT_RADIUS + (noise(index, 191) - 0.5) * BELT_WIDTH + (noise(index, 192) - 0.5) * 8;
  return { x: SUN_X + r * Math.cos(angle), y: SUN_Y + r * Math.sin(angle), colour: noise(index, 193) < 0.35 ? ("g" as const) : ("d" as const) };
});

/**
 * The Corridor, from just past Mars to just short of Jupiter: points every few pixels along a
 * gentle arc, the way the line ran on the Plan.
 */
export const MAP_STATIONS: readonly (readonly [number, number])[] = (() => {
  const [x0, y0, x1, y1, x2, y2] = [MAP_MARS.x + 6, MAP_MARS.y - 3, 212, 40, MAP_JUPITER.x - 14, MAP_JUPITER.y + 2];
  const curve = (s: number) => [(1 - s) ** 2 * x0 + 2 * (1 - s) * s * x1 + s * s * x2, (1 - s) ** 2 * y0 + 2 * (1 - s) * s * y1 + s * s * y2] as const;
  const points: (readonly [number, number])[] = [curve(0)];
  let travelled = 0;
  let previous = curve(0);
  for (let step = 1; step <= 2000; step += 1) {
    const point = curve(step / 2000);
    travelled += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    previous = point;
    if (travelled >= MAP_STATION_GAP) {
      points.push(point);
      travelled = 0;
    }
  }
  return points;
})();
/** Steady Foot, among Mars's trojans: the first out from Mars. Steady Hand: the first past the belt. */
export const MAP_STEADY_FOOT = 0;
export const MAP_STEADY_HAND = MAP_STATIONS.findIndex(([x, y]) => Math.hypot(x - SUN_X, y - SUN_Y) > BELT_RADIUS + BELT_WIDTH / 2 + 4);

function paintSun(canvas: Canvas): void {
  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < SUN_X + SUN_RADIUS + 20; x += 1) {
      const d = Math.hypot(x + 0.5 - SUN_X, y + 0.5 - SUN_Y);
      if (d < SUN_RADIUS - 2) canvas.set(x, y, d < SUN_RADIUS - 8 ? "w" : "y");
      else if (d < SUN_RADIUS + 0.5) canvas.set(x, y, FLICKER[Math.floor(noise(x, y) * FLICKER.length)]!);
      else if (d < SUN_RADIUS + 16 && ditherAt(x, y) < (1 - (d - SUN_RADIUS) / 16) * 0.6) canvas.set(x, y, d < SUN_RADIUS + 6 ? "o" : "m");
    }
  }
}

/** A named station on the map: a lit cross, brighter than the dots. */
function paintMapNamed(canvas: Canvas, x: number, y: number): void {
  for (const [u, v] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) canvas.set(x + u, y + v, "p");
  canvas.set(x, y, "w");
}

/**
 * The Corridor across the dark: the Sun at the edge, Mars, the belt round the Sun, Jupiter, and
 * between them the line of stations. Steady Foot and Steady Hand are lit already; on "A corridor
 * of light" every other station comes on in turn, from Mars out, and a pulse runs along them.
 */
function paintCorridor(canvas: Canvas, t: number, withJupiter = true): void {
  paintSky(canvas, MAP_STARS);
  paintSun(canvas);
  for (const speck of MAP_BELT) canvas.set(speck.x, speck.y, speck.colour);
  paintMarsDisc(canvas, MAP_MARS.x, MAP_MARS.y, 4, SUN, t, 0);
  canvas.set(MAP_MARS.x + 6, MAP_MARS.y - 5, "g");
  if (withJupiter) paintJupiter(canvas, MAP_JUPITER.x, MAP_JUPITER.y, MAP_JUPITER.radius);

  const corridorFrom = CORRIDOR_MS + MAP_STATIONS.length * CORRIDOR_STEP_MS;
  const pulse = t >= corridorFrom ? fraction((t - corridorFrom) / PULSE_MS) * (MAP_STATIONS.length + 3) - 1 : -10;

  MAP_STATIONS.forEach(([sx, sy], index) => {
    const [x, y] = [Math.round(sx), Math.round(sy)];
    if (index === MAP_STEADY_FOOT || index === MAP_STEADY_HAND) {
      paintMapNamed(canvas, x, y);
      return;
    }
    if (t < CORRIDOR_MS + index * CORRIDOR_STEP_MS) canvas.set(x, y, "b");
    else canvas.set(x, y, Math.abs(index - pulse) < 1 ? "w" : "y");
  });

  // Between lit stations, once the corridor is lit, the light carries across: a dot halfway.
  for (let index = 1; index < MAP_STATIONS.length; index += 1) {
    if (t < CORRIDOR_MS + index * CORRIDOR_STEP_MS) break;
    const [ax, ay] = MAP_STATIONS[index - 1]!;
    const [bx, by] = MAP_STATIONS[index]!;
    canvas.set(Math.round((ax + bx) / 2), Math.round((ay + by) / 2), Math.abs(index - 0.5 - pulse) < 1 ? "y" : "a");
  }
}

/**
 * The pull-out from Steady Hand to the map: the close shot shrinks away into the station's own dot
 * on the Corridor, the map already round it. Jupiter does not shrink with it. Far off, it barely
 * changes as the camera pulls back, and glides the short way from where it hung ahead of the
 * station to its place on the map.
 */
const PULL_TO_SCALE = 0.03;

const pullProgress = (t: number) => (t - PULL_FROM_MS) / (CORRIDOR_FROM_MS - PULL_FROM_MS);

/** Where Jupiter is at `t` during the pull-out. */
export function pullingJupiter(t: number): { readonly x: number; readonly y: number; readonly radius: number } {
  const glide = (from: number, to: number) => from + (to - from) * ease(pullProgress(t));
  return {
    x: glide(HAND_JUPITER.x, MAP_JUPITER.x),
    y: glide(HAND_JUPITER.y, MAP_JUPITER.y),
    radius: glide(HAND_JUPITER.radius, MAP_JUPITER.radius),
  };
}

function paintPull(canvas: Canvas, t: number): void {
  const progress = pullProgress(t);
  paintCorridor(canvas, t, false);
  const scale = PULL_TO_SCALE ** progress;
  const [mapX, mapY] = MAP_STATIONS[MAP_STEADY_HAND]!;
  const anchorX = HAND_X + (mapX - HAND_X) * ease(progress);
  const anchorY = HAND_Y + (mapY - HAND_Y) * ease(progress);
  const hand = offscreen(canvas.timeMs, (buffer) => paintSteadyHand(buffer, t, false));

  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const u = HAND_X + (x + 0.5 - anchorX) / scale;
      const v = HAND_Y + (y + 0.5 - anchorY) / scale;
      if (u < 0 || v < 0 || u >= FRAME_WIDTH || v >= VISIBLE) continue;
      canvas.set(x, y, pick(hand, u, v));
    }
  }

  const jupiter = pullingJupiter(t);
  paintJupiter(canvas, jupiter.x, jupiter.y, jupiter.radius);
}

// ═══ the card ═══

/** The wide shot: the zoom from the Plan, then Mars and Deimos, Externa lighting up. */
function paintWide(canvas: Canvas, t: number): void {
  const camera = cameraAt(t);

  paintPlan(canvas, camera);
  paintStars(canvas, camera);
  if (camera.scale > CRISP_FROM && t < ZOOM_MS) paintOrbits(canvas, camera);
  paintMars(canvas, camera, t);
  paintDeimos(canvas, camera, t);
  paintShuttles(canvas, t);
}

/** The whole card at `t` on its own clock: one shot after another, joined by their transitions. */
function paintCard(canvas: Canvas, t: number): void {
  if (t < PUSH_FROM_MS) paintWide(canvas, t);
  else if (t < CLOSE_MS) paintPush(canvas, t);
  else if (t < JUMP_TO_FOOT_MS) paintCloseUp(canvas, t);
  else if (t < STEADY_FOOT_MS) paintJump(canvas, t, JUMP_TO_FOOT_MS, STEADY_FOOT_MS, paintCloseUp, paintSteadyFoot, false);
  else if (t < JUMP_TO_HAND_MS) paintSteadyFoot(canvas, t);
  else if (t < STEADY_HAND_MS) paintJump(canvas, t, JUMP_TO_HAND_MS, STEADY_HAND_MS, paintSteadyFoot, paintSteadyHand, true);
  else if (t < PULL_FROM_MS) paintSteadyHand(canvas, t);
  else if (t < CORRIDOR_FROM_MS) paintPull(canvas, t);
  else paintCorridor(canvas, t);
}

// ═══ the scenes ═══

/**
 * The card from `fromMs` on, painted on the card's own clock. It is one shot after another, split
 * into scenes at its beats so that under reduced motion each beat is a still of its own.
 */
function beat(fromMs: number): Scene {
  return { fromMs, layers: [{ kind: "painted", paint: (canvas) => paintCard(canvas, canvas.timeMs + fromMs) }] };
}

/** Each beat's still is the moment it has finished: Externa lit, a station's lights on. */
export const EXTERNA_LIT_MS = EXTERNA_MS + EXTERNA_LIGHTING_MS;
export const STEADY_FOOT_LIT_MS = STEADY_FOOT_MS + LIGHTS_AFTER_MS + SPARK_FRAMES * FRAME_MS;
export const STEADY_HAND_LIT_MS = STEADY_HAND_MS + LIGHTS_AFTER_MS + SPARK_FRAMES * FRAME_MS;
export const CORRIDOR_LIT_MS = CORRIDOR_MS + MAP_STATIONS.length * CORRIDOR_STEP_MS;

/**
 * Under reduced motion: card 4's Plan, then Mars and Deimos, Externa lit, Externa close, each
 * station lit, the Corridor dark and then lit.
 */
export const CARD_05_ART: CardArt = {
  scenes: [
    beat(0),
    beat(ZOOM_MS),
    beat(EXTERNA_LIT_MS),
    beat(CLOSE_MS),
    beat(STEADY_FOOT_LIT_MS),
    beat(STEADY_HAND_LIT_MS),
    beat(CORRIDOR_FROM_MS),
    beat(CORRIDOR_LIT_MS),
  ],
};
