/**
 * The intro's palette: every colour any card may use, each named by one character.
 *
 * These are artwork, not design values. The hardcoded-hex rule in `docs/frontend.apps.md`
 * protects UI consistency; a picture's pixels are content, like the pixels of an image file
 * (design.md §4). Sixteen colours is the limit on purpose: working inside a fixed palette is
 * much of what makes 8-bit art look 8-bit.
 */
export const PALETTE = {
  ".": "#04050a", // space black
  n: "#0d1330", // deep navy
  b: "#1f2f5c", // night blue
  s: "#4a6fa5", // steel blue — also the logo's fourth corner
  p: "#c7d3e6", // pale starlight
  w: "#ffffff", // white
  y: "#fff1a8", // pale sun
  Y: "#ffc93c", // sun yellow — also the logo's second corner
  o: "#f08a24", // orange
  r: "#c8322b", // red — also the logo's third corner
  m: "#7a2e1c", // Mars rust
  d: "#2e1d16", // dark earth
  t: "#19b3a6", // Absolute Connections teal — the logo's first corner
  g: "#6a6f7d", // grey
  a: "#e3a857", // amber: Jupiter's bands, a lit window
  k: "#3a2a5c", // dusk violet
} as const;

export type PaletteChar = keyof typeof PALETTE;

/** How long each step of a colour cycle lasts. */
export const CYCLE_STEP_MS = 140;

const TWINKLE: readonly PaletteChar[] = ["b", "s", "p", "w", "p", "s"];

/** Fire: orange and yellow, dipping to red, for a burning edge. */
const FLICKER: readonly PaletteChar[] = ["o", "Y", "r", "o", "r", "Y"];

/**
 * Colour cycles: characters that stand for a sequence of palette colours rather than one.
 *
 * Stars twinkle this way — palette cycling, the trick 8-bit games used for water, lava and
 * starfields, because changing what a colour means is cheaper than redrawing pixels. The six
 * twinkle cycles run the same sequence out of phase, one step apart, so stars drawn with
 * different digits never blink in unison. The three flicker cycles do the same for fire, such as
 * the swelling Sun's edge.
 */
export const CYCLES = {
  "1": { colours: TWINKLE, offset: 0 },
  "2": { colours: TWINKLE, offset: 1 },
  "3": { colours: TWINKLE, offset: 2 },
  "4": { colours: TWINKLE, offset: 3 },
  "5": { colours: TWINKLE, offset: 4 },
  "6": { colours: TWINKLE, offset: 5 },
  "7": { colours: FLICKER, offset: 0 },
  "8": { colours: FLICKER, offset: 2 },
  "9": { colours: FLICKER, offset: 4 },
} as const satisfies Record<string, { colours: readonly PaletteChar[]; offset: number }>;

export type CycleChar = keyof typeof CYCLES;

/** A transparent pixel. Sprites only: a background has no "nothing". */
export const TRANSPARENT = "_";

export function isPaletteChar(char: string): char is PaletteChar {
  return Object.hasOwn(PALETTE, char);
}

export function isCycleChar(char: string): char is CycleChar {
  return Object.hasOwn(CYCLES, char);
}

/** The palette colour a character shows at `timeMs`: itself, or where its cycle has got to. */
export function colourAt(char: PaletteChar | CycleChar, timeMs: number): PaletteChar {
  if (isPaletteChar(char)) return char;

  const cycle = CYCLES[char];
  const step = Math.floor(timeMs / CYCLE_STEP_MS) + cycle.offset;

  return cycle.colours[step % cycle.colours.length]!;
}

/**
 * One shade brighter, colour by colour: the ladder an 8-bit fade climbs. Every colour has a next
 * step up its own family, and every ladder ends in white, so enough steps turn any picture white.
 * Games faded this way, by swapping in a brighter palette a step at a time, because hardware with
 * a fixed palette could not blend.
 */
const BRIGHTER: Readonly<Record<PaletteChar, PaletteChar>> = {
  ".": "n",
  n: "b",
  b: "s",
  s: "p",
  p: "w",
  w: "w",
  d: "m",
  m: "r",
  r: "o",
  o: "Y",
  Y: "y",
  y: "w",
  k: "s",
  g: "p",
  a: "y",
  t: "p",
};

/** The colour `steps` shades brighter: `steps` rungs up its ladder, stopping at white. */
export function brighter(char: PaletteChar, steps: number): PaletteChar {
  let colour = char;
  for (let step = 0; step < steps && colour !== "w"; step += 1) colour = BRIGHTER[colour];
  return colour;
}

/** The most steps any colour needs to reach white: a fade this long whites out any picture. */
export const STEPS_TO_WHITE = 6;

/**
 * One shade darker: the ladder a fade to black climbs down. Blues sink through navy, fire through
 * embers and earth, and every ladder ends in black.
 */
const DARKER: Readonly<Record<PaletteChar, PaletteChar>> = {
  ".": ".",
  n: ".",
  b: "n",
  s: "b",
  p: "s",
  w: "p",
  d: ".",
  m: "d",
  r: "m",
  o: "r",
  Y: "o",
  y: "Y",
  k: "n",
  g: "b",
  a: "m",
  t: "s",
};

/** The colour `steps` shades darker: `steps` rungs down its ladder, stopping at black. */
export function darker(char: PaletteChar, steps: number): PaletteChar {
  let colour = char;
  for (let step = 0; step < steps && colour !== "."; step += 1) colour = DARKER[colour];
  return colour;
}

/** The most steps any colour needs to reach black: a fade this long blacks out any picture. */
export const STEPS_TO_BLACK = 6;
