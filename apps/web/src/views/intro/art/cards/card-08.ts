import { cardDurationMs, msToType } from "../../intro-timeline";
import { INTRO_CARDS, captionText } from "../../script";
import { FRAME_WIDTH, parsePicture, type Picture } from "../grid";
import { STEPS_TO_WHITE, colourAt, type PaletteChar } from "../palette";
import { FRAME_MS, ditherAt, fadeRamp, frameTime, renderFrame, type Canvas, type CardArt, type Scene } from "../render";
import { VISIBLE } from "./card-05";
import { CARD_07_ART } from "./card-07";

/**
 * Card 8: the ones who stayed.
 *
 * Script: "A single small figure on a cracked Earth, looking up." It opens on card 7's last frame,
 * the camera diving into the Earth's bleached ground, and falls on into the glare until all is
 * white. Out of the white: a cliff of bleached rock towering out of the frame, a white sky and a
 * swollen Sun beside it, and in the cliff, three caverns — the rock the only shelter left from the
 * light. Dark mouths with ledges under them, tattered awnings, fires deep inside, small figures
 * keeping to the shade; on the cracked
 * plain beyond, a ship that never left, toppled with its tower. On "Some chose to stay." the
 * camera closes in on one cave mouth, and from inside it: dark rock round a blinding opening,
 * and in the opening a single small figure, cloaked, alone at the edge of the shade, looking up
 * at the white sky, where one last ship's trail climbs away.
 *
 * Serious, but for the courtesy in the caption, which is the chill (the story doc). The picture
 * does not join in.
 *
 * The scenery is code (design.md §11); the numbers worth tweaking are named below. The figure is
 * pixel data, a silhouette, and can be redrawn a pixel at a time.
 */

const CARD = INTRO_CARDS[8]!;
const CAPTION = captionText(CARD);

/** When the first letter of `words` appears, on the card's clock: the beats follow the caption. */
function cue(words: string): number {
  const at = CAPTION.indexOf(words);
  if (at < 0) throw new Error(`card 8: the caption has no "${words}"`);
  return msToType(CARD, at + 1);
}

// ── timings, on the card's clock ──
/** The fall goes on into the glare: white, a step at a time, from just after the cut. */
const GLARE_STEP_MS = 150;
const GLARE_FROM_MS = FRAME_MS;
/** Under the white, the cliff cuts in; then it comes out of the white, a step at a time. */
export const CLIFF_MS = GLARE_FROM_MS + STEPS_TO_WHITE * GLARE_STEP_MS + 60;
const CLEAR_STEP_MS = 110;
const CLEAR_FROM_MS = CLIFF_MS + 80;
export const CLEARED_MS = CLEAR_FROM_MS + STEPS_TO_WHITE * CLEAR_STEP_MS;
/** "Some chose to stay.": the camera closes in on the one cave mouth, and cuts inside it. */
export const STAY_MS = cue("Some chose");
const PUSH_FROM_MS = STAY_MS + 700;
export const INSIDE_MS = PUSH_FROM_MS + 1100;
/** How far into the push-in the view from inside shows through, a dither at a time. */
const DISSOLVE_FROM = 0.55;
export const COURTESY_MS = cue("Absolute Connections");

// ── the cliff ──
export const HORIZON = 116;
/** The foot of the cliff, and the rubble heaped against it. */
const FOOT = 146;
/** The Sun: swollen and white, up on the right, beyond the cliff's end. */
const SUN = { x: 352, y: -18, radius: 64 } as const;

/** A stable pseudo-random number for a pixel: the same every frame, so nothing shimmers by accident. */
function noise(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Noise that varies smoothly: blotches rather than grain. */
function smoothNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const ease = (f: number) => f * f * (3 - 2 * f);
  const fx = ease(x - x0);
  const fy = ease(y - y0);
  const top = noise(x0, y0) + (noise(x0 + 1, y0) - noise(x0, y0)) * fx;
  const bottom = noise(x0, y0 + 1) + (noise(x0 + 1, y0 + 1) - noise(x0, y0 + 1)) * fx;
  return top + (bottom - top) * fy;
}

const ease = (p: number) => p * p * (3 - 2 * p);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const frameOf = (timeMs: number) => Math.floor(timeMs / FRAME_MS);
const rungOf = (ladder: readonly PaletteChar[], light: number, x: number, y: number) =>
  ladder[Math.max(0, Math.min(ladder.length - 1, Math.floor(light * (ladder.length - 1) + ditherAt(x, y))))]!;

