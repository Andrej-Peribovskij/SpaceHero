import { parsePicture, type Picture } from "../grid";
import type { PaletteChar } from "../palette";
import { cardDurationMs } from "../../intro-timeline";
import { FRAME_MS, closeToBlack, type Canvas, type CardArt, type Scene } from "../render";
import { SQUARE } from "./card-00";

/**
 * Card 3: the corporations.
 *
 * Script: "Corporate towers in a ring under one sky." Power, shown three ways,
 * one to each sentence of the caption. On "…did what governments could not", the ruins card 2
 * left and a few people among them; then the ground shakes, and towers rise from behind the
 * horizon, so tall the tallest leaves the frame, and their shadows run out across the ground and
 * swallow the people. On "They united the world", the shot looks straight up from inside a ring of
 * them, turning slowly like the logo of card 0, round the one sky left between their tops; their
 * windows come on floor by floor, from the street up towards the sky, and on "Order returned"
 * every light flashes at once and the beacons blink together: order, after card 2's chaos. On "One
 * world. Many partners.", Absolute Connections' square appears round that sky, the white circle
 * inscribed in it and its brackets over the towers, and turns against the ring. Then the dark
 * closes in from the edges, the square last, and card 4 begins in it. Chosen by draft (2026-10-02); the square replaced a pixel handshake, which the
 * script had asked for and which never looked like one.
 *
 * The corporate touch is the slogan and the square that comes with it, the company signing its own
 * picture; the tallest tower is lit in its teal, since it is Absolute Connections telling the story. What the
 * card stresses is the power; what it skips is what the people under the shadow made of it.
 *
 * The scenery is code (design.md §11): the numbers worth tweaking are named below. The tiny people
 * are pixel data, and the square is card 0's own.
 */

// ── timings, on the card's clock (card 3 lasts about 8.4 s: its caption typed, then held) ──
/** The ground starts to shake and the first tower to rise; the rest follow, a ring at a time. */
const RISE_FROM_MS = 250;
const RISE_STAGGER_MS = 180;
/** How long a tower takes to rise to its full height. */
const RISE_MS = 1300;
/** The cut to the ring, as the caption types "They united the world". */
export const CUT_MS = 2200;
/** The ring's windows come on from here, one floor every step, from the street up. */
const LIGHTS_FROM_MS = 2300;
const LIGHT_STEP_MS = 38;
/** "Order returned": every light flashes at once, and the beacons start blinking together. */
export const ORDER_MS = 3120;
const FLASH_FRAMES = 2;
const BLINK_MS = 500;
/** The square appears as "One world. Many partners." starts typing. */
export const LOGO_MS = 4360;
/**
 * The card closes to black from the edges in, onto the square, and is black before card 4 starts:
 * card 4 opens on that black. Under reduced motion it cuts instead.
 */
const CLOSE_MS = 1300;
export const CLOSE_FROM_MS = cardDurationMs(3) - CLOSE_MS - 100;

// ── the first shot: the ruins and the towers ──
/** The bottom of the visible picture: the caption band covers what is below. */
const STREET = 166;
/** Where the ground meets the sky; the towers rise from behind it. */
export const HORIZON = 140;

interface RisingTower {
  readonly left: number;
  readonly width: number;
  readonly height: number;
  /** Its place in the order of rising: 0 first. */
  readonly order: number;
  /** Lit in Absolute Connections teal. */
  readonly ours?: boolean;
}

/** Seven towers, the tallest in the middle and first up, far too tall for the frame. */
const RISING_TOWERS: readonly RisingTower[] = [
  { left: 16, width: 36, height: 112, order: 3 },
  { left: 64, width: 42, height: 150, order: 2 },
  { left: 118, width: 46, height: 186, order: 1 },
  { left: 172, width: 54, height: 250, order: 0, ours: true },
  { left: 238, width: 46, height: 176, order: 1 },
  { left: 296, width: 40, height: 142, order: 2 },
  { left: 346, width: 34, height: 106, order: 3 },
];
/** Every tower has risen by now: the reduced-motion still of the first shot. */
export const RISEN_MS = RISE_FROM_MS + Math.max(...RISING_TOWERS.map((tower) => tower.order)) * RISE_STAGGER_MS + RISE_MS;
/** The crown: the top share of a tower set back this far on each side, under a mast. */
const CROWN_SHARE = 0.16;
const CROWN_INSET = 4;
const MAST = 14;
/** The light comes from the sky behind the towers, so their shadows run towards us. */
const LIGHT_X = 192;
const SHADOW_SPREAD = 70;
const SHADOW_PER_PX = 0.16;

