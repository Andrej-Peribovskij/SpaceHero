import { parsePicture, type Picture } from "../grid";
import { noise } from "../paint";
import { STEPS_TO_WHITE, type CycleChar } from "../palette";
import { fadeRamp, type Canvas, type CardArt } from "../render";

/**
 * Card 1: the Brightening.
 *
 * Script: "The Sun, filling more of the frame than it should; the palette bleeds toward white."
 * Two pictures, joined by that bleed. The Sun swells until every colour climbs to white; out of
 * the white, a hard cut to a child on bare ground, arm across their eyes, and a light that only
 * rises — eating the child's lit edge — until it whites out again, handing over to card 2's white
 * sky. Chosen by draft (2026-10-01); see design.md §3.
 *
 * The scenery is code (design.md §3, "hybrid"): the numbers worth tweaking are named below. The
 * child is pixel data, and can be redrawn a pixel at a time.
 */

// ── timings, on the card's clock (card 1 lasts about 7 s: its caption typed, then held) ──
/** How long the Sun swells before the bleed to white begins. */
const SWELL_MS = 3000;
/** Each step of a fade, up the brightness ladder. */
const FADE_STEP_MS = 100;
/** The hard cut from white to the child. */
const CUT_MS = 4000;
/** How long the light takes to climb its steps, from the cut. */
const LIGHT_RISE_MS = 2400;
/** The light's steps: it rises in jumps, not smoothly. */
const LIGHT_STEPS = 4;
/** When the last fade to white begins: done before the card ends, so card 2 opens on white. */
const HANDOVER_MS = 6400;

// ── the Sun ──
const SUN_X = 214;
const SUN_Y = 92;
/** Its radius at the start, and how much it grows: in 2-pixel steps, chunky like everything else. */
const SUN_RADIUS = 46;
const SUN_GROWTH_STEPS = 9;
/** The flickering corona's width, and the dithered red halo's reach beyond it. */
const CORONA = 5;
const HALO = 14;

// ── the child's scene ──
/** The ground line: the child stands on it, the shadow lies along it. */
const GROUND = 151;
/** Where the light comes from: off the frame, upper right. */
const LIGHT_X = 420;
const LIGHT_Y = -60;

const STARS = Array.from({ length: 140 }, (_, index) => ({
  x: Math.floor(noise(index, 1) * 384),
  y: Math.floor(noise(index, 2) * 120),
  colour: noise(index, 3) < 0.5 ? ("b" as const) : ("s" as const),
  /** How far into the swell the star is drowned out by the glow. */
  fadesAt: noise(index, 4),
}));

const FLICKER: readonly CycleChar[] = ["7", "8", "9"];

/** Scene 1: night, and a Sun far too big, swelling. The bleed to white is the fade schedule's. */
function paintSun(canvas: Canvas): void {
  const swell = Math.min(1, canvas.timeMs / SWELL_MS);

  // The sky warms upward as the Sun swells: dusk violet climbing, then a dithered rust horizon.
  for (let y = 0; y < 216; y += 1) {
    for (let x = 0; x < 384; x += 1) {
      const band = y / 216 + swell * 0.35;
      if (band > 0.85 && ((x + y) & 1) === 0) canvas.set(x, y, "m");
      else if (band > 0.55) canvas.set(x, y, "k");
      else canvas.set(x, y, "n");
    }
  }
  for (const star of STARS) if (star.fadesAt > swell * 0.9) canvas.set(star.x, star.y, star.colour);

  const radius = SUN_RADIUS + 2 * Math.floor(swell * SUN_GROWTH_STEPS);
  const reach = radius + CORONA + HALO;

  for (let y = SUN_Y - reach; y <= SUN_Y + reach; y += 1) {
    for (let x = SUN_X - reach; x <= SUN_X + reach; x += 1) {
      const d = Math.hypot(x - SUN_X, y - SUN_Y);

      if (d <= radius * 0.55) canvas.set(x, y, "w");
      else if (d <= radius * 0.78) canvas.set(x, y, "y");
      else if (d <= radius * 0.94) canvas.set(x, y, "Y");
      else if (d <= radius) canvas.set(x, y, "o");
      else if (d <= radius + CORONA) {
        // The corona flickers: fire cycles, out of phase pixel by pixel.
        if (noise(x, y) < 0.45) canvas.set(x, y, FLICKER[Math.floor(noise(y, x) * FLICKER.length)]!);
      } else if (d <= reach && ((x + y) & 1) === 0 && noise(x, y) < 0.6 - (d - radius - CORONA) / HALO) {
        canvas.set(x, y, "r"); // the halo, dithered into the sky
      }
    }
  }
}

/**
 * The child, shielding their eyes. Facing the light, right; a small bun at the back of the head;
 * one arm raised, the forearm across the eyes, the other hanging. `.` is the child, `_` is not.
 */
