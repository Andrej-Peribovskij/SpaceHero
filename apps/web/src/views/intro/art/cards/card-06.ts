import { FRAME_WIDTH } from "../grid";
import { VISIBLE, clamp01, cueOn, ease, fraction, lastFrameOf, noise, rungOf, smoothNoise } from "../paint";
import { STEPS_TO_BLACK, darker, type CycleChar, type PaletteChar } from "../palette";
import { ditherAt, type Canvas, type CardArt, type Scene } from "../render";
import { CARD_05_ART, MAP_JUPITER } from "./card-05";

/**
 * Card 6: Jupiter and its moons.
 *
 * Script: "Jupiter. Its moons light up one by one. One stays dark." It opens on card 5's last
 * frame, the Corridor across the dark, and dives into Jupiter's dot on it: the map blows up and
 * sinks into black, the planet swells, and the camera falls on into the Great Red Spot until the
 * storm fills the screen, turning. Then it pulls back out, and Jupiter is a giant behind
 * everything, its bands flowing past one another and the spot turning between them, with four
 * moons dark in front of it. The caption waits for all of that.
 *
 * On each name the Corridor's dotted line, coming in from the left where card 5 left it, lights up
 * to that moon, and the moon's night side lights city by city, a station circling it: Callisto,
 * Europa, Io. No line runs to Ganymede, the largest of them, dark against the planet. On the
 * Ganymede line the screen glitches (tasks.md 2.10) and the video carries on as if nothing had
 * happened, Ganymede still there and still dark.
 *
 * The corporate touch is none: the moons are achievement, told straight. What it hides is Ganymede.
 *
 * The scenery is code (design.md §11); the numbers worth tweaking are named below.
 */

/** When the first letter of `words` appears, on the card's clock: the beats follow the caption. */
const cue = cueOn(6);

// ── timings, on the card's clock ──
/** The dive from card 5's map into Jupiter's spot, until the storm fills the screen. */
export const DIVE_MS = 1000;
/** Card 5's map sinks into black between these two points of the dive. */
const MAP_SINKS = [0.15, 0.7] as const;
/** Inside the storm, turning, before the camera pulls back out. */
export const PULL_FROM_MS = DIVE_MS + 450;
/** The pull-out ends on the whole picture: Jupiter behind, the moons dark. The caption waits for it. */
export const REVEALED_MS = PULL_FROM_MS + 850;
/** Each moon's name: the line lights up to it, a dot every step, and then its cities come on. */
export const CALLISTO_MS = cue("Callisto");
export const EUROPA_MS = cue("Europa");
export const IO_MS = cue("Io");
export const GANYMEDE_MS = cue("Ganymede");
const DOT_STEP_MS = 28;
const CITIES_LIGHTING_MS = 360;
/** As a moon comes on, a ring of light spreads out from it for this long. */
const RING_MS = 420;
/** Once the line reaches Io, a pulse runs along it, again and again. */
const PULSE_MS = 1100;

// ── the picture ──
/** Jupiter, a giant behind everything: its middle is above the frame, and to the right. */
export const JUPITER_X = 282;
export const JUPITER_Y = 36;
export const JUPITER_RADIUS = 172;
/** The Great Red Spot, where it sits on the face we see: south of the equator, left of the middle. */
const SPOT_LONGITUDE = -0.5;
const SPOT_LATITUDE = (-19.5 * Math.PI) / 180;
const SPOT_HALF_WIDTH = 0.22;
const SPOT_HALF_HEIGHT = 0.1;
/**
 * The storm rolls between the bands it sits on, clockwise as seen: its top goes the way the dark
 * belt above flows and its bottom the way the pale zone below does, its rim about as fast as
 * they. Its middle turns faster than its rim.
 */
const SPOT_SPIN = 0.5;