// ═══ the fall into the glare ═══

let card7End: readonly PaletteChar[] | undefined;
function card7Frame(): readonly PaletteChar[] {
  card7End ??= renderFrame(CARD_07_ART, frameTime(cardDurationMs(7) - 1));
  return card7End;
}

/** Card 7's last frame, the ground rushing up: magnified on about the middle, faster and faster. */
function paintFall(canvas: Canvas, t: number): void {
  const frame = card7Frame();
  const scale = 1 + ((t / CLIFF_MS) ** 2) * 5;
  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const u = Math.floor(FRAME_WIDTH / 2 + (x + 0.5 - FRAME_WIDTH / 2) / scale);
      const v = Math.floor(VISIBLE / 2 + (y + 0.5 - VISIBLE / 2) / scale);
      canvas.set(x, y, frame[v * FRAME_WIDTH + u]!);
    }
  }
}

// ═══ the sky and the plain ═══

/** The white sky, the swollen Sun in it, a haze along the horizon, and the last trails of the ships. */
function paintSky(canvas: Canvas, horizon: number): void {
  for (let y = 0; y < horizon; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const d = Math.hypot(x + 0.5 - SUN.x, y + 0.5 - SUN.y);
      if (d < SUN.radius - 3) canvas.set(x, y, "w");
      else if (d < SUN.radius) canvas.set(x, y, "y");
      else if (d < SUN.radius + 22 && ditherAt(x, y) < (1 - (d - SUN.radius) / 22) * 0.75) canvas.set(x, y, d < SUN.radius + 8 ? "Y" : "y");
      else if (horizon - y < 8 && ditherAt(x, y) < (8 - (horizon - y)) / 12) canvas.set(x, y, "p");
      else canvas.set(x, y, "w");
    }
  }
}

/** The trails the ships left, high up, thinning: drawn on the sky, dotted. */
const OLD_TRAILS = [
  { x: 262, y: 96, dx: 0.3, length: 74 },
  { x: 310, y: 108, dx: 0.12, length: 60 },
] as const;

function paintOldTrails(canvas: Canvas): void {
  for (const trail of OLD_TRAILS) {
    for (let step = 0; step < trail.length; step += 1) {
      if (noise(trail.x, step) < 0.35 + step / trail.length / 2) continue;
      canvas.set(trail.x + step * trail.dx, trail.y - step, "p");
    }
  }
}

/**
 * The plain: bleached and cracked, its far rows wavering in the heat, low mesas along its edge,
 * and lying on it, a ship that never left, toppled with its tower.
 */
function paintPlain(canvas: Canvas, t: number, horizon: number): void {
  for (let x = 0; x < FRAME_WIDTH; x += 1) {
    const mesa = Math.floor(Math.max(0, smoothNoise(x / 30, 5) - 0.4) * 18);
    for (let h = 0; h < mesa; h += 1) canvas.set(x, horizon - 1 - h, h === mesa - 1 ? "y" : "p");
  }
  for (let y = horizon; y < VISIBLE; y += 1) {
    const depth = y - horizon + 1;
    // The heat: the far rows waver, a pixel either way.
    const shimmer = depth < 10 ? Math.round(Math.sin(y * 1.7 + frameOf(t) * 0.9) * 0.8) : 0;
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const u = ((x + shimmer - FRAME_WIDTH / 2) * 1.4) / depth;
      const plate = smoothNoise(u + 30, 80 / depth);
      const crack = depth > 3 && Math.abs(plate - 0.5) < 0.014 + depth * 0.0003;
      const tone = 0.5 + Math.min(1, depth / 50) * 0.35 + (plate - 0.5) * 0.2;
      canvas.set(x, y, crack ? (depth > 12 ? "g" : "p") : rungOf(["p", "y", "w"], tone, x, y));
    }
  }
}