const CHILD: Picture = parsePicture(
  "card 1 child",
  `
  ____________.......______________________________
  __________...........____________________________
  ________.............____________________________
  _______..............____________________________
  ______...............____________________________
  _____................____________________________
  _____..................__________________________
  ____......................_______________________
  ____........................_____________________
  ___..........................____________________
  ___...........................___________________
  ___............................__________________
  ___............................__________________
  ___............................._________________
  ___..............................._______________
  __.................................._____________
  _.....................................___________
  ........................................_________
  .........................................._______
  ............................................_____
  ..............................................___
  ................................................_
  _..............................................._
  __...............................___.............
  ___.............................._____...........
  ______..........................._____.........._
  _______........................._____..........._
  _______.........................____...........__
  ________.......................____...........___
  _________.....................____...........____
  __________...................____..........._____
  ___________.................____...........______
  ___________.................___..........._______
  ___________.................__...........________
  ___________................._..........._________
  ________...............................__________
  _______...............................___________
  ______...............................____________
  ______.............................._____________
  ______.............................______________
  ______............................_______________
  _____............................________________
  _____..........................__________________
  _____........................____________________
  _____........................____________________
  ____.........................____________________
  ____.........................____________________
  ____.........................____________________
  ____.........................____________________
  ____.........................____________________
  ___...........................___________________
  ___...........................___________________
  ___...........................___________________
  ___...........................___________________
  ___...........................___________________
  __............................___________________
  __............................___________________
  __............................___________________
  __............................___________________
  _.............................___________________
  _.............................___________________
  _.............................___________________
  _......._.....................___________________
  _......._.....................___________________
  _......._.....................___________________
  __....._.......................__________________
  ___...__.......................__________________
  ________.......................__________________
  _________.....................___________________
  _________.....................___________________
  _________.....................___________________
  _________.....................___________________
  _________.....................___________________
  _________.....................___________________
  _________.....................___________________
  _________......................__________________
  _________......................__________________
  _________......................__________________
  _________........_____.........__________________
  _________........_____.........__________________
  _________........______........__________________
  _________........______........__________________
  _________........______........__________________
  _________........______........__________________
  ________.........______........__________________
  ________.........______........__________________
  ________.........______........__________________
  ________.........______........._________________
  ________.........______........._________________
  ________.........______........._________________
  ________.........______........._________________
  ________........._______........_________________
  ________........._______........_________________
  ________........._______........_________________
  ________........________........_________________
  ________........________........_________________
  ________........________........_________________
  ________........________........_________________
  ________........________.........________________
  ________........________.........________________
  ________........________.........________________
  ________........________.........________________
`,
);

/** Where the child stands: their feet on the ground line. */
const CHILD_LEFT = 100;
const CHILD_TOP = GROUND - CHILD.height;

function isChild(x: number, y: number): boolean {
  const u = x - CHILD_LEFT;
  const v = y - CHILD_TOP;
  return u >= 0 && v >= 0 && u < CHILD.width && v < CHILD.height && CHILD.pixels[v * CHILD.width + u] !== null;
}

/** Scene 2: bare ground under a blinding sky, and a child. The light only ever climbs. */
function paintLight(canvas: Canvas): void {
  const step = Math.min(LIGHT_STEPS - 1, Math.floor((canvas.timeMs / LIGHT_RISE_MS) * LIGHT_STEPS));

  for (let y = 0; y < 216; y += 1) {
    for (let x = 0; x < 384; x += 1) {
      // White at the light's heart, then pale, then a dithered edge to the yellow sky. Each step
      // pushes every boundary further from the light.
      const d = Math.hypot(x - LIGHT_X, y - LIGHT_Y) / 470 - step * 0.09;

      if (y >= GROUND) canvas.set(x, y, (x * 7 + y * 3) % 11 === 0 ? "m" : "d");
      else if (d < 0.62) canvas.set(x, y, "w");
      else if (d < 0.8 || (d < 0.9 && ((x + y) & 1) === 0)) canvas.set(x, y, "y");
      else canvas.set(x, y, "Y");
    }
  }

  // The long shadow, thrown away from the light, dithered where it thins out.
  for (let x = 40; x < CHILD_LEFT + 14; x += 1) {
    for (let y = GROUND; y < GROUND + 5; y += 1) if (x > 70 || (x + y) % 2 === 0) canvas.set(x, y, "n");
  }

  // The child stays dark. The light eats its lit edge instead, one more pixel each step.
  for (let y = CHILD_TOP; y < GROUND; y += 1) {
    for (let x = CHILD_LEFT; x < CHILD_LEFT + CHILD.width; x += 1) {
      if (!isChild(x, y)) continue;
      const lit = !isChild(x + 1 + step, y) || !isChild(x + step, y - 1 - step);
      canvas.set(x, y, lit ? (step >= LIGHT_STEPS - 1 ? "w" : "y") : ".");
    }
  }
}

export const CARD_01_ART: CardArt = {
  scenes: [
    { fromMs: 0, layers: [{ kind: "painted", paint: paintSun }] },
    { fromMs: CUT_MS, layers: [{ kind: "painted", paint: paintLight }] },
  ],
  fade: [
    // The Sun bleeds to white, a step at a time, and the white holds.
    ...fadeRamp(SWELL_MS, FADE_STEP_MS, 1, STEPS_TO_WHITE),
    // The hard cut: the child's scene at its dimmest, no fade.
    { atMs: CUT_MS, steps: 0 },
    // The hand-over: up to white again, so card 2 opens on its white sky.
    ...fadeRamp(HANDOVER_MS, FADE_STEP_MS, 1, STEPS_TO_WHITE),
  ],
};