interface Moon {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export const CALLISTO: Moon = { name: "Callisto", x: 44, y: 46, radius: 15 };
export const EUROPA: Moon = { name: "Europa", x: 84, y: 114, radius: 12 };
export const IO: Moon = { name: "Io", x: 134, y: 156, radius: 11 };
export const GANYMEDE: Moon = { name: "Ganymede", x: 176, y: 52, radius: 18 };

/** The faint light night sides still show, so their shapes read against the stars. */
const AMBIENT = 0.07;

/** A direction as a unit vector: x across the screen, y down it, z towards us. */
function unit(x: number, y: number, z: number): readonly [number, number, number] {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/** Towards the Sun: off to the left, as on card 5's map, a little up and towards us. */
const SUN = unit(-0.88, -0.22, 0.25);
/**
 * The moons, in front, are seen more side-on to the Sun than the planet behind them: a licence, so
 * that their night sides are wide enough for their towns to show.
 */
const MOON_SUN = unit(-0.97, -0.2, 0.02);
const sunlight = (nx: number, ny: number, nz: number, sun = SUN) => nx * sun[0] + ny * sun[1] + nz * sun[2];

const TWINKLE: readonly CycleChar[] = ["1", "2", "3", "4", "5", "6"];

// ═══ the camera ═══

/**
 * The card's picture is laid out once, as the final shot shows it; the camera only magnifies it
 * about a point. `focus` is the point of the final shot the camera looks at, and `anchor` where
 * on the screen it puts it.
 */
interface Camera {
  readonly zoom: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

/** The spot's middle, in the final shot: the point the whole camera move turns on. */
const SPOT_X = JUPITER_X + JUPITER_RADIUS * Math.cos(SPOT_LATITUDE) * Math.sin(SPOT_LONGITUDE);
const SPOT_Y = JUPITER_Y - JUPITER_RADIUS * Math.sin(SPOT_LATITUDE);

/** At the start, Jupiter is card 5's Jupiter: the same size, in the same place. */
const START_ZOOM = MAP_JUPITER.radius / JUPITER_RADIUS;
const START_X = MAP_JUPITER.x + (SPOT_X - JUPITER_X) * START_ZOOM;
const START_Y = MAP_JUPITER.y + (SPOT_Y - JUPITER_Y) * START_ZOOM;
/** In the storm: the spot magnified until it overflows the frame on every side. */
const STORM_ZOOM = 7.5;
const STORM_CREEP = 1.18;
/** Jupiter is painted afresh once the dive has magnified it this much: a crisp planet, not card 5's pixels. */
const CRISP_FROM = 1.4;
const MIDDLE_X = FRAME_WIDTH / 2;
const MIDDLE_Y = VISIBLE / 2;

const lerp = (from: number, to: number, p: number) => from + (to - from) * p;
/** Zooming reads as moving in when it magnifies by the same factor every frame: lerp the logarithm. */
const zoomBetween = (from: number, to: number, p: number) => Math.exp(lerp(Math.log(from), Math.log(to), p));

export function cameraAt(t: number): Camera {
  if (t < DIVE_MS) {
    const p = ease(t / DIVE_MS);
    // The anchor heads for the middle faster than the zoom grows, so the spot is centred before it fills the screen.
    const centring = ease(Math.min(1, (t / DIVE_MS) * 1.4));
    return { zoom: zoomBetween(START_ZOOM, STORM_ZOOM, p), anchorX: lerp(START_X, MIDDLE_X, centring), anchorY: lerp(START_Y, MIDDLE_Y, centring) };
  }
  if (t < PULL_FROM_MS) {
    const p = (t - DIVE_MS) / (PULL_FROM_MS - DIVE_MS);
    return { zoom: zoomBetween(STORM_ZOOM, STORM_ZOOM * STORM_CREEP, p), anchorX: MIDDLE_X, anchorY: MIDDLE_Y };
  }
  if (t < REVEALED_MS) {
    const p = ease((t - PULL_FROM_MS) / (REVEALED_MS - PULL_FROM_MS));
    return { zoom: zoomBetween(STORM_ZOOM * STORM_CREEP, 1, p), anchorX: lerp(MIDDLE_X, SPOT_X, p), anchorY: lerp(MIDDLE_Y, SPOT_Y, p) };
  }
  return { zoom: 1, anchorX: SPOT_X, anchorY: SPOT_Y };
}

/** A point of the final shot, where the camera shows it now. */
function view(camera: Camera, x: number, y: number): readonly [number, number] {
  return [camera.anchorX + (x - SPOT_X) * camera.zoom, camera.anchorY + (y - SPOT_Y) * camera.zoom];
}

// ═══ card 5's map, sinking ═══

const card5Frame = () => lastFrameOf(5, CARD_05_ART);

/** Card 5's last frame, magnified pixel by pixel about Jupiter and sinking into black as it grows. */
function paintMap(canvas: Canvas, camera: Camera, t: number): void {
  const progress = t / DIVE_MS;
  const sink = clamp01((progress - MAP_SINKS[0]) / (MAP_SINKS[1] - MAP_SINKS[0])) * STEPS_TO_BLACK;
  if (sink >= STEPS_TO_BLACK) return;
  const frame = card5Frame();
  const [jupiterX, jupiterY] = view(camera, JUPITER_X, JUPITER_Y);
  const scale = camera.zoom / START_ZOOM;

  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const u = Math.floor(MAP_JUPITER.x + (x + 0.5 - jupiterX) / scale);
      const v = Math.floor(MAP_JUPITER.y + (y + 0.5 - jupiterY) / scale);
      if (u < 0 || v < 0 || u >= FRAME_WIDTH || v >= VISIBLE) continue;
      const colour = darker(frame[v * FRAME_WIDTH + u]!, Math.floor(sink + ditherAt(x, y)));
      if (colour !== ".") canvas.set(x, y, colour);
    }
  }
}

// ═══ space ═══

/** The stars, coming out as the camera pulls back out of the storm. */
const STARS = Array.from({ length: 110 }, (_, index) => ({
  x: Math.floor(noise(index, 200) * FRAME_WIDTH),
  y: Math.floor(noise(index, 201) * VISIBLE),
  appears: 0.3 + noise(index, 202) * 0.65,
  pixel: noise(index, 203) < 0.4 ? TWINKLE[index % TWINKLE.length]! : noise(index, 204) < 0.5 ? ("b" as const) : ("n" as const),
}));

function paintStars(canvas: Canvas, t: number): void {
  const shown = t < PULL_FROM_MS ? 0 : clamp01((t - PULL_FROM_MS) / (REVEALED_MS - PULL_FROM_MS));
  for (const star of STARS) if (star.appears < shown) canvas.set(star.x, star.y, star.pixel);
}

// ═══ Jupiter ═══

/** Jupiter's colours, from the dark up: its night side, the brown belts, the cream zones. */
const JUPITER_LADDER: readonly PaletteChar[] = [".", "d", "m", "o", "a", "y", "w"];
/** The spot: salmon and rust, a shade redder than the cloud round it, into which it blends. */
const SPOT_LADDER: readonly PaletteChar[] = [".", "d", "m", "r", "o", "a", "y"];
/** The pale hollow the dark belt bends into round the spot: as pale as the zone below it. */
const HOLLOW_TONE = 0.95;

interface Band {
  /** Its southern edge, in degrees of latitude: it runs from here to the next band's edge. */
  readonly from: number;
  /** How pale it is: zones are pale, belts dark. */
  readonly tone: number;
  /** How fast it flows across the face, in radians a second: neighbours flow opposite ways. */
  readonly flow: number;
}

const BANDS: readonly Band[] = [
  { from: -90, tone: 0.55, flow: 0 },
  { from: -48, tone: 0.8, flow: 0.03 },
  { from: -36, tone: 0.58, flow: -0.045 },
  { from: -28, tone: 0.95, flow: 0.04 },
  // The south equatorial belt: the spot sits on its southern edge, half in it, half in the zone below.
  { from: -18, tone: 0.56, flow: -0.06 },
  { from: -8, tone: 0.98, flow: 0.05 },
  { from: 7, tone: 0.5, flow: -0.06 },
  { from: 17, tone: 0.92, flow: 0.045 },
  { from: 25, tone: 0.6, flow: -0.04 },
  { from: 36, tone: 0.82, flow: 0.03 },
  { from: 52, tone: 0.6, flow: 0 },
];

function bandAt(degrees: number): Band {
  let band = BANDS[0]!;
  for (const candidate of BANDS) if (candidate.from <= degrees) band = candidate;
  return band;
}

/** Small white storms strung along the south temperate belt, drifting with it. */
const PEARLS = Array.from({ length: 5 }, (_, index) => ({ longitude: -1.3 + index * 0.6 + noise(index, 210) * 0.2, size: 0.016 + noise(index, 211) * 0.01 }));
const PEARL_LATITUDE = (-32 * Math.PI) / 180;
const PEARL_REACH = 0.03;
const PEARL_FLOW = bandAt(-32).flow;

/**
 * The spot's cloud, looked up rather than worked out: its noise depends only on how far round the
 * spot and how far out a point is, so it is tabulated once, finer than any pixel of the dive.
 */
const SPOT_STEPS = 2048;
const SPOT_RINGS = 256;
let spotTables: { readonly wander: Float32Array; readonly streak: Float32Array } | undefined;

function spotNoise() {
  if (spotTables) return spotTables;
  const wander = new Float32Array(SPOT_STEPS);
  const streak = new Float32Array(SPOT_STEPS * SPOT_RINGS);
  for (let step = 0; step < SPOT_STEPS; step += 1) {
    const around = (step + 0.5) / SPOT_STEPS;
    wander[step] = smoothNoise(around * 10, 40, 10);
    for (let ring = 0; ring < SPOT_RINGS; ring += 1) streak[step * SPOT_RINGS + ring] = smoothNoise(around * 24, ((ring + 0.5) / SPOT_RINGS) * 16, 24);
  }
  spotTables = { wander, streak };
  return spotTables;
}

/**
 * The tone of the spot at a point of it, or undefined outside it. `along` and `across` are the
 * point's offset from the spot's middle, in units of its half width and half height.
 *
 * Seen from afar it is no spiral but an oval of rings: a darker red rim, a salmon body, a paler
 * ring and a darker heart. What shows that it turns is its cloud: streaks drawn round the rings,
 * carried round with them, the middle faster than the rim — plain from close up, a quiet shimmer
 * from afar.
 */
function spotTone(along: number, across: number, t: number): number | undefined {
  const reach = Math.hypot(along, across);
  if (reach > 1) return undefined;

  const turn = -SPOT_SPIN * (t / 1000) * (1.5 - reach);
  const around = fraction((Math.atan2(across, along) - turn) / (2 * Math.PI));
  // The rings are not perfect: their edges wander, a little, as the cloud turns.
  const wander = (spotNoise().wander[Math.floor(around * SPOT_STEPS)]! - 0.5) * 0.12;
  const ring = reach + wander;
  const streak = spotNoise().streak[Math.floor(around * SPOT_STEPS) * SPOT_RINGS + Math.min(SPOT_RINGS - 1, Math.floor(reach * SPOT_RINGS))]! - 0.5;
  const tone = ring > 0.84 ? 0.86 : ring > 0.55 ? 1.02 : ring > 0.24 ? 1.16 : 0.94;
  return tone + streak * 0.22;
}

/**
 * The spot's wake and hollow: how much the band round a point of Jupiter is stirred, and how
 * much it is paled, by the storm. The dark belt above the spot bends round it in a pale hollow,
 * and to its left, where the belt's cloud has passed it, it breaks up into a turbulent wake.
 */
function stormAround(along: number, across: number): { readonly hollow: number; readonly wake: number } {
  const reach = Math.hypot(along, across);
  const hollow = clamp01((1.5 - reach) / 0.5);
  const behind = clamp01(-along / 1.2 - 0.6) * clamp01(1 - Math.abs(-along / 4.5 - 0.55));
  const wake = behind * clamp01(1 - Math.abs(across - 0.9) / 1.4);
  return { hollow, wake };
}

/**
 * Jupiter: a lit sphere, banded, the bands' edges ragged with turbulence and flowing past one
 * another, the Great Red Spot between a dark belt and a pale zone. Its look comes from where on the sphere a pixel
 * falls rather than from the pixel, so it stays crisp however close the camera comes.
 */
/** What a pixel of Jupiter is, wherever the camera is: off the disc, the haze off its limb, or the disc. */
const OFF = 0;
const HAZE = 1;
const DISC = 2;

/** The buffers are made once, the size of the screen, and refilled whenever the camera moves. */
const SCREEN_PIXELS = FRAME_WIDTH * VISIBLE;
const geometry = {
  key: "",
  left: 0,
  top: 0,
  width: 0,
  size: 0,
  kind: new Uint8Array(SCREEN_PIXELS),
  light: new Float64Array(SCREEN_PIXELS),
  latitude: new Float64Array(SCREEN_PIXELS),
  longitude: new Float64Array(SCREEN_PIXELS),
  plainFlow: new Float64Array(SCREEN_PIXELS),
  hollow: new Float64Array(SCREEN_PIXELS),
  wake: new Float64Array(SCREEN_PIXELS),
};

/**
 * Where each pixel falls on Jupiter for a camera position: its light, latitude and longitude, the
 * band it lies in and how much the storm stirs it. None of it moves with time, so it is worked out
 * once for as long as the camera holds still — all the card after the dive — rather than every frame.
 */
function sphereGeometry(cx: number, cy: number, radius: number): typeof geometry {
  const key = `${cx},${cy},${radius}`;
  if (geometry.key === key) return geometry;

  const left = Math.max(0, Math.floor(cx - radius - 2));
  const top = Math.max(0, Math.floor(cy - radius - 2));
  const width = Math.max(0, Math.ceil(Math.min(FRAME_WIDTH, cx + radius + 2)) - left);
  const height = Math.max(0, Math.ceil(Math.min(VISIBLE, cy + radius + 2)) - top);
  const built = Object.assign(geometry, { key, left, top, width, size: width * height });
  built.kind.fill(OFF, 0, built.size);

  for (let y = top; y < top + height; y += 1) {
    if (y >= cy + radius + 2) break;
    const dy = (y + 0.5 - cy) / radius;
    // Latitude and the plain band depend on the row alone.
    const latitude = Math.abs(dy) <= 1 ? Math.asin(-dy) : 0;
    const plainFlow = bandAt((latitude * 180) / Math.PI).flow;
    for (let x = left; x < left + width; x += 1) {
      if (x >= cx + radius + 2) break;
      const at = (y - top) * width + (x - left);
      const dx = (x + 0.5 - cx) / radius;
      const squared = dx * dx + dy * dy;

      if (squared > 1) {
        // A thin haze off the sunlit limb.
        const off = (Math.sqrt(squared) - 1) * radius;
        if (off < 1.5 && dx * SUN[0] + dy * SUN[1] > 0.2 && ditherAt(x, y) < 0.5 - off * 0.3) built.kind[at] = HAZE;
        continue;
      }

      const dz = Math.sqrt(1 - squared);
      const longitude = Math.atan2(dx, dz);
      const { hollow, wake } = stormAround((longitude - SPOT_LONGITUDE) / SPOT_HALF_WIDTH, (latitude - SPOT_LATITUDE) / SPOT_HALF_HEIGHT);
      built.kind[at] = DISC;
      // Lit by the Sun, and darker towards the limb, as a cloudy planet is.
      built.light[at] = Math.max(AMBIENT, sunlight(dx, dy, dz)) * (0.6 + 0.4 * dz);
      built.latitude[at] = latitude;
      built.longitude[at] = longitude;
      built.plainFlow[at] = plainFlow;
      built.hollow[at] = hollow;
      built.wake[at] = wake;
    }
  }

  return built;
}

function paintJupiter(canvas: Canvas, camera: Camera, t: number): void {
  const [cx, cy] = view(camera, JUPITER_X, JUPITER_Y);
  const radius = JUPITER_RADIUS * camera.zoom;
  const seconds = t / 1000;
  const sphere = sphereGeometry(cx, cy, radius);

  for (let at = 0; at < sphere.size; at += 1) {
    const kind = sphere.kind[at]!;
    if (kind === OFF) continue;
    const x = sphere.left + (at % sphere.width);
    const y = sphere.top + Math.floor(at / sphere.width);
    if (kind === HAZE) {
      canvas.set(x, y, "m");
      continue;
    }

    const light = sphere.light[at]!;
    const latitude = sphere.latitude[at]!;
    const longitude = sphere.longitude[at]!;

    const along = (longitude - SPOT_LONGITUDE) / SPOT_HALF_WIDTH;
    const across = (latitude - SPOT_LATITUDE) / SPOT_HALF_HEIGHT;
    const spot = spotTone(along, across, t);
    if (spot !== undefined) {
      canvas.set(x, y, rungOf(SPOT_LADDER, light * spot, x, y));
      continue;
    }

    // The band, its edge ragged: the latitude is nudged by turbulence that flows with the band.
    const flowing = longitude + sphere.plainFlow[at]! * seconds;
    const ragged = latitude + (smoothNoise(flowing * 14, latitude * 22) - 0.5) * 0.05 + Math.sin(flowing * 20 + latitude * 40) * 0.008;
    const band = bandAt((ragged * 180) / Math.PI);
    const swirl = smoothNoise((longitude + band.flow * seconds) * 30, latitude * 60) - 0.5;
    let tone = band.tone + swirl * 0.16;

    // Round the spot: the belt paled into a hollow, and stirred into a wake behind it.
    const hollow = sphere.hollow[at]!;
    const wake = sphere.wake[at]!;
    if (hollow > 0) tone += (HOLLOW_TONE - tone) * hollow;
    if (wake > 0) {
      // Eddies: noise looked up through noise, so its blotches curl, pale cloud among dark.
      const drift = longitude + band.flow * seconds * 0.5;
      const [u, v] = [drift * 26, latitude * 44];
      const eddy = smoothNoise(u + 2.2 * smoothNoise(u * 0.5, v * 0.5), v + 2.2 * smoothNoise(u * 0.5 + 7, v * 0.5 + 7));
      tone += ((eddy - 0.5) * 1.3 + 0.12) * wake;
    }

    if (Math.abs(latitude - PEARL_LATITUDE) < PEARL_REACH) {
      const drifting = longitude + PEARL_FLOW * seconds;
      for (const pearl of PEARLS) {
        if (Math.hypot((drifting - pearl.longitude) / 1.6, latitude - PEARL_LATITUDE) < pearl.size) tone = 1.2;
      }
    }
    canvas.set(x, y, rungOf(JUPITER_LADDER, light * tone, x, y));
  }
}

// ═══ the moons ═══

interface Surface {
  readonly ladder: readonly PaletteChar[];
  /** How pale the ground is at a point of the moon, its latitude and longitude in radians. */
  readonly tone: (longitude: number, latitude: number) => number;
}

/** Each moon's own ground: Callisto dark and pocked, Europa ice with rust cracks, Io sulphur, Ganymede grey. */
const SURFACES: Readonly<Record<string, Surface>> = {
  Callisto: {
    ladder: [".", "d", "d", "g", "p"],
    tone: (lon, lat) => 0.62 + (smoothNoise(lon * 4 + 3, lat * 4) - 0.5) * 0.3 + (smoothNoise(lon * 16, lat * 16 + 9) > 0.8 ? 0.4 : 0),
  },
  Europa: {
    ladder: [".", "n", "b", "s", "p", "w"],
    tone: (lon, lat) => (Math.abs(smoothNoise(lon * 5 + 7, lat * 5) - 0.5) < 0.045 ? 0.45 : 0.95),
  },
  Io: {
    ladder: [".", "d", "m", "o", "a", "Y", "y"],
    tone: (lon, lat) => 0.8 + (smoothNoise(lon * 4, lat * 4 + 5) - 0.5) * 0.4 - (smoothNoise(lon * 12 + 4, lat * 12) > 0.78 ? 0.45 : 0),
  },
  Ganymede: {
    ladder: [".", "d", "g", "p"],
    tone: (lon, lat) => (smoothNoise(lon * 3 + 11, lat * 3) < 0.42 ? 0.55 : 0.9),
  },
};

/** The towns on each moon, in the order they light: points of its face, on its night side. */
function townsOf(moon: Moon) {
  const seed = moon.name.length * 31;
  return Array.from({ length: 70 }, (_, index) => {
    const longitude = (noise(index, seed) - 0.5) * Math.PI;
    const latitude = (noise(index, seed + 1) - 0.5) * 2.4;
    const normal = [Math.sin(longitude) * Math.cos(latitude), -Math.sin(latitude), Math.cos(longitude) * Math.cos(latitude)] as const;
    return { normal, big: noise(index, seed + 2) < 0.2 };
  }).filter(({ normal: [nx, ny, nz] }) => nz > 0.25 && sunlight(nx, ny, nz, MOON_SUN) < -0.02);
}

/** A moon, lit from the Sun's side, and the first `towns` of its towns' lights on its night side. */
function paintMoon(canvas: Canvas, camera: Camera, moon: Moon, towns: number): void {
  const [cx, cy] = view(camera, moon.x, moon.y);
  const radius = moon.radius * camera.zoom;
  const surface = SURFACES[moon.name]!;
  if (radius < 1.2) {
    canvas.set(cx, cy, surface.ladder[2]!);
    return;
  }

  for (let y = Math.floor(cy - radius - 1); y <= cy + radius + 1; y += 1) {
    for (let x = Math.floor(cx - radius - 1); x <= cx + radius + 1; x += 1) {
      const dx = (x + 0.5 - cx) / radius;
      const dy = (y + 0.5 - cy) / radius;
      const squared = dx * dx + dy * dy;
      if (squared > 1) continue;
      const dz = Math.sqrt(1 - squared);
      const light = Math.max(AMBIENT, sunlight(dx, dy, dz, MOON_SUN));
      canvas.set(x, y, rungOf(surface.ladder, light * surface.tone(Math.atan2(dx, dz), Math.asin(-dy)), x, y));
    }
  }

  if (radius < 6) return;
  for (const town of TOWNS.get(moon.name)!.slice(0, towns)) {
    const [px, py] = [Math.floor(cx + town.normal[0] * radius), Math.floor(cy + town.normal[1] * radius)];
    canvas.set(px, py, town.big ? "Y" : "a");
    if (town.big) canvas.set(px + 1, py, "a");
  }
}

const TOWNS = new Map([CALLISTO, EUROPA, IO, GANYMEDE].map((moon) => [moon.name, townsOf(moon)] as const));

// ═══ the line of light ═══

interface Leg {
  readonly to: Moon;
  readonly cueMs: number;
  /** The stations along the leg, a few pixels apart, from where it starts to the moon's edge. */
  readonly dots: readonly (readonly [number, number])[];
}

/** Dots every few pixels along a gentle curve, stopping short of both ends' moons. */
function dotsBetween(fromX: number, fromY: number, fromRadius: number, to: Moon, bend: number): (readonly [number, number])[] {
  const [ux, uy] = [to.x - fromX, to.y - fromY];
  const length = Math.hypot(ux, uy);
  const [nx, ny] = [-uy / length, ux / length];
  const at = (s: number) => [fromX + ux * s + nx * bend * Math.sin(Math.PI * s), fromY + uy * s + ny * bend * Math.sin(Math.PI * s)] as const;
  const gap = 7;
  const dots: (readonly [number, number])[] = [];
  let travelled = 0;
  let previous = at(0);
  for (let step = 1; step <= 600; step += 1) {
    const point = at(step / 600);
    travelled += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    previous = point;
    if (travelled < gap) continue;
    travelled = 0;
    const clear = Math.hypot(point[0] - fromX, point[1] - fromY) > fromRadius + 4 && Math.hypot(point[0] - to.x, point[1] - to.y) > to.radius + 4;
    if (clear) dots.push(point);
  }
  return dots;
}

/** The Corridor arriving from the left, where the Sun is, and running on from moon to moon. Not to Ganymede. */
export const LEGS: readonly Leg[] = [
  { to: CALLISTO, cueMs: CALLISTO_MS, dots: dotsBetween(-6, 4, 0, CALLISTO, -4) },
  { to: EUROPA, cueMs: EUROPA_MS, dots: dotsBetween(CALLISTO.x, CALLISTO.y, CALLISTO.radius, EUROPA, 8) },
  { to: IO, cueMs: IO_MS, dots: dotsBetween(EUROPA.x, EUROPA.y, EUROPA.radius, IO, 6) },
];

/** When the line reaches a moon: its last dot lit. */
const arrivalOf = (leg: Leg) => leg.cueMs + leg.dots.length * DOT_STEP_MS;
const LINE_LIT_MS = arrivalOf(LEGS.at(-1)!);

function paintLine(canvas: Canvas, camera: Camera, t: number): void {
  const all = LEGS.flatMap((leg) => leg.dots.map((dot, index) => ({ dot, litAt: leg.cueMs + index * DOT_STEP_MS })));
  const pulse = t >= LINE_LIT_MS ? fraction((t - LINE_LIT_MS) / PULSE_MS) * (all.length + 4) - 2 : -10;

  all.forEach(({ dot: [dx, dy], litAt }, index) => {
    const [x, y] = view(camera, dx, dy);
    canvas.set(Math.round(x), Math.round(y), t < litAt ? "b" : Math.abs(index - pulse) < 1.5 ? "w" : "y");
  });
}

/** A spark where the line arrives, and a station circling the moon from then on. */
function paintArrival(canvas: Canvas, camera: Camera, leg: Leg, t: number): void {
  const arrived = arrivalOf(leg);
  if (t < arrived) return;
  const moon = leg.to;
  const [cx, cy] = view(camera, moon.x, moon.y);

  // A ring of light spreading out from the moon as it comes on, dimming as it goes.
  const ringing = (t - arrived) / RING_MS;
  if (ringing < 1) {
    const reach = moon.radius + 2 + ringing * 16;
    const colour = ringing < 0.35 ? "y" : ringing < 0.7 ? "a" : "m";
    for (let step = 0; step < 120; step += 1) {
      const angle = (step / 120) * 2 * Math.PI;
      if (step % 3 !== 0 || ringing < 0.5) canvas.set(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach, colour);
    }
  }

  // The station: round the moon on a tilted ring, hidden while it passes behind.
  const angle = ((t - arrived) / 2600) * 2 * Math.PI + moon.radius;
  const [ox, oy] = [Math.cos(angle) * (moon.radius + 6), Math.sin(angle) * (moon.radius + 6) * 0.35];
  const behind = Math.sin(angle) < 0 && Math.hypot(ox, oy) < moon.radius;
  if (!behind) canvas.set(cx + ox, cy + oy, Math.floor(t / 240) % 2 === 0 ? "w" : "p");
}

/** How many of a moon's towns are lit: none until the line reaches it, then all within a moment. */
function townsLit(leg: Leg, t: number): number {
  const progress = clamp01((t - arrivalOf(leg)) / CITIES_LIGHTING_MS);
  return t < arrivalOf(leg) ? 0 : Math.ceil(progress * TOWNS.get(leg.to.name)!.length);
}

// ═══ the card ═══

function paintCard(canvas: Canvas, t: number): void {
  const camera = cameraAt(t);

  if (t < DIVE_MS) paintMap(canvas, camera, t);
  paintStars(canvas, t);
  // Until it has outgrown card 5's dot, Jupiter is that dot, magnified with the rest of the map.
  if (camera.zoom > CRISP_FROM * START_ZOOM) paintJupiter(canvas, camera, t);
  if (t < PULL_FROM_MS) return;

  paintLine(canvas, camera, t);
  // Ganymede: lit by the Sun like the others, but no line and no towns.
  paintMoon(canvas, camera, GANYMEDE, 0);
  for (const leg of LEGS) {
    paintMoon(canvas, camera, leg.to, townsLit(leg, t));
    paintArrival(canvas, camera, leg, t);
  }
}

/**
 * The card from `fromMs` on, painted on the card's own clock. It is one shot after another, split
 * into scenes at its beats so that under reduced motion each beat is a still of its own.
 */
function beat(fromMs: number): Scene {
  return { fromMs, layers: [{ kind: "painted", paint: (canvas) => paintCard(canvas, canvas.timeMs + fromMs) }] };
}

/** Each beat's still is the moment it has finished: a moon's line lit and its towns on. */
export const CALLISTO_LIT_MS = arrivalOf(LEGS[0]!) + CITIES_LIGHTING_MS;
export const EUROPA_LIT_MS = arrivalOf(LEGS[1]!) + CITIES_LIGHTING_MS;
export const IO_LIT_MS = arrivalOf(LEGS[2]!) + CITIES_LIGHTING_MS;

/**
 * Under reduced motion: card 5's map, then Jupiter with its moons dark, and each moon lit in turn.
 */
export const CARD_06_ART: CardArt = {
  scenes: [beat(0), beat(REVEALED_MS), beat(CALLISTO_LIT_MS), beat(EUROPA_LIT_MS), beat(IO_LIT_MS)],
};