// ── the second shot: the ring, from below ──
/**
 * The middle of the ring: the one sky, where every tower's top points. Its circle is the one
 * inscribed in card 0's square, which appears round it: 72 pixels across, brackets 6 thick.
 */
export const RING_X = 192;
export const RING_Y = 66;
export const SKY_RADIUS = 30;
const RING_TOWERS = 8;
/** The sky showing between two towers, as an angle. */
const GAP = (5 * Math.PI) / 180;
/** The ring turns clockwise, once every this long. */
const TURN_MS = 60_000;
/** Floors per e-fold of distance from the sky: perspective, so floors shrink towards the top. */
const FLOORS = 10;
/** Windows across each face of a tower. */
const COLUMNS = 3;
/** The floor furthest from the sky that the frame shows: the lights start there. */
const LOWEST_FLOOR = 20;

// ── the logo ──
/**
 * The square turns anticlockwise, against the ring, at card 0's pace: one turn every 4.8 seconds,
 * in 64 steps.
 */
const LOGO_TURNS_PER_SECOND = -1.25 / 6;
const LOGO_STEPS = 64;

/** A stable pseudo-random number for a pixel: the same every frame, so nothing shimmers by accident. */
function noise(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const checker = (x: number, y: number) => ((x + y) & 1) === 0;
const frameOf = (timeMs: number) => Math.floor(timeMs / FRAME_MS);

/** A canvas shifted by some pixels: the whole picture, shaking. */
function shifted(canvas: Canvas, dx: number, dy: number): Canvas {
  return {
    timeMs: canvas.timeMs,
    set: (x, y, pixel) => canvas.set(x + dx, y + dy, pixel),
    get: (x, y) => canvas.get(x - dx, y - dy),
  };
}

function paintPicture(canvas: Canvas, picture: Picture, left: number, top: number, mirrored: boolean, colour?: PaletteChar): void {
  for (let v = 0; v < picture.height; v += 1) {
    for (let u = 0; u < picture.width; u += 1) {
      const pixel = picture.pixels[v * picture.width + (mirrored ? picture.width - 1 - u : u)];
      if (pixel) canvas.set(left + u, top + v, colour ?? pixel);
    }
  }
}

// ═══ the first shot ═══

/** A person, far off: a head, shoulders, two legs. */
const PERSON: Picture = parsePicture(
  "card 3 person",
  `
  _._
  ...
  ...
  _._
  _._
  ._.
  ._.
`,
);

/** The people left among the ruins: scattered, still. */
const PEOPLE = Array.from({ length: 30 }, (_, index) => ({
  x: 8 + Math.floor(noise(index, 1) * 368),
  feet: HORIZON + 7 + Math.floor(noise(index, 2) * (STREET - HORIZON - 4)),
}));

/** How far a tower has risen at `t`, in whole 2-pixel steps: chunky, like everything else. */
function risenOf(tower: RisingTower, t: number): number {
  const progress = Math.max(0, Math.min(1, (t - RISE_FROM_MS - tower.order * RISE_STAGGER_MS) / RISE_MS));
  return 2 * Math.floor((tower.height * progress) / 2);
}

const rising = (t: number) => RISING_TOWERS.some((tower) => risenOf(tower, t) > 0 && risenOf(tower, t) < tower.height);

/** Whether the beacons are lit: all of them at once, on the same beat. */
const beaconLit = (t: number) => Math.floor(t / BLINK_MS) % 2 === 0;

/** A tower, dark against the white: a crown, a mast with a beacon, and a grid of lit windows. */
function paintRisingTower(canvas: Canvas, tower: RisingTower, t: number): void {
  const risen = risenOf(tower, t);
  if (risen === 0) return;

  const top = HORIZON - risen;
  const crown = Math.round(tower.height * CROWN_SHARE);
  const centre = tower.left + Math.floor(tower.width / 2);

  for (let y = Math.max(0, top); y < HORIZON; y += 1) {
    const v = y - top;
    const inset = v < crown ? CROWN_INSET : 0;
    const left = tower.left + inset;
    const right = tower.left + tower.width - inset;

    for (let x = left; x < right; x += 1) {
      // The edge facing the sky catches its light; windows on a 4×5 grid, most of them lit.
      const window = v >= 4 && (x - left) % 4 >= 2 && v % 5 < 2 && x < right - 2;
      const lit = window && noise(x >> 2, Math.floor(v / 5) + tower.left) < 0.75;
      canvas.set(x, y, lit ? (tower.ours ? "t" : "p") : x >= right - 2 ? "b" : "n");
    }
  }

  for (let y = top - MAST; y < top; y += 1) canvas.set(centre, y, "n");
  if (beaconLit(t)) {
    canvas.set(centre, top - MAST - 1, "r");
    canvas.set(centre + 1, top - MAST - 1, "r");
  }
}

/** The ruins card 2 left: low, broken, along the horizon. A few still smoulder. */
function paintRuins(canvas: Canvas, t: number): void {
  for (let x = 0; x < 384; x += 1) {
    const block = Math.floor(x / 7);
    const height = 3 + Math.floor(noise(block, 5) * 12) - (noise(x, 6) < 0.3 ? 2 : 0);
    for (let y = HORIZON - height; y < HORIZON + 2; y += 1) canvas.set(x, y, "d");
  }

  const billow = Math.floor(t / 160);
  for (const source of [44, 150, 270, 330]) {
    for (let rise = 0; rise < 30; rise += 1) {
      const y = HORIZON - 10 - rise;
      for (let dx = -3; dx <= 3; dx += 1) {
        const x = source + dx + Math.round(rise * 0.35);
        if (noise(x >> 1, (y >> 1) + billow) < 0.55 - rise / 60 && checker(x, y)) canvas.set(x, y, "g");
      }
    }
  }
}

/** Dust thrown up where a tower forces its way out of the ground, settling once it stops. */
function paintDust(canvas: Canvas, t: number): void {
  for (const tower of RISING_TOWERS) {
    const risen = risenOf(tower, t);
    if (risen === 0) continue;
    const settling = risen === tower.height ? 1 - (t - RISE_FROM_MS - tower.order * RISE_STAGGER_MS - RISE_MS) / 600 : 1;
    if (settling <= 0) continue;

    for (let y = HORIZON - 12; y < HORIZON + 2; y += 1) {
      for (let x = tower.left - 8; x < tower.left + tower.width + 8; x += 1) {
        const puff = noise(x >> 2, (y + Math.floor(t / 60)) >> 2);
        if (puff * settling > 0.45) canvas.set(x, y, checker(x, y) ? "g" : "p");
      }
    }
  }
}

/** The tower's shadow on the ground, running towards us and spreading, as long as it is tall. */
function inShadow(x: number, y: number, t: number): boolean {
  return RISING_TOWERS.some((tower) => {
    const length = risenOf(tower, t) * SHADOW_PER_PX;
    const depth = y - HORIZON;
    if (depth < 0 || depth > length) return false;
    const spread = depth / SHADOW_SPREAD;
    const left = tower.left + (tower.left - LIGHT_X) * spread;
    const right = tower.left + tower.width + (tower.left + tower.width - LIGHT_X) * spread;
    return x >= left && x < right;
  });
}

function paintGround(canvas: Canvas, t: number): void {
  for (let y = HORIZON + 2; y < STREET + 4; y += 1) {
    for (let x = 0; x < 384; x += 1) {
      const shade = inShadow(x, y, t);
      canvas.set(x, y, shade ? "." : noise(x, y) < 0.08 ? "m" : "d");
    }
  }
  for (const person of PEOPLE) {
    const lit = !inShadow(person.x + 1, person.feet - 1, t);
    paintPicture(canvas, PERSON, person.x, person.feet - PERSON.height, false, lit ? "g" : "n");
  }
}

/** The first shot: the towers rise, the ground shakes while they do, and their shadows spread. */
function paintRise(canvas: Canvas, t: number): void {
  for (let y = 0; y < STREET; y += 1) for (let x = 0; x < 384; x += 1) canvas.set(x, y, "w");

  const ground = shifted(canvas, 0, rising(t) && frameOf(t) % 2 === 1 ? 1 : 0);
  for (const tower of RISING_TOWERS) paintRisingTower(ground, tower, t);
  paintDust(ground, t);
  paintRuins(ground, t);
  paintGround(ground, t);
}

// ═══ the second shot ═══

/** How far each tower's top stands from the middle of the sky: not all of them are one height. */
const TOP_RADII = Array.from({ length: RING_TOWERS }, (_, index) => SKY_RADIUS + Math.floor(noise(index, 30) * 9));

/** The floor of a window that lights it up when: the lowest floors first, then up towards the sky. */
const floorLitAt = (floor: number) => LIGHTS_FROM_MS - CUT_MS + (LOWEST_FLOOR - floor) * LIGHT_STEP_MS;

/**
 * The ring of towers, seen from the street between them, looking straight up. Every pixel asks
 * which tower's face it is on, by its angle round the middle and its distance from it: towers are
 * wedges pointing at the sky, the gaps between them thin white rays, and floors shrink towards the
 * top as perspective shrinks them, because they are spaced by the logarithm of the distance.
 */
function paintRing(canvas: Canvas, t: number): void {
  const sector = (2 * Math.PI) / RING_TOWERS;
  const turn = Math.round((t / TURN_MS) * 256) / 256;
  const flash = t >= ORDER_MS - CUT_MS && t < ORDER_MS - CUT_MS + FLASH_FRAMES * FRAME_MS;

  for (let y = 0; y < STREET; y += 1) {
    for (let x = 0; x < 384; x += 1) {
      const dx = x + 0.5 - RING_X;
      const dy = y + 0.5 - RING_Y;
      const r = Math.hypot(dx, dy);
      const angle = (((Math.atan2(dy, dx) / (2 * Math.PI) - turn) % 1) + 1) % 1;
      const index = Math.floor(angle * RING_TOWERS);
      const local = angle * 2 * Math.PI - index * sector;
      const top = TOP_RADII[index]!;

      if (r < top || local < GAP / 2 || local > sector - GAP / 2) {
        canvas.set(x, y, "w");
        continue;
      }

      // Across the tower, from one gap to the next: two faces, meeting at the corner nearest us.
      const across = (local - GAP / 2) / (sector - GAP);
      const near = Math.abs(local - sector / 2) * r < 0.6;
      const left = across < 0.5;
      if (r < top + 2 || near) {
        canvas.set(x, y, "s");
        continue;
      }

      const height = Math.log(r / top) * FLOORS;
      const floor = Math.floor(height);
      const column = ((left ? across : across - 0.5) * 2 * COLUMNS) % 1;
      const isWindow = r > top + 6 && height % 1 > 0.35 && height % 1 < 0.8 && column > 0.25 && column < 0.75;

      if (!isWindow) canvas.set(x, y, left ? "n" : "b");
      else if (t < floorLitAt(floor)) canvas.set(x, y, left ? "." : "n");
      else canvas.set(x, y, flash ? "w" : index === 0 ? "t" : "p");
    }
  }

  // The beacons on the tops, blinking together once order has returned.
  if (t >= ORDER_MS - CUT_MS && beaconLit(t)) {
    for (let index = 0; index < RING_TOWERS; index += 1) {
      const angle = ((index + 0.5) / RING_TOWERS + turn) * 2 * Math.PI;
      const r = TOP_RADII[index]! + 3;
      const bx = Math.round(RING_X + Math.cos(angle) * r);
      const by = Math.round(RING_Y + Math.sin(angle) * r);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) canvas.set(bx + ox - 1, by + oy - 1, "r");
    }
  }
}