/** The ship that never left: on its side on the plain, rusted, half sunk in the dust, its tower down beside it. */
function paintWreck(canvas: Canvas, horizon: number): void {
  const [left, base, length] = [262, horizon + 13, 74];
  for (let u = 0; u < length; u += 1) {
    // A hull lying along the ground: its nose to the right, broken off; its fins up at the left.
    const thick = u > length - 10 ? Math.round((length - u) * 0.6) : u < 6 ? 8 : 6;
    for (let v = 0; v < thick; v += 1) canvas.set(left + u, base - v, v === thick - 1 ? "r" : v > thick - 3 ? "m" : "d");
  }
  for (let v = 0; v < 12; v += 1) canvas.set(left + 1 + Math.floor(v / 3), base - 6 - v, "d");
  // The dust drifted against it.
  for (let u = -4; u < length + 4; u += 1) if (noise(u, 9) < 0.7) canvas.set(left + u, base + 1, "p");
  // The tower, fallen alongside: a lattice lying on the ground.
  for (let u = 0; u < 46; u += 1) {
    canvas.set(left + 10 + u, base + 4, "g");
    canvas.set(left + 10 + u, base + 7, "g");
    if (u % 4 === 0) for (let v = 4; v <= 7; v += 1) canvas.set(left + 10 + u, base + v, "g");
    else canvas.set(left + 10 + u, base + 4 + (u % 4), "d");
  }
}

// ═══ the cliff and its caves ═══

/**
 * The cliff's top edge at a column — above the frame: the rock towers out of the picture — and
 * where its face ends on the right, a buttress stepping down to the plain.
 */
const cliffTop = (x: number) => -12 - smoothNoise(x / 26, 2) * 10;
const cliffEnd = (y: number) => 224 + (y - 10) * 0.32 + smoothNoise(y / 9, 4) * 8;

interface Cave {
  readonly x: number;
  /** The floor of its mouth. */
  readonly floor: number;
  readonly width: number;
  readonly height: number;
  readonly fire?: boolean;
  /** A cloth stretched over its mouth for shade: its colour. */
  readonly awning?: PaletteChar;
  /** People in the shade at its mouth. */
  readonly people?: number;
}

/** Three caves, no more: one high, the big one the camera closes in on, one at the foot. */
export const CAVES: readonly Cave[] = [
  { x: 64, floor: 54, width: 18, height: 12, fire: true, awning: "r", people: 1 },
  { x: 144, floor: 104, width: 30, height: 20, fire: true, awning: "k", people: 2 },
  { x: 42, floor: 136, width: 20, height: 13, people: 1 },
];
/** The cave the camera closes in on, and its one figure, out at the edge of the shade. */
export const THE_CAVE = CAVES[1]!;
const LONE_X = THE_CAVE.x + THE_CAVE.width / 2 + 5;

/** The rock: bleached on top, layered, its ledges casting hard shadows under the high Sun. */
const ROCK: readonly PaletteChar[] = ["d", "m", "a", "y", "w"];

function paintCliff(canvas: Canvas): void {
  for (let y = 0; y < FOOT + 2; y += 1) {
    const end = cliffEnd(y);
    for (let x = 0; x < Math.min(FRAME_WIDTH, end); x += 1) {
      if (y < cliffTop(x)) continue;
      // Strata: bands of harder and softer rock, each overhanging the one below and shading it.
      const band = (y + smoothNoise(x / 20, y / 30) * 6) / 9;
      const within = band - Math.floor(band);
      const hard = noise(Math.floor(band), 3) < 0.5;
      let light = (hard ? 0.62 : 0.5) + (smoothNoise(x / 6, y / 4) - 0.5) * 0.25;
      if (within < 0.16) light -= 0.32;
      // The joints: cracks running down the face.
      if (Math.abs(smoothNoise(x / 7, y / 40) - 0.5) < 0.025) light -= 0.25;
      // The cliff's end catches the Sun; its top edge is lit.
      if (end - x < 4) light += 0.3;
      if (y - cliffTop(x) < 1.5) light = 0.95;
      canvas.set(x, y, rungOf(ROCK, light, x, y));
    }
  }
  // The rubble heaped at its foot.
  for (let y = FOOT - 10; y < FOOT + 8; y += 1) {
    for (let x = 0; x < cliffEnd(y) + 30; x += 1) {
      const heap = FOOT - 10 + Math.abs(Math.sin(x / 13)) * 4 + noise(x, 1) * 3;
      if (y < heap || y > FOOT + 2 + noise(x, 2) * 6) continue;
      canvas.set(x, y, rungOf(ROCK, 0.45 + (smoothNoise(x / 2, y / 2) - 0.5) * 0.7, x, y));
    }
  }
}

/** A person, far off: a tiny silhouette. */
const PERSON: Picture = parsePicture(
  "card 8 person",
  `
  _n_
  nnn
  nnn
  nnn
  n_n
`,
);

function paintPicture(canvas: Canvas, picture: Picture, left: number, top: number): void {
  picture.pixels.forEach((pixel, index) => {
    if (pixel) canvas.set(left + (index % picture.width), top + Math.floor(index / picture.width), pixel);
  });
}

