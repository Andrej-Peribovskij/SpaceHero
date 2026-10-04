import { FRAME_HEIGHT, FRAME_WIDTH } from "../art/grid";
import { ease } from "../art/paint";
import { STEPS_TO_WHITE, brighter, type PaletteChar } from "../art/palette";
import { FRAME_MS } from "../art/render";

/**
 * Joe's punch, on the screen: the monitor dies the way an old cathode-ray tube did. The picture
 * squeezes to a bright line across the middle, flaring towards white as it goes, the line shrinks
 * to a dot, and the dot goes out. The whole screen dies, caption and prompt with it: the set is
 * switched off, not the picture.
 *
 * A pure function of the frame and the time since the punch, stepped at the video's 12 frames a
 * second like everything else on the screen. Under reduced motion there is no collapse and no
 * flare: the screen is simply black from the punch on.
 */

// Two frames each, at the video's 12 a second: the picture squeezing to a line, the line shrinking
// to a dot, and the dot going out.
const SQUEEZE_MS = 2 * FRAME_MS;
const LINE_MS = 2 * FRAME_MS;
const DOT_MS = 2 * FRAME_MS;

/** How long until the screen is black: inside card 10's power-off, which ends the video. */
export const DEAD_MS = SQUEEZE_MS + LINE_MS + DOT_MS;

const CENTRE_X = Math.floor(FRAME_WIDTH / 2);
const CENTRE_Y = Math.floor(FRAME_HEIGHT / 2);

/** The screen `sinceMs` after the punch. */
export function powerOffScreen(frame: readonly PaletteChar[], sinceMs: number, still = false): PaletteChar[] {
  const dead = new Array<PaletteChar>(FRAME_WIDTH * FRAME_HEIGHT).fill(".");
  // Stepped at the video's frame rate, as the art and the glitch are.
  const ms = Math.floor(sinceMs / FRAME_MS + 1e-6) * FRAME_MS;

  if (still || ms >= DEAD_MS) return dead;

  if (ms < SQUEEZE_MS) {
    // Already squeezing on the frame the fist lands: a third of the way, then two thirds.
    const progress = ease((ms + FRAME_MS) / (SQUEEZE_MS + FRAME_MS));
    const height = Math.max(1, Math.round(FRAME_HEIGHT * (1 - progress)));
    const top = CENTRE_Y - Math.floor(height / 2);
    const flare = Math.round(progress * STEPS_TO_WHITE);
    for (let row = 0; row < height; row += 1) {
      const from = Math.min(FRAME_HEIGHT - 1, Math.floor(((row + 0.5) / height) * FRAME_HEIGHT));
      for (let x = 0; x < FRAME_WIDTH; x += 1) {
        dead[(top + row) * FRAME_WIDTH + x] = brighter(frame[from * FRAME_WIDTH + x]!, flare);
      }
    }
    return dead;
  }

  if (ms < SQUEEZE_MS + LINE_MS) {
    const half = Math.max(1, Math.round((FRAME_WIDTH / 2) * (1 - ease((ms - SQUEEZE_MS) / LINE_MS))));
    for (let x = CENTRE_X - half; x < CENTRE_X + half; x += 1) {
      // The ends of the line are dimmer than its middle, as a beam's are.
      dead[CENTRE_Y * FRAME_WIDTH + x] = Math.abs(x - CENTRE_X) > half * 0.8 ? "p" : "w";
    }
    return dead;
  }

  const radius = 1 - (ms - SQUEEZE_MS - LINE_MS) / DOT_MS;
  dead[CENTRE_Y * FRAME_WIDTH + CENTRE_X] = "w";
  if (radius > 0.75) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      dead[(CENTRE_Y + dy) * FRAME_WIDTH + CENTRE_X + dx] = "p";
    }
  }
  return dead;
}
