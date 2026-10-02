import { parsePicture, type Picture } from "../grid";
import { STEPS_TO_WHITE, type CycleChar, type PaletteChar } from "../palette";
import { fadeRamp, type Canvas, type CardArt, type FadeKey, type Scene } from "../render";

/**
 * Card 2: the wars.
 *
 * Script: "City silhouettes burning, crowds, torn flags, under a white sky." Two shots, joined by
 * a flash. Out of the white card 1 handed over: a dense city, dark but for the windows the fire
 * has reached, big red flames rising behind it, and in front two crowds facing each other under
 * their own flags. The fire spreads, a building at a time. Then a shell bursts, white, and under
 * the white the shot moves in: the crowds charge from both edges and meet in the middle on the
 * caption's "…and itself", the second enemy. Nobody behind them stops: people keep streaming in
 * from both edges until the card ends, piling into one black mass of fighting people where nobody
 * can be told apart, their flags mixed and swaying over it. Two go down. Chosen by draft
 * (2026-10-02).
 *
 * The card is a serious one, so it carries no corporate touch (docs/story/chapter-01-intro.md,
 * "The Frame"). The scenery is code (design.md §11): the numbers worth tweaking are named below.
 * The people are pixel data, and can be redrawn a pixel at a time; the big figures of the close
 * shot were drawn from stick-figure skeletons by `tools/fighters.ts` and are stored as pixels like
 * the rest.
 */

// ── timings, on the card's clock (card 2 lasts about 7.4 s: its caption typed, then held) ──
/** Each step of the fade in, down the brightness ladder from card 1's white. */
const FADE_STEP_MS = 100;
/** The shell burst: two rungs of the ladder a step, up to white, then back down on the new shot. */
export const FLASH_MS = 2600;
const FLASH_STEP_MS = 60;
/** The cut to the close shot, hidden in the white. */
export const CUT_MS = FLASH_MS + 3 * FLASH_STEP_MS;
/** The crowds meet: as the caption types "itself". */
export const CLASH_MS = 4250;
/** A building or a blaze that was burning before the card began. */
const LONG_AGO = -60_000;
/** A building that never catches, in this card. */
const NEVER = Number.POSITIVE_INFINITY;
/** How long a fire takes to grow to its full size once it catches. */
const SPREAD_MS = 600;
/** Flames change shape this often. Stepped, like everything else at 12 fps. */
const FLAME_STEP_MS = 120;
/** A raised fist in the wide shot pumps up and down once per this long. */
const PUMP_MS = 500;
/** The close shot's runners change stride, and its fighters swing, this often. */
const STRIDE_MS = 110;
const SWING_MS = 280;
/** How long a falling flag takes to go down. */
const FALL_MS = 700;

// ── the city ──
/** The bottom of the visible picture: the caption band covers what is below. */
const STREET = 166;
/** The share of a burning building's windows alight: a few when it catches, a few more later. */
const WINDOWS_FIRST = 0.08;
const WINDOWS_LATER = 0.2;
/** A blaze is red this many pixels down from each tongue's tip, then orange, then flickering fire. */
const BLAZE_RED = 6;
const BLAZE_ORANGE = 12;
/** How wide a tongue of a blaze is, at its base. */
const TONGUE = 6;

// ── the smoke ──
/** How far a plume drifts right for each pixel it rises: the wind, which the wide shot's flags fly in. */
const SMOKE_LEAN = 0.4;
/** How fast a new plume climbs, and how fast the puffs inside a plume billow upward. */
const SMOKE_RISE_PER_S = 60;
const BILLOW_PER_S = 18;

// ── the crowds ──
/** In the wide shot, where the front and back rows stand, and the gap between the crowds. */
const FRONT_FEET = 176;
const BACK_FEET = 166;
const LEFT_CROWD_END = 160;
const RIGHT_CROWD_START = 226;
/** In the close shot, where the grey crowd behind stands, and how fast it squeezes in towards the fight. */
const MIDDLE_FEET = 160;
const MIDDLE_SURGE_PER_S = 9;
const MIDDLE_SURGE_MAX = 40;
/** In the close shot, where the fighters stand, and where the two sides meet. */
const FIGHTER_FEET = 182;
const CLASH_X = 192;
/** How far the first two fighters overlap when they meet. */
const OVERLAP = 6;
/**
 * Just after they meet, the people piling in behind shove the first two fighters into each other:
 * this far each, over this long, so no daylight is left between them.
 */
const SHOVE_PX = 10;
const SHOVE_MS = 450;
/**
 * The stream: runners keep coming from both edges until the card ends, this far apart and up to
 * `STREAM_JITTER` more, and every one of them runs on into the fight rather than stopping at its
 * edge. There are more than the card has time for, so the stream is still running when it ends.
 */
const RUNNERS = 48;
const STREAM_GAP = 12;
const STREAM_JITTER = 10;
/** How fast they run: all at one pace, so they reach the fight in the order they come. */
const RUN_PX_PER_MS = 0.11;
/**
 * The fight grows by accumulation: each runner stops where it meets the fight's outer edge, which
 * is this many pixels, and up to `ACCRETE_JITTER` more, beyond the last one in. It cannot grow
 * past `MASS_EDGE`, the furthest a fighter's left edge stands from the middle.
 */
const ACCRETE = 3;
const ACCRETE_JITTER = 4;
const MASS_EDGE = 150;
/** How deep the fight is: a runner stands up to this many pixels further up the street. */
const MASS_DEPTH = 16;
/** Every this many runners, one carries a flag. */
const BEARER_EVERY = 5;

// ── the flags ──
/** How far a flag ripples, as a share of its height at its fly end; how long a ripple is; how fast. */
const WAVE_SHARE = 0.16;
const WAVE_PER_PIXEL = 0.3;
const WAVE_HZ = 1.2;
/** How long a pole stands above the hands holding it, in the wide shot. */
const POLE = 44;
/** The close shot's flags: their poles lean forward into the charge, then sway over the fight. */
const MASS_POLE = 88;
const CHARGE_TILT = (28 * Math.PI) / 180;
/** In the fight each pole leans its own way, up to this far either way, and sways about it. */
const LEAN_TILT = (34 * Math.PI) / 180;
const SWAY_TILT = (8 * Math.PI) / 180;
const SWAY_MS = 900;
/** A falling flag ends tilted this far over, its bearer this much lower. */
const FALLEN_TILT = (62 * Math.PI) / 180;
const FALL_DROP = 34;