/** A cave: a dark arched mouth, a ledge under it, maybe a fire far inside, an awning, people in its shade. */
function paintCave(canvas: Canvas, cave: Cave, t: number, index: number): void {
  const half = cave.width / 2;
  for (let v = 0; v < cave.height; v += 1) {
    const y = cave.floor - v;
    const reach = half * Math.sqrt(1 - (v / cave.height) ** 2);
    for (let x = Math.ceil(cave.x - reach); x <= cave.x + reach; x += 1) {
      const rim = Math.abs(x - cave.x) > reach - 1 || v === cave.height - 1;
      canvas.set(x, y, rim ? "n" : ".");
    }
  }
  if (cave.fire) {
    // Deep inside: a glow on the back wall, and the flames, flickering.
    const flicker = (frameOf(t) + index) % 3;
    for (let u = -2; u <= 2; u += 1) for (let v = 1; v < 4; v += 1) if (ditherAt(cave.x + u, cave.floor - v) < 0.4) canvas.set(cave.x + u, cave.floor - v, "m");
    canvas.set(cave.x, cave.floor - 1, flicker === 0 ? "Y" : "o");
    canvas.set(cave.x + (flicker === 1 ? 1 : -1), cave.floor - 1, "r");
    if (flicker !== 2) canvas.set(cave.x, cave.floor - 2, "o");
  }
  // The ledge: lit on top, its shadow under it.
  for (let x = Math.floor(cave.x - half - 6); x <= cave.x + half + 8; x += 1) {
    canvas.set(x, cave.floor + 1, "y");
    canvas.set(x, cave.floor + 2, "m");
    canvas.set(x, cave.floor + 3, "d");
  }
  if (cave.awning) {
    // A cloth on two poles, out from the top of the mouth, its free edge stirring in the hot wind.
    const top = cave.floor - cave.height - 1;
    for (let x = Math.floor(cave.x - half - 2); x <= cave.x + half + 2; x += 1) {
      const sag = Math.round(Math.sin(((x - cave.x) / cave.width) * Math.PI + Math.PI / 2) * 1.5);
      const hem = 3 + sag + ((noise(x, frameOf(t) >> 1) < 0.3 ? 1 : 0));
      for (let v = 0; v < hem; v += 1) canvas.set(x, top + v, v === 0 ? cave.awning : cave.awning === "k" ? "n" : "m");
    }
    for (const pole of [cave.x - half - 2, cave.x + half + 2]) for (let v = 0; v < cave.height + 1; v += 1) canvas.set(pole, top + v, "d");
  }
  for (let person = 0; person < (cave.people ?? 0); person += 1) {
    paintPicture(canvas, PERSON, Math.round(cave.x - half + 2 + person * 5), cave.floor - 4);
  }
}

/** Two people on their way along the lowest ledge, slowly, in its shadow line. */
function paintWalkers(canvas: Canvas, t: number): void {
  const cave = CAVES[2]!;
  const along = (t / 1000) * 3;
  for (const offset of [0, 7]) {
    const x = Math.round(cave.x + cave.width / 2 + 30 - along - offset);
    paintPicture(canvas, PERSON, x, cave.floor - 4);
  }
}

/** The wide shot: the cliff and its caves under the white sky, the plain beyond with its wreck. */
function paintCliffShot(canvas: Canvas, t: number): void {
  paintSky(canvas, HORIZON);
  paintOldTrails(canvas);
  paintPlain(canvas, t, HORIZON);
  paintWreck(canvas, HORIZON);
  paintCliff(canvas);
  CAVES.forEach((cave, index) => paintCave(canvas, cave, t, index));
  paintWalkers(canvas, t);
  // The one who looks up: out at the edge of the shade, a little apart.
  paintPicture(canvas, PERSON, LONE_X, THE_CAVE.floor - 4);
}

// ═══ inside: the one who looks up ═══

/**
 * The figure: cloaked and hooded, a bundle on their back, standing at the cave's lip and looking
 * up at the sky to the right. A silhouette against the glare.
 */