/** The second shot, at `t` on its own clock. */
function paintAbove(canvas: Canvas, t: number): void {
  paintRing(canvas, t);
}

// ═══ the scenes ═══

/**
 * A shot from `fromMs` on, painted on the shot's own clock, which started at `shotMs`. A shot is
 * split into scenes at its beats so that under reduced motion each beat is a still of its own.
 */
function shot(paint: (canvas: Canvas, t: number) => void, shotMs: number, fromMs: number): Scene {
  return { fromMs, layers: [{ kind: "painted", paint: (canvas) => paint(canvas, canvas.timeMs + fromMs - shotMs) }] };
}

export const CARD_03_ART: CardArt = {
  scenes: [
    shot(paintRise, 0, 0),
    shot(paintRise, 0, RISEN_MS),
    shot(paintAbove, CUT_MS, CUT_MS),
    // Just after the flash, so the still is the ring lit, not lit white.
    shot(paintAbove, CUT_MS, ORDER_MS + 300),
    // The square, in the middle of the sky, turning on the scene's own clock from the moment it
    // appears: still under reduced motion, square to the frame.
    {
      ...shot(paintAbove, CUT_MS, LOGO_MS),
      layers: [
        ...shot(paintAbove, CUT_MS, LOGO_MS).layers,
        { kind: "rotated", sprite: SQUARE, centreX: RING_X, centreY: RING_Y, turnsPerSecond: LOGO_TURNS_PER_SECOND, stepsPerTurn: LOGO_STEPS },
        closeToBlack(RING_X, RING_Y, CLOSE_FROM_MS - LOGO_MS, CLOSE_MS),
      ],
    },
  ],
};