/** A stable pseudo-random number for a pixel: the same every frame, so nothing shimmers by accident. */
function noise(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const FIRE: readonly CycleChar[] = ["7", "8", "9"];
const fireAt = (x: number, y: number): CycleChar => FIRE[Math.floor(noise(y, x) * FIRE.length)]!;
const checker = (x: number, y: number) => ((x + y) & 1) === 0;

// ═══ the city ═══

export interface Building {
  readonly left: number;
  readonly width: number;
  readonly top: number;
  /** When, on the shot's clock, it catches fire. */
  readonly burnsFromMs: number;
  /** A shelled building has a jagged top rather than a roof. */
  readonly broken: boolean;
  /** A mast on the roof. */
  readonly mast: boolean;
}

/** A fire behind the skyline: only its top shows, rising above the roofs. */
export interface Blaze {
  readonly centre: number;
  readonly width: number;
  /** The highest its flames reach, and the row they rise from, behind the buildings. */
  readonly peak: number;
  readonly foot: number;
  readonly burnsFromMs: number;
}

export interface City {
  readonly buildings: readonly Building[];
  readonly blazes: readonly Blaze[];
  /** The buildings in front, and the ones behind that show above them and through the alleys. */
  readonly near: PaletteChar;
  readonly back: PaletteChar;
  /** The row band the buildings behind reach up into. */
  readonly backTop: number;
  readonly backSpread: number;
  readonly window: { readonly width: number; readonly height: number; readonly stepX: number; readonly stepY: number };
  /** How tall a flame licking out of a window stands, and how many windows burn, as a share. */
  readonly windowFlame: number;
  readonly windowsAlight: number;
  /** How high smoke climbs above the flames' tips before it thins out. */
  readonly smokeReach: number;
}

interface Plot {
  readonly width: number;
  readonly top: number;
  readonly burnsFromMs?: number;
  readonly broken?: boolean;
  readonly mast?: boolean;
  /** An alley after it, through which the buildings behind show. */
  readonly alley?: number;
}

/** Buildings shoulder to shoulder, left to right from `from`: a dense city, gaps only at alleys. */
function street(from: number, plots: readonly Plot[]): Building[] {
  let left = from;
  return plots.map((plot) => {
    const building = {
      left,
      width: plot.width,
      top: plot.top,
      burnsFromMs: plot.burnsFromMs ?? LONG_AGO,
      broken: plot.broken ?? false,
      mast: plot.mast ?? false,
    };
    left += plot.width + (plot.alley ?? 0);
    return building;
  });
}

/** The wide shot's city. Most of it is burning already; four more catch; four stay dark. */
export const WIDE_CITY: City = {
  buildings: street(-2, [
    { width: 30, top: 72 },
    { width: 22, top: 58, burnsFromMs: 900, broken: true },
    { width: 26, top: 80, burnsFromMs: NEVER, alley: 4 },
    { width: 34, top: 64 },
    { width: 20, top: 84, burnsFromMs: 1400 },
    { width: 28, top: 54, mast: true },
    { width: 24, top: 76, broken: true, burnsFromMs: NEVER, alley: 5 },
    { width: 36, top: 68, burnsFromMs: 1900 },
    { width: 22, top: 86, burnsFromMs: NEVER },
    { width: 30, top: 60, broken: true },
    { width: 26, top: 74, burnsFromMs: 2300, alley: 3 },
    { width: 34, top: 66, mast: true },
    { width: 30, top: 82, burnsFromMs: NEVER },
    { width: 14, top: 70 },
  ]),
  blazes: [
    { centre: 44, width: 96, peak: 22, foot: 100, burnsFromMs: LONG_AGO },
    { centre: 156, width: 80, peak: 30, foot: 100, burnsFromMs: LONG_AGO },
    { centre: 252, width: 100, peak: 18, foot: 100, burnsFromMs: LONG_AGO },
    { centre: 350, width: 80, peak: 26, foot: 100, burnsFromMs: 1600 },
  ],
  near: ".",
  back: "k",
  backTop: 42,
  backSpread: 22,
  window: { width: 2, height: 3, stepX: 5, stepY: 6 },
  windowFlame: 6,
  windowsAlight: 1,
  smokeReach: 70,
};

/** The close shot's city: nearer, so bigger; and all of it burning by now. Paler than the fighters. */
export const CLOSE_CITY: City = {
  buildings: street(-6, [
    { width: 58, top: 44 },
    { width: 44, top: 64, broken: true },
    { width: 66, top: 34, mast: true, alley: 6 },
    { width: 50, top: 58, burnsFromMs: NEVER },
    { width: 70, top: 40, broken: true },
    { width: 56, top: 52 },
    { width: 48, top: 46 },
  ]),
  blazes: [
    { centre: 64, width: 140, peak: 8, foot: 80, burnsFromMs: LONG_AGO },
    { centre: 230, width: 150, peak: 4, foot: 80, burnsFromMs: LONG_AGO },
    { centre: 360, width: 110, peak: 14, foot: 80, burnsFromMs: LONG_AGO },
  ],
  near: "k",
  back: "g",
  backTop: 20,
  backSpread: 24,
  window: { width: 4, height: 6, stepX: 10, stepY: 12 },
  windowFlame: 7,
  windowsAlight: 0.45,
  smokeReach: 60,
};

/** How far a fire has grown, from 0 when it catches to 1. */
function grown(burnsFromMs: number, timeMs: number): number {
  return timeMs < burnsFromMs ? 0 : Math.min(1, (timeMs - burnsFromMs) / SPREAD_MS);
}

/** Where a building's top is, column by column: flat, or shelled into a jagged edge. */
function roofAt(building: Building, x: number): number {
  if (!building.broken) return building.top;
  return building.top + 3 * Math.floor(noise(Math.floor((x - building.left) / 3), building.left) * 5);
}

/** The sky is white: the Sun has been brightening for a century. */
function paintSky(canvas: Canvas): void {
  for (let y = 0; y < STREET; y += 1) for (let x = 0; x < 384; x += 1) canvas.set(x, y, "w");
}

/** The buildings behind: a solid wall of them, of random heights, so no gap shows the sky. */
function paintBackCity(canvas: Canvas, city: City): void {
  let x = -4;
  for (let index = 0; x < 384; index += 1) {
    const width = 10 + Math.floor(noise(index, city.backTop) * 16);
    const top = city.backTop + Math.floor(noise(index, city.backTop + 1) * city.backSpread);

    for (let column = x; column < x + width; column += 1) {
      for (let y = top; y < STREET; y += 1) canvas.set(column, y, city.back);
    }
    if (noise(index, city.backTop + 2) < 0.25) for (let y = top - 7; y < top; y += 1) canvas.set(x + Math.floor(width / 2), y, city.back);
    x += width;
  }
}

/** Smoke from every blaze, leaning in the wind, in chunky puffs that billow upward. */
function paintSmoke(canvas: Canvas, city: City, timeMs: number): void {
  const billow = (timeMs / 1000) * BILLOW_PER_S;

  for (let y = 0; y < STREET; y += 1) {
    for (let x = 0; x < 384; x += 1) {
      let density = 0;

      for (const blaze of city.blazes) {
        if (timeMs < blaze.burnsFromMs) continue;
        // It rises from the blaze's foot, down among the buildings, so it is first seen between the
        // roofs and the flames and climbs out of the city; never out of the empty sky.
        const rise = blaze.foot - y;
        const height = blaze.foot - blaze.peak + city.smokeReach;
        const reach = Math.min(height, ((timeMs - blaze.burnsFromMs) / 1000) * SMOKE_RISE_PER_S);
        if (rise < 0 || rise > reach) continue;

        const centre = blaze.centre + rise * SMOKE_LEAN;
        const halfWidth = blaze.width * 0.22 + rise * 0.3;
        const across = 1 - Math.abs(x - centre) / halfWidth;
        if (across <= 0) continue;

        // Puffs are 4×4 blocks of noise scrolling up and downwind, so the smoke moves without the
        // plume moving: the same trick as a cycled colour, done with shapes.
        const puff = noise(Math.floor((x - billow * SMOKE_LEAN) / 4), Math.floor((y + billow) / 4));
        density = Math.max(density, across * (1 - rise / (height + 10)) * (0.5 + puff));
      }

      if (density > 0.7) canvas.set(x, y, "g");
      else if (density > 0.45) canvas.set(x, y, checker(x, y) ? "g" : "p");
      else if (density > 0.25) canvas.set(x, y, "p");
      else if (density > 0.12 && checker(x, y)) canvas.set(x, y, "p");
    }
  }
}

/**
 * The big fires behind the skyline. Each column's flame stands to a height that falls away from
 * the blaze's centre, in 3-pixel tongues that change shape every step: red at the top, where it
 * shows above the roofs, and flickering fire below, behind them.
 */
function paintBlazes(canvas: Canvas, city: City, timeMs: number): void {
  const step = Math.floor(timeMs / FLAME_STEP_MS);

  for (const blaze of city.blazes) {
    const size = grown(blaze.burnsFromMs, timeMs);
    if (size === 0) continue;

    const half = blaze.width / 2;
    for (let x = Math.ceil(blaze.centre - half); x < blaze.centre + half; x += 1) {
      const across = (x - blaze.centre) / half;
      // Tongues of flame, each tapering to a point at its middle, a new height every step.
      const offset = x - blaze.centre + 1000 * TONGUE;
      const group = Math.floor(offset / TONGUE);
      const taper = 1 - 0.3 * (Math.abs((offset % TONGUE) - (TONGUE - 1) / 2) / (TONGUE / 2));
      const tongue = 0.45 + 0.55 * noise(group, step * 7 + blaze.centre);
      const reach = (blaze.foot - blaze.peak) * (1 - Math.abs(across) ** 3) * tongue * taper * size;
      const top = Math.round(blaze.foot - reach);

      for (let y = top - 2; y < blaze.foot; y += 1) {
        if (y < top) {
          if (checker(x, y)) canvas.set(x, y, "r"); // a dithered edge of heat
        } else canvas.set(x, y, y - top < BLAZE_RED ? "r" : y - top < BLAZE_ORANGE ? "o" : fireAt(x, y));
      }
    }
  }
}

/** Whether a window is burning: the one it caught in first, and then a growing few of the rest. */
function windowAlight(city: City, building: Building, column: number, row: number, timeMs: number): boolean {
  if (timeMs < building.burnsFromMs) return false;
  if (column === 1 && row === 2) return true;

  const share = city.windowsAlight * (WINDOWS_FIRST + (WINDOWS_LATER - WINDOWS_FIRST) * grown(building.burnsFromMs, timeMs));
  return noise(building.left + column * 7, row * 13 + building.top) < share;
}

/**
 * The buildings in front: dark silhouettes. The only light in them is fire, in the windows it
 * has reached, with flames licking up the wall out of each.
 */
function paintNearCity(canvas: Canvas, city: City, timeMs: number): void {
  const step = Math.floor(timeMs / FLAME_STEP_MS);
  const { width: ww, height: wh, stepX, stepY } = city.window;

  for (const building of city.buildings) {
    const right = building.left + building.width;
    for (let x = building.left; x < right; x += 1) {
      for (let y = roofAt(building, x); y < STREET; y += 1) canvas.set(x, y, city.near);
    }
    if (building.mast) {
      const mastX = building.left + Math.floor(building.width / 3);
      for (let y = building.top - 12; y < building.top; y += 1) canvas.set(mastX, y, city.near);
    }

    const size = grown(building.burnsFromMs, timeMs);
    for (let column = 0, wx = building.left + 3; wx + ww <= right - 2; column += 1, wx += stepX) {
      for (let row = 0, wy = building.top + stepY; wy + wh <= STREET; row += 1, wy += stepY) {
        if (wy < roofAt(building, wx) + 3 || !windowAlight(city, building, column, row, timeMs)) continue;

        for (let y = wy; y < wy + wh; y += 1) for (let x = wx; x < wx + ww; x += 1) canvas.set(x, y, fireAt(x, y));

        // The flame out of the window: taller or shorter each step, narrower at its tip.
        const height = Math.round(city.windowFlame * (0.35 + 0.65 * noise(wx, step * 17 + wy)) * Math.max(0.4, size));
        for (let lick = 1; lick <= height; lick += 1) {
          const inset = ww > 2 && lick > height - 2 ? 1 : 0;
          for (let x = wx + inset; x < wx + ww - inset; x += 1) canvas.set(x, wy - lick, lick > height - 1 && height >= 3 ? "r" : fireAt(x, wy - lick));
        }
      }
    }
  }
}

function paintCity(canvas: Canvas, city: City, timeMs: number): void {
  paintSky(canvas);
  paintBackCity(canvas, city);
  paintSmoke(canvas, city, timeMs);
  paintBlazes(canvas, city, timeMs);
  paintNearCity(canvas, city, timeMs);
}

// ═══ the flags ═══

interface FlagDesign {
  /** Its colour at a point, `u` from the hoist (0) to the fly (1), `v` from top (0) to bottom (1). */
  readonly pattern: (u: number, v: number) => PaletteChar;
  /** Whether the cloth is still there at a pixel, or torn away. */
  readonly cloth: (column: number, row: number, width: number, height: number) => boolean;
}

/** The colour each cloth turns where it ripples away from the light. */
const SHADE: Partial<Record<PaletteChar, PaletteChar>> = { r: "m", p: "g", s: "b" };

// Patterns: two nations, red and pale against steel and navy, three flags each.
const disc = (field: PaletteChar, mark: PaletteChar) => (u: number, v: number) => (Math.hypot((u - 0.4) * 1.6, v - 0.5) < 0.27 ? mark : field);
const halves = (upper: PaletteChar, lower: PaletteChar) => (_u: number, v: number) => (v < 0.5 ? upper : lower);
const hoistBand = (band: PaletteChar, field: PaletteChar) => (u: number) => (u < 0.3 ? band : field);
const stripes = (outer: PaletteChar, middle: PaletteChar) => (_u: number, v: number) => (v < 1 / 3 || v >= 2 / 3 ? outer : middle);
const cross = (field: PaletteChar, mark: PaletteChar) => (u: number, v: number) =>
  Math.abs(u - 0.33) < 0.08 || Math.abs(v - 0.5) < 0.12 ? mark : field;
const triangle = (mark: PaletteChar, field: PaletteChar) => (u: number, v: number) => (u < 0.45 * (1 - Math.abs(2 * v - 1)) ? mark : field);

// Tears: each flag has been through something different, and two have come through whole.
const whole = () => true;
/** The fly end frayed away, in 2-row chunks. */
const ragged = (seed: number) => (column: number, row: number, width: number) =>
  column < width * (1 - 0.3 * noise(Math.floor(row / 2), seed));
/** The fly end ripped into strips of different lengths. */
const shredded = (seed: number) => (column: number, row: number, width: number, height: number) => {
  const strip = Math.floor(row / Math.max(2, Math.floor(height / 5)));
  return column < width * (1 - (strip % 2 === 1 ? 0.38 : 0.08) - 0.1 * noise(strip, seed));
};
/** The upper corner at the fly torn off on a diagonal. */
const cornerTorn = (seed: number) => (column: number, row: number, width: number, height: number) =>
  column / width + (1 - row / height) * 0.9 < 1.35 + 0.06 * noise(row, seed);
/** A V ripped into the fly end. */
const notched = (column: number, row: number, width: number, height: number) =>
  !(column / width > 0.5 && Math.abs(row / height - 0.5) < (column / width - 0.5) * 0.75);
/** Burned through in three places. */
const HOLES = [
  { u: 0.55, v: 0.3, r: 0.09 },
  { u: 0.78, v: 0.66, r: 0.12 },
  { u: 0.4, v: 0.78, r: 0.07 },
] as const;
const holed = (column: number, row: number, width: number, height: number) =>
  HOLES.every((hole) => Math.hypot((column + 0.5) / width - hole.u, ((row + 0.5) / height - hole.v) * (height / width)) >= hole.r);

const LEFT_DISC: FlagDesign = { pattern: disc("r", "p"), cloth: whole };
const LEFT_HALVES: FlagDesign = { pattern: halves("p", "r"), cloth: shredded(3) };
const LEFT_HOIST: FlagDesign = { pattern: hoistBand("p", "r"), cloth: cornerTorn(5) };
const RIGHT_STRIPES: FlagDesign = { pattern: stripes("n", "s"), cloth: whole };
const RIGHT_CROSS: FlagDesign = { pattern: cross("s", "n"), cloth: holed };
const RIGHT_TRIANGLE: FlagDesign = {
  pattern: triangle("n", "s"),
  cloth: (column, row, width, height) => notched(column, row, width, height) && ragged(9)(column, row, width),
};

interface Hoisted {
  readonly design: FlagDesign;
  /** Where the top hand grips the pole. */
  readonly gripX: number;
  readonly gripY: number;
  /** The pole's tilt from upright, in radians: positive leans its top right. */
  readonly tilt: number;
  /** How much pole there is above the grip, and below it. */
  readonly above: number;
  readonly below: number;
  readonly thickness: number;
  readonly width: number;
  readonly height: number;
  /** Which way the cloth flies off the pole: right with the wind, or left, streaming behind a charge. */
  readonly side: 1 | -1;
}

/**
 * A flag on its pole. The cloth hangs from the pole's top, fixed at the hoist and rippling more
 * towards the fly. It is drawn by asking, for every pixel near the pole, which point of the cloth
 * lands there: so a tilted pole carries its flag tilted, with hard pixel edges, like a turned
 * sprite.
 */
function paintFlag(canvas: Canvas, timeMs: number, flag: Hoisted): void {
  const sin = Math.sin(flag.tilt);
  const cos = Math.cos(flag.tilt);

  for (let along = -flag.below; along <= flag.above; along += 0.5) {
    const x = Math.floor(flag.gripX + sin * along);
    const y = Math.floor(flag.gripY - cos * along);
    for (let t = 0; t < flag.thickness; t += 1) canvas.set(x + t, y, ".");
  }

  const topX = flag.gripX + sin * flag.above + flag.thickness / 2;
  const topY = flag.gripY - cos * flag.above;
  // Down the pole, and away from it on the flying side: the cloth's two axes.
  const down = [-sin, cos] as const;
  const out = [flag.side * cos, flag.side * sin] as const;
  const phase = (timeMs / 1000) * WAVE_HZ * 2 * Math.PI;
  const amplitude = WAVE_SHARE * flag.height;

  const reach = flag.width + flag.height + amplitude + 2;
  for (let y = Math.floor(topY - reach); y < topY + reach; y += 1) {
    for (let x = Math.floor(topX - reach); x < topX + reach; x += 1) {
      const qx = x + 0.5 - topX;
      const qy = y + 0.5 - topY;
      const c = qx * out[0] + qy * out[1] - flag.thickness / 2;
      if (c < 0 || c >= flag.width) continue;

      const wave = c * WAVE_PER_PIXEL - phase;
      const r = qx * down[0] + qy * down[1] - (c / flag.width) * amplitude * Math.sin(wave);
      if (r < 0 || r >= flag.height) continue;

      const column = Math.floor(c);
      const row = Math.floor(r);
      if (!flag.design.cloth(column, row, flag.width, flag.height)) continue;

      const colour = flag.design.pattern((column + 0.5) / flag.width, (row + 0.5) / flag.height);
      canvas.set(x, y, Math.cos(wave) < -0.85 ? (SHADE[colour] ?? colour) : colour);
    }
  }
}

// ═══ the people ═══

/**
 * The wide shot's people, facing right; the crowd on the right is drawn mirrored. `.` is a
 * person, `_` is not. Arms down; a fist raised; and two hands up on a flagpole, which the code
 * draws through the hands. Each picture is placed by its bottom row, where its feet are.
 */
const STANDING: Picture = parsePicture(
  "card 2 standing",
  `
  _____....._____
  ____.......____
  ____........___
  ____........___
  ____.......____
  ____.......____
  _____....._____
  ______...______
  ___.........___
  __...........__
  _............._
  _............._
  _............._
  _............._
  _.._......._.._
  _.._......._.._
  _.._......._.._
  _.._......._.._
  _.._......._.._
  _.._......._.._
  _.._......._.._
  _.._......._.._
  _.._......._.._
  _.._......._.._
  _.._......._.._
  _.._......._.._
  ____.......____
  ____.......____
  ____.......____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ___...._....___
`,
);

const FIST: Picture = parsePicture(
  "card 2 fist",
  `
  ___________....
  ___________....
  ___________....
  ___________....
  ____________.._
  ____________.._
  ____________.._
  ____________.._
  ____________.._
  ____________.._
  ____________.._
  ____________.._
  _____.....__.._
  ____......._.._
  ____......._.._
  ____......._.._
  ____......._.._
  ____......._.._
  _____.....__.._
  ______...___.._
  ___..........._
  __............_
  _............._
  _............._
  _............._
  _............._
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  ____.......____
  ____.......____
  ____.......____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ___...._....___
`,
);

const BEARER: Picture = parsePicture(
  "card 2 flag bearer",
  `
  ____________...
  ____________...
  ____________.._
  ____________...
  ____________...
  ____________.._
  ____________.._
  ____________.._
  _____.....__.._
  ____......._.._
  ____......._.._
  ____......._.._
  ____......._.._
  ____......._.._
  _____.....__.._
  ______...___.._
  ___..........._
  __............_
  _............._
  _............._
  _............._
  _............._
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  _.._.......____
  ____.......____
  ____.......____
  ____.......____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ____..._...____
  ___...._....___
`,
);

/** The column, in the bearer's picture, that the pole runs up. */
const POLE_COLUMN = 13;

/**
 * The close shot's people, facing right, and as big as the frame allows: running, in two strides;
 * winding up and landing a blow; and charging with a flag, its top hand at `CHARGE_GRIP`.
 *
 * Drawn by `tools/fighters.ts` from a skeleton each: to change a pose, move its joints there and
 * paste what `pnpm run intro:draw-fighters` prints. Its test fails if these grids and the
 * skeletons part ways.
 */
const RUN_A: Picture = parsePicture(
  "card 2 running, stride A",
  `
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ________________________________..__
  _______________________________...._
  ___________________......_____......
  __________________........____......
  _________________..........___....._
  _________________..........___....__
  _________________..........___....__
  _________________..........__....___
  _________________..........__....___
  _________________.........._....____
  __________________........__....____
  __________________.......__.....____
  _________________......___....._____
  ________________......._......._____
  _______________...............______
  ______________..............._______
  ______________............._________
  ______________............__________
  ______________..........____________
  ______________........._____________
  _____..______.........._____________
  ____....____..........._____________
  ___......__............_____________
  ___...................______________
  ____..................______________
  _____.................______________
  ________..............______________
  __________............______________
  ___________.........._______________
  ___________.........._______________
  ___________.........._______________
  ___________.........._______________
  ___________.........________________
  __________..........________________
  __________..........________________
  __________..........________________
  __________........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________...........________________
  _________...........________________
  _________............_______________
  ________..............______________
  ________..............______________
  _______................_____________
  _______................_____________
  _______.......__........____________
  ______........__.........___________
  ______........___........___________
  ______.......____.........__________
  _____........_____........__________
  _____........______......___________
  ____........_______.......__________
  ___.........________......__________
  __........__________......__________
  _........____________.....__________
  ........_____________......_________
  .......______________......_________
  ......_______________......_________
  ....._________________....._________
  ....__________________......________
  _..___________________......________
  ______________________......________
  _______________________.....________
  _______________________......_______
  _______________________.......______
  ________________________......._____
  _________________________.......____
  ____________________________....____
  _____________________________.._____
  ____________________________________
`,
);

const RUN_B: Picture = parsePicture(
  "card 2 running, stride B",
  `
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ___________________......___________
  __________________........__________
  _________________.........._____..__
  _________________..........____...._
  _________________..........___......
  _________________..........___......
  _________________..........___....._
  _________________..........___....__
  __________________........___....___
  __________________.......____....___
  _________________......______....___
  ________________......._____....____
  _______________........___......____
  ______________................._____
  ______________................._____
  ______________................______
  ______________..............________
  ______________..........____________
  _____________.........._____________
  _____________.........._____________
  _____________.........._____________
  ____________..........______________
  ____________..........______________
  ___________...........______________
  ___________...........______________
  __________............______________
  ________............._______________
  _______.............._______________
  ______..............._______________
  ______..............._______________
  _______.............________________
  ________............________________
  __________..........________________
  __________..........________________
  __________........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  __________........__________________
  __________........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________...........________________
  ________............________________
  ________............________________
  ________............._______________
  ________............._______________
  ________............._______________
  _______.............._______________
  _______...............______________
  _______...............______________
  ______........_......_______________
  ______......___......_______________
  _____.......___......_______________
  ____.......____......_______________
  ____......_____.....________________
  ___......._____.....________________
  ___......______.....________________
  __.......______.....________________
  __......_______.....________________
  ___....________.....________________
  ____..________......________________
  ______________......________________
  ______________......________________
  ______________......________________
  ______________......._______________
  ______________........._____________
  _______________.........____________
  ________________........____________
  _____________________.._____________
`,
);

const WIND_UP: Picture = parsePicture(
  "card 2 winding up",
  `
  ________..__________________________
  _______...._________________________
  ______......________________________
  ______......________________________
  _______...._________________________
  _______...._________________________
  _______...._________________________
  _______...._________________________
  _______...._______......____________
  _______....______........___________
  _______...._____..........__________
  _______...._____..........__________
  _______...._____..........__________
  _______.....____..........__________
  _______......___..........__________
  ________......__..........__________
  _________.....___........___________
  __________..............____________
  __________..........._______________
  ___________.........._______________
  ____________.........._______.._____
  ____________..........______....____
  ____________.........._____......___
  ____________.........._____......___
  ____________............__......____
  ____________..................._____
  ____________................._______
  ___________.................________
  ___________.........._....._________
  ___________..........__...__________
  ___________.........._______________
  ___________.........._______________
  ___________.........________________
  ___________.........________________
  __________..........________________
  __________..........________________
  __________..........________________
  __________..........________________
  __________..........________________
  __________........._________________
  __________........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________...........________________
  ________............________________
  ________............._______________
  ________..............______________
  _______...............______________
  _______................_____________
  _______......._........_____________
  ______........__........____________
  ______........__........____________
  _____........____........___________
  _____........____........___________
  _____.......______........__________
  ____........______........__________
  ____........_______......___________
  _____......________.......__________
  ____......._________......__________
  ____......___________.....__________
  ____.....____________......_________
  ___......____________......_________
  ___......_____________....._________
  ___.....______________......________
  __......______________......________
  __......_______________.....________
  __.....________________......_______
  _......________________......_______
  _......_________________....._______
  _.....__________________......______
  ......__________________........____
  ......___________________........___
  _...._____________________.......___
  __..__________________________..____
`,
);

const BLOW: Picture = parsePicture(
  "card 2 landing a blow",
  `
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ______________________......________
  _____________________........_______
  ____________________..........______
  ____________________..........______
  ____________________..........______
  ____________________..........______
  ____________________..........______
  ____________________..........______
  _____________________........_______
  ___________________.........________
  __________________.......___________
  _________________........___________
  ________________..........__________
  ________________..........._________
  ________________..............______
  _______________................_____
  _______________................_____
  _______________.................____
  ______________...........____....___
  _____________..........._____.....__
  _____________...........______....._
  ____________............______......
  ___________............_______......
  __________.............________...._
  _________.............._________..__
  ________..............______________
  _______...............______________
  _______...............______________
  ________............._______________
  _________............_______________
  __________..........._______________
  __________..........________________
  __________..........________________
  _________...........________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________...........________________
  _________...........________________
  ________............._______________
  ________............._______________
  ________..............______________
  _______................_____________
  _______......._........_____________
  ______........__........____________
  ______........__........____________
  ______.......____........___________
  _____........____.........__________
  _____.......______........__________
  ____........_______........_________
  ____........_______........_________
  ____......._________......__________
  ____......._________......._________
  ___.......___________......_________
  ___......_____________....._________
  ___......_____________......________
  __......______________......________
  __......_______________.....________
  _......________________......_______
  _......________________......_______
  ......._________________....._______
  ......__________________......______
  ......__________________......______
  .....____________________.....______
  .....____________________........___
  ...._____________________.........__
  _.._______________________........__
  ___________________________..__..___
`,
);

const CHARGING_BEARER: Picture = parsePicture(
  "card 2 charging with a flag",
  `
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  ____________________________________
  __________________......____________
  _________________........___________
  ________________..........__________
  ________________..........__________
  ________________..........__________
  ________________..........__..______
  ________________.........._...._____
  ________________................____
  _________________........_......____
  _________________.......___...._____
  _________________......____...._____
  ________________......_____...______
  _______________........____...______
  ______________..........__....______
  ______________................______
  ______________................______
  ______________................______
  ______________..............._______
  _____________.........._....________
  _____________.............._________
  _____________.............._________
  _____________.............._________
  ____________..............._________
  ____________.........._...._________
  ____________..........__..__________
  ____________..........______________
  ___________.........._______________
  ___________.........._______________
  ___________.........._______________
  ___________.........._______________
  ___________.........________________
  __________..........________________
  __________..........________________
  __________..........________________
  __________........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________.........._________________
  _________...........________________
  _________...........________________
  _________............_______________
  ________..............______________
  ________..............______________
  _______................_____________
  _______................_____________
  _______.......__........____________
  ______........__.........___________
  ______........___........___________
  ______.......____.........__________
  _____........_____........__________
  _____........______......___________
  ____........_______.......__________
  ___.........________......__________
  __........__________......__________
  _........____________.....__________
  ........_____________......_________
  .......______________......_________
  ......_______________......_________
  ....._________________....._________
  ....__________________......________
  _..___________________......________
  ______________________......________
  _______________________.....________
  _______________________......_______
  _______________________.......______
  ________________________......._____
  _________________________.......____
  ____________________________....____
  _____________________________.._____
  ____________________________________
`,
);

const CHARGE_GRIP = { x: 29, y: 15 };

/** The close shot's fighters, by the name of the pose that drew them. */
export const CLOSE_FIGHTERS = { RUN_A, RUN_B, WIND_UP, BLOW, CHARGING_BEARER } as const;

interface Figure {
  readonly picture: Picture;
  readonly left: number;
  readonly top: number;
  readonly mirrored: boolean;
  readonly colour: PaletteChar;
}

function paintFigure(canvas: Canvas, figure: Figure): void {
  const { picture } = figure;
  for (let v = 0; v < picture.height; v += 1) {
    for (let u = 0; u < picture.width; u += 1) {
      const source = figure.mirrored ? picture.width - 1 - u : u;
      if (picture.pixels[v * picture.width + source] !== null) canvas.set(figure.left + u, figure.top + v, figure.colour);
    }
  }
}

/** Where a column of a picture lands in the frame, mirrored or not. */
const columnOf = (figure: Figure, column: number) => figure.left + (figure.mirrored ? figure.picture.width - 1 - column : column);

interface Person {
  readonly picture: Picture;
  readonly left: number;
  readonly feet: number;
  readonly mirrored: boolean;
  readonly colour: PaletteChar;
  /** Out of step with the others, so a crowd's fists don't pump in unison. */
  readonly phaseMs: number;
  readonly flag?: { readonly design: FlagDesign; readonly width: number; readonly height: number };
}

/** A row of a crowd, from `from` to `to`, a person every `step` or so; `seed` keeps the rows unalike. */
function row(from: number, to: number, step: number, feet: number, colour: PaletteChar, mirrored: boolean, seed: number): Person[] {
  const people: Person[] = [];
  for (let index = 0, x = from; x < to - STANDING.width; index += 1, x += step) {
    const left = x + Math.floor(noise(index, seed) * 4) - 2;
    const picture = noise(index, seed + 1) < 0.4 ? FIST : STANDING;
    people.push({ picture, left, feet, mirrored, colour, phaseMs: Math.floor(noise(index, seed + 2) * PUMP_MS) });
  }
  return people;
}

function bearer(left: number, feet: number, colour: PaletteChar, mirrored: boolean, design: FlagDesign, width: number, height: number): Person {
  return { picture: BEARER, left, feet, mirrored, colour, phaseMs: 0, flag: { design, width, height } };
}

/** The back rows are paler than the front, set back in the smoke. */
const BACK_ROW: PaletteChar = "g";
const FRONT_ROW: PaletteChar = ".";

/** The wide shot: two crowds facing each other across a gap, three flags each. */
const WIDE_CROWDS: readonly Person[] = [
  // The back rows first, so the front rows stand in front of them.
  ...row(-6, LEFT_CROWD_END, 12, BACK_FEET, BACK_ROW, false, 20),
  bearer(20, BACK_FEET, BACK_ROW, false, LEFT_HALVES, 34, 20),
  bearer(128, BACK_FEET, BACK_ROW, false, LEFT_HOIST, 28, 18),
  ...row(RIGHT_CROWD_START, 392, 12, BACK_FEET, BACK_ROW, true, 40),
  bearer(290, BACK_FEET, BACK_ROW, true, RIGHT_STRIPES, 34, 21),
  ...row(-2, LEFT_CROWD_END - 8, 14, FRONT_FEET, FRONT_ROW, false, 60),
  bearer(70, FRONT_FEET, FRONT_ROW, false, LEFT_DISC, 30, 19),
  ...row(RIGHT_CROWD_START + 8, 392, 14, FRONT_FEET, FRONT_ROW, true, 80),
  bearer(236, FRONT_FEET, FRONT_ROW, true, RIGHT_CROSS, 30, 19),
  bearer(346, FRONT_FEET, FRONT_ROW, true, RIGHT_TRIANGLE, 28, 18),
];

/** How far a person is lifted at `timeMs`: a raised fist pumps, everyone else stands still. */
function liftAt(person: Person, timeMs: number): number {
  return person.picture === FIST && Math.floor((timeMs + person.phaseMs) / PUMP_MS) % 2 === 1 ? 2 : 0;
}

/** A crowd, with its flags flying right in the wind; `shift` moves each side in towards the middle. */
function paintCrowd(canvas: Canvas, people: readonly Person[], timeMs: number, shift = 0): void {
  for (const person of people) {
    const figure: Figure = {
      picture: person.picture,
      left: person.left + (person.mirrored ? -shift : shift),
      top: person.feet - person.picture.height - liftAt(person, timeMs),
      mirrored: person.mirrored,
      colour: person.colour,
    };
    paintFigure(canvas, figure);

    if (person.flag) {
      paintFlag(canvas, timeMs, {
        ...person.flag,
        gripX: columnOf(figure, POLE_COLUMN),
        gripY: figure.top + 4,
        tilt: 0,
        above: POLE + 4,
        below: 0,
        thickness: 1,
        side: 1,
      });
    }
  }
}

/** The grey crowd behind the fighters in the close shot: both sides squeeze in towards the fight. */
const MIDDLE_CROWDS: readonly Person[] = [
  ...row(-6, CLASH_X, 12, MIDDLE_FEET, BACK_ROW, false, 100),
  bearer(54, MIDDLE_FEET, BACK_ROW, false, LEFT_HALVES, 30, 18),
  ...row(CLASH_X, 392, 12, MIDDLE_FEET, BACK_ROW, true, 120),
  bearer(314, MIDDLE_FEET, BACK_ROW, true, RIGHT_TRIANGLE, 30, 18),
];

// ═══ the two shots ═══

/** The wide shot, on its own clock. */
function paintWide(canvas: Canvas): void {
  paintCity(canvas, WIDE_CITY, canvas.timeMs);
  paintCrowd(canvas, WIDE_CROWDS, canvas.timeMs);
}

/** A flag carried into the fight. */
interface CarriedFlag {
  readonly design: FlagDesign;
  /** How its pole leans once in the fight, and which way its cloth flies there. */
  readonly lean: number;
  readonly side: 1 | -1;
  /** How long after its bearer reaches the fight it goes down: never, for most. */
  readonly fallsAfterMs: number;
}

/** One of the stream, as the left side runs: rightwards. The right side is drawn mirrored. */
interface Runner {
  /** Its left edge when the close shot cuts in, and where it ends up, in the fight. */
  readonly startX: number;
  readonly stopX: number;
  readonly speed: number;
  /** How far up the street it stands. */
  readonly depth: number;
  /** Out of step with the others, so the fight does not swing in unison. */
  readonly phaseMs: number;
  /** How far it is shoved on in, once in the fight, by the people behind: only the first is. */
  readonly shove: number;
  readonly flag?: CarriedFlag;
}

/**
 * One side's stream, front runner first. The front runner meets the other side's at the clash;
 * each after it starts a little further back and glues itself onto the fight's outer edge, so the
 * fight grows outwards from the middle, a body at a time. `falls` says, bearer by bearer, when their flags go down.
 */
function stream(seed: number, designs: readonly FlagDesign[], falls: readonly number[]): Runner[] {
  const first = CLASH_X + OVERLAP - RUN_A.width;
  const runners: Runner[] = [];
  let startX = first - RUN_PX_PER_MS * (CLASH_MS - CUT_MS);
  let edge = first;

  for (let index = 0; index < RUNNERS; index += 1) {
    const random = (salt: number) => noise(index, seed + salt);
    const bearer = index % BEARER_EVERY === 2 ? Math.floor(index / BEARER_EVERY) : undefined;

    runners.push({
      startX,
      stopX: edge,
      speed: RUN_PX_PER_MS,
      depth: index === 0 ? 0 : Math.round(random(3) * MASS_DEPTH),
      phaseMs: Math.floor(random(4) * SWING_MS * 2),
      shove: index === 0 ? SHOVE_PX : 0,
      ...(bearer === undefined
        ? {}
        : {
            flag: {
              design: designs[bearer % designs.length]!,
              lean: (random(5) * 2 - 1) * LEAN_TILT,
              side: random(6) < 0.5 ? 1 : -1,
              fallsAfterMs: falls[bearer] ?? NEVER,
            },
          }),
    });
    startX -= STREAM_GAP + random(7) * STREAM_JITTER;
    edge = Math.max(CLASH_X - MASS_EDGE, edge - ACCRETE - Math.round(random(1) * ACCRETE_JITTER));
  }
  return runners;
}

/** The two sides. On each, one flag goes down: the red disc first, then a steel-blue one. */
const LEFT_STREAM = stream(200, [LEFT_DISC, LEFT_HALVES, LEFT_HOIST], [1100]);
const RIGHT_STREAM = stream(300, [RIGHT_CROSS, RIGHT_STRIPES, RIGHT_TRIANGLE], [NEVER, 1300]);

/** Everyone, furthest up the street first, so the ones nearer stand in front. */
const DRAW_ORDER = [
  ...LEFT_STREAM.map((runner, index) => ({ runner, index, mirrored: false })),
  ...RIGHT_STREAM.map((runner, index) => ({ runner, index, mirrored: true })),
].sort((a, b) => b.runner.depth - a.runner.depth || b.index - a.index);

const arrivalOf = (runner: Runner) => (runner.stopX - runner.startX) / runner.speed;

/** How far a flag has gone down at `t`, from 0 to 1, in six chunky steps. */
function fallOf(runner: Runner, t: number): number {
  if (!runner.flag) return 0;
  const progress = (t - arrivalOf(runner) - runner.flag.fallsAfterMs) / FALL_MS;
  return Math.max(0, Math.min(1, Math.floor(progress * 6) / 6));
}

/** A runner at `t`, the close shot's time: running in, then fighting where it lands. */
function runnerAt(runner: Runner, t: number): { picture: Picture; left: number; drop: number } {
  const arrival = arrivalOf(runner);

  if (runner.flag) {
    // A bearer holds the pole in both hands, running or fighting, and may go down with it.
    const left = t < arrival ? runner.startX + runner.speed * t : runner.stopX;
    return { picture: CHARGING_BEARER, left, drop: Math.round(fallOf(runner, t) * FALL_DROP) };
  }
  if (t < arrival) {
    const stride = Math.floor((t + runner.phaseMs) / STRIDE_MS) % 2 === 0 ? RUN_A : RUN_B;
    return { picture: stride, left: runner.startX + runner.speed * t, drop: stride === RUN_B ? -1 : 0 };
  }
  // Fighting: a wind-up, then the blow, leaning in by two pixels as it lands.
  const blow = Math.floor((t - arrival + runner.phaseMs) / SWING_MS) % 2 === 1;
  const shoved = Math.round(runner.shove * Math.min(1, (t - arrival) / SHOVE_MS));
  return { picture: blow ? BLOW : WIND_UP, left: runner.stopX + shoved + (blow ? 2 : 0), drop: 0 };
}

/**
 * How a carried flag's pole leans at `t`, as the left side sees it: forward while its bearer
 * runs, then its own way in the fight, swaying, and over towards the ground if it goes down.
 */
function tiltAt(runner: Runner, flag: CarriedFlag, t: number): number {
  if (t < arrivalOf(runner)) return CHARGE_TILT;

  const sway = flag.lean + SWAY_TILT * Math.sin(((t + runner.phaseMs) / SWAY_MS) * 2 * Math.PI);
  const fallen = (flag.lean < 0 ? -1 : 1) * FALLEN_TILT;
  return sway + (fallen - sway) * fallOf(runner, t);
}

/**
 * The close shot, at `t` on its own clock: the city behind, the grey crowds squeezing in, and the
 * stream of fighters from both edges, running into the middle and piling into one black mass that
 * keeps growing as long as the card lasts, its flags mixed over it. The right side is the left
 * mirrored about the middle of the frame, a beat out of step.
 */
function paintClose(canvas: Canvas, t: number): void {
  paintCity(canvas, CLOSE_CITY, t);
  paintCrowd(canvas, MIDDLE_CROWDS, t, Math.round(Math.min(MIDDLE_SURGE_MAX, (t / 1000) * MIDDLE_SURGE_PER_S)));

  for (const { runner, mirrored } of DRAW_ORDER) {
    const { picture, left, drop } = runnerAt(runner, t + (mirrored ? 40 : 0));
    const x = Math.round(left);
    if (x + picture.width < 0) continue; // not on the frame yet

    const figure: Figure = {
      picture,
      left: mirrored ? 384 - x - picture.width : x,
      top: FIGHTER_FEET - runner.depth - picture.height + drop,
      mirrored,
      colour: FRONT_ROW,
    };
    paintFigure(canvas, figure);

    if (runner.flag) {
      // Running, the cloth streams out behind; in the fight it flies whichever way it was thrown.
      const tilt = tiltAt(runner, runner.flag, t);
      const side = t < arrivalOf(runner) ? -1 : runner.flag.side;
      paintFlag(canvas, t, {
        design: runner.flag.design,
        gripX: columnOf(figure, CHARGE_GRIP.x),
        gripY: figure.top + CHARGE_GRIP.y,
        tilt: mirrored ? -tilt : tilt,
        above: MASS_POLE,
        below: 14,
        thickness: 2,
        width: 38,
        height: 23,
        side: mirrored ? (side === 1 ? -1 : 1) : side,
      });
    }
  }
}

/** A moment deep in the fight: the reduced-motion still that the card ends on. */
export const MASS_MS = 6200;

/** The close shot from `fromMs` on, painted on the close shot's own clock whichever scene shows it. */
function closeFrom(fromMs: number): Scene {
  return { fromMs, layers: [{ kind: "painted", paint: (canvas) => paintClose(canvas, canvas.timeMs + fromMs - CUT_MS) }] };
}

export const CARD_02_ART: CardArt = {
  scenes: [
    { fromMs: 0, layers: [{ kind: "painted", paint: paintWide }] },
    // The charge, the clash and the mass: one picture, split in three scenes so that under reduced
    // motion the close shot still tells the story, a still for each, rather than one empty street.
    closeFrom(CUT_MS),
    closeFrom(CLASH_MS),
    closeFrom(MASS_MS),
  ],
  fade: [
    // Out of card 1's white, a step at a time.
    ...fadeRamp(0, FADE_STEP_MS, STEPS_TO_WHITE, 0),
    // The shell burst: up to white, the cut under it, and down again on the close shot.
    ...[2, 4, 6].map((steps, index): FadeKey => ({ atMs: FLASH_MS + index * FLASH_STEP_MS, steps })),
    ...[6, 4, 2, 0].map((steps, index): FadeKey => ({ atMs: CUT_MS + index * FLASH_STEP_MS, steps })),
  ],
};