export const FIGURE: Picture = parsePicture(
  "card 8 figure",
  `
  ____..._________
  ___......__..___
  ___..........___
  ___.......__.___
  ___......___..__
  ___....._____.__
  ___.....____..__
  __.......__..___
  _...........____
  ..........._____
  ..........._____
  ..........._____
  ..........._____
  ............____
  ............____
  ............____
  ............____
  _...........____
  _.........._____
  _.........._____
  _.........._____
  _...........____
  _...........____
  _...........____
  _...........____
  _............___
  _............___
  _............___
  .............___
  .............___
  ..............__
  ..............__
  ..._..........__
  .__..._.._...___
  ____..__..______
  ____..__..______
  ____..._..._____
`,
);

/** The opening, seen from inside: where the light is. Its outline wanders; its floor is the lip. */
const OPENING = { x: 196, y: 92, rx: 150, ry: 78 } as const;
const LIP = 152;
const INSIDE_HORIZON = 126;
/** Where the figure stands: their feet on the lip, a little right of the middle. */
export const FIGURE_X = 214;
const FIGURE_FEET = LIP;

/** How far a point is outside the opening: below 0 inside it, in units of its size. */
function openingAt(x: number, y: number): number {
  const angle = Math.atan2(y - OPENING.y, x - OPENING.x);
  const wobble = 1 + (smoothNoise(angle * 3 + 10, 1) - 0.5) * 0.24 + Math.sin(angle * 7) * 0.03;
  return Math.hypot((x - OPENING.x) / OPENING.rx, (y - OPENING.y) / OPENING.ry) - wobble;
}

/** The last ship: low on the right as we cut in, climbing away up the white sky and gone. */
function paintLastShip(canvas: Canvas, t: number): void {
  const since = Math.max(0, t - INSIDE_MS + 900) / 1000;
  const [x0, y0] = [318, INSIDE_HORIZON - 8];
  const climb = 9 * since + 3 * since * since;
  const [x, y] = [x0 + climb * 0.35, y0 - climb];
  for (let step = 2; step < climb; step += 1) {
    if (noise(step, 7) < 0.25 + step / 220) continue;
    canvas.set(x0 + step * 0.35, y0 - step, step < 14 ? "g" : "p");
  }
  if (y > 2) {
    canvas.set(x, y, "n");
    canvas.set(x, y + 1, frameOf(t) % 2 === 0 ? "Y" : "o");
  }
}

/** The cave from inside: dark rock round the opening, lit at its edge; a fire; a cloth; the figure in the light. */
function paintInside(canvas: Canvas, t: number): void {
  paintSky(canvas, INSIDE_HORIZON);
  paintPlain(canvas, t, INSIDE_HORIZON);
  paintLastShip(canvas, t);

  // The fire, low on the left, and the warm light it throws on the walls round it.
  const [fireX, fireY] = [48, 160];
  const flicker = frameOf(t) % 3;

  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const out = openingAt(x, y);
      const floor = y >= LIP;
      if (out < 0 && !floor) continue;
      // The rock: lit at the opening's edge by the glare, falling away into the dark, warm by the fire.
      const edge = clamp01(1 - (floor ? (y - LIP) / 26 + Math.max(0, out) * 2 : out * 5));
      const fire = clamp01(1 - Math.hypot(x - fireX, (y - fireY) * 1.6) / (52 + flicker * 3));
      const grain = (smoothNoise(x / 5, y / 4) - 0.5) * 0.25;
      if (fire > edge * 0.7) canvas.set(x, y, rungOf([".", "d", "m", "r"], fire * 0.75 + grain, x, y));
      else canvas.set(x, y, rungOf([".", "n", "b", "g", "p"], edge * 0.85 + grain, x, y));
    }
  }

  // The flames.
  for (let v = 0; v < 6 + flicker; v += 1) {
    const half = Math.max(0, 3 - v * 0.5);
    for (let u = -Math.ceil(half); u <= half; u += 1) canvas.set(fireX + u, fireY - v, v < 2 ? "Y" : v < 4 ? "o" : "r");
  }

  // A cloth hung across the left of the opening, stirring.
  for (let y = 30; y < LIP; y += 1) {
    const sway = Math.round(Math.sin(y / 9 + (t / 1000) * 2.1) * 1.5);
    const right = 66 + sway + Math.round((y - 30) * 0.08);
    for (let x = 40; x < right; x += 1) {
      if (openingAt(x, y) > 0.08) continue;
      canvas.set(x, y, x > right - 2 ? "r" : ditherAt(x, y) < 0.5 ? "m" : "d");
    }
  }

  // The figure, at the lip, against the light; the hem of the cloak stirring.
  paintPicture(canvas, FIGURE, FIGURE_X - Math.floor(FIGURE.width / 2), FIGURE_FEET - FIGURE.height);
  if (frameOf(t) % 4 < 2) canvas.set(FIGURE_X - Math.floor(FIGURE.width / 2) - 1, FIGURE_FEET - 6, ".");
  // Their shadow, falling back into the cave.
  for (let u = 0; u < 22; u += 1) if (ditherAt(FIGURE_X - u, FIGURE_FEET + 1) < 0.7) canvas.set(FIGURE_X - u, FIGURE_FEET + 1, ".");
}

