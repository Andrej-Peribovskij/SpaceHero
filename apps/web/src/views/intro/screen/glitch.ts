import { FRAME_HEIGHT, FRAME_WIDTH } from "../art/grid";
import type { PaletteChar } from "../art/palette";
import { FRAME_MS } from "../art/render";

/**
 * The Ganymede glitch (design.md §6): the one place the video visibly hides something. As the line
 * "Ganymede was found unsuitable." finishes typing, the whole screen tears for exactly two of its
 * 12-fps frames — bands of rows thrown sideways, some smeared down from one row, some in the wrong
 * colours — and then the video goes on as if nothing happened.
 *
 * It is a pure function of the frame and which glitched frame it is, so the two frames are the
 * same every time and a test can hold them. Under reduced motion it never fires: the music's
 * drop-out (slice 3) carries the moment alone.
 */

/** How many frames the screen stays torn. */
export const GLITCH_FRAMES = 2;

/** A little slack for frame times that arrive as a float a hair off a whole frame. */
const EPSILON = 1e-6;

/**
 * Which glitched frame the screen shows at `timeMs` — 0 or 1 — or `undefined` when none. The first
 * is the first 12-fps frame at or after `atMs`, the moment the line finishes typing.
 */
export function glitchFrameAt(atMs: number, timeMs: number): number | undefined {
  const first = Math.ceil(atMs / FRAME_MS - EPSILON);
  const index = Math.floor(timeMs / FRAME_MS + EPSILON) - first;
  return index >= 0 && index < GLITCH_FRAMES ? index : undefined;
}

/** A broken colour signal: every colour shows as another. */
const SWAPPED: Readonly<Record<PaletteChar, PaletteChar>> = {
  ".": "t",
  n: "k",
  b: "r",
  s: "Y",
  p: "m",
  w: "t",
  y: "s",
  Y: "b",
  o: "t",
  r: "n",
  m: "p",
  d: "s",
  t: "r",
  g: "Y",
  a: "k",
  k: "o",
};

/** A stable pseudo-random number: the same for the same arguments, every time. */
function noise(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The screen torn: cut into bands of rows, each band shown as it is, thrown sideways (wrapping
 * round), smeared down from its first row, or in swapped colours. `which` picks the glitched frame,
 * so the two frames tear differently.
 */
export function glitchScreen(frame: readonly PaletteChar[], which: number): PaletteChar[] {
  const torn = frame.slice();
  let top = 0;

  for (let band = 0; top < FRAME_HEIGHT; band += 1) {
    const height = 2 + Math.floor(noise(which + 1, band * 4) * 16);
    const roll = noise(which + 1, band * 4 + 1);
    const shift = roll < 0.3 ? 0 : Math.round((noise(which + 1, band * 4 + 2) - 0.5) * 140);
    const smear = roll >= 0.62 && roll < 0.78;
    const swap = roll >= 0.78;

    for (let y = top; y < Math.min(FRAME_HEIGHT, top + height); y += 1) {
      const source = smear ? top : y;
      for (let x = 0; x < FRAME_WIDTH; x += 1) {
        const from = frame[source * FRAME_WIDTH + ((((x - shift) % FRAME_WIDTH) + FRAME_WIDTH) % FRAME_WIDTH)]!;
        torn[y * FRAME_WIDTH + x] = swap ? SWAPPED[from] : from;
      }
    }
    top += height;
  }

  return torn;
}