// ═══ the push-in ═══

/** The point of the cliff the push closes in on: the one who looks up, at the edge of the shade. */
const PUSH_TO = { x: LONE_X + 1.5, y: THE_CAVE.floor - 1.5 } as const;
/** The push ends with the far figure as big as the close one, where the close one stands: one becomes the other. */
const PUSH_SCALE = 7.4;
const PUSH_LANDS = { x: FIGURE_X, y: FIGURE_FEET - 18.5 } as const;

function offscreen(timeMs: number, paint: (canvas: Canvas) => void): PaletteChar[] {
  const frame = new Array<PaletteChar>(FRAME_WIDTH * VISIBLE).fill(".");
  paint({
    timeMs,
    set(x, y, pixel) {
      if (x >= 0 && y >= 0 && x < FRAME_WIDTH && y < VISIBLE) frame[Math.floor(y) * FRAME_WIDTH + Math.floor(x)] = colourAt(pixel, timeMs);
    },
    get(x, y) {
      return x >= 0 && y >= 0 && x < FRAME_WIDTH && y < VISIBLE ? frame[y * FRAME_WIDTH + x]! : ".";
    },
  });
  return frame;
}

/** The cliff, magnified pixel by pixel onto the one who looks up, and the view from inside showing through. */
function paintPush(canvas: Canvas, t: number): void {
  const progress = (t - PUSH_FROM_MS) / (INSIDE_MS - PUSH_FROM_MS);
  const scale = PUSH_SCALE ** ease(progress);
  const anchorX = PUSH_TO.x + (PUSH_LANDS.x - PUSH_TO.x) * ease(progress);
  const anchorY = PUSH_TO.y + (PUSH_LANDS.y - PUSH_TO.y) * ease(progress);
  const cliff = offscreen(canvas.timeMs, (buffer) => paintCliffShot(buffer, t));
  const dissolve = clamp01((progress - DISSOLVE_FROM) / (1 - DISSOLVE_FROM));
  const inside = dissolve > 0 ? offscreen(canvas.timeMs, (buffer) => paintInside(buffer, t)) : undefined;

  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      if (inside && ditherAt(x, y) < dissolve) {
        canvas.set(x, y, inside[y * FRAME_WIDTH + x]!);
        continue;
      }
      const u = Math.floor(PUSH_TO.x + (x + 0.5 - anchorX) / scale);
      const v = Math.floor(PUSH_TO.y + (y + 0.5 - anchorY) / scale);
      canvas.set(x, y, u >= 0 && v >= 0 && u < FRAME_WIDTH && v < VISIBLE ? cliff[v * FRAME_WIDTH + u]! : "w");
    }
  }
}

// ═══ the card ═══

function paintCard(canvas: Canvas, t: number): void {
  if (t < CLIFF_MS) paintFall(canvas, t);
  else if (t < PUSH_FROM_MS) paintCliffShot(canvas, t);
  else if (t < INSIDE_MS) paintPush(canvas, t);
  else paintInside(canvas, t);
}

/**
 * The card from `fromMs` on, painted on the card's own clock. It is one shot after another, split
 * into scenes at its beats so that under reduced motion each beat is a still of its own.
 */
function beat(fromMs: number): Scene {
  return { fromMs, layers: [{ kind: "painted", paint: (canvas) => paintCard(canvas, canvas.timeMs + fromMs) }] };
}

/**
 * Under reduced motion: card 7's last frame, then the cliff, then the one who looks up; the fade
 * into the glare and out of it steps on cue as it does in motion.
 */
export const CARD_08_ART: CardArt = {
  scenes: [beat(0), beat(CLIFF_MS), beat(INSIDE_MS)],
  fade: [...fadeRamp(GLARE_FROM_MS, GLARE_STEP_MS, 1, STEPS_TO_WHITE), ...fadeRamp(CLEAR_FROM_MS, CLEAR_STEP_MS, STEPS_TO_WHITE - 1, 0)],
};
