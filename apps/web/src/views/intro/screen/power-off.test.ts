import { FRAME_HEIGHT, FRAME_WIDTH } from "../art/grid";
import type { PaletteChar } from "../art/palette";
import { FRAME_MS } from "../art/render";
import { POWER_OFF_MS } from "../intro-timeline";
import { DEAD_MS, powerOffScreen } from "./power-off";

/** A screen with something on every row: a mid blue, so a flare towards white shows. */
const PICTURE: readonly PaletteChar[] = new Array<PaletteChar>(FRAME_WIDTH * FRAME_HEIGHT).fill("b");

const litRows = (frame: readonly PaletteChar[]) =>
  Array.from({ length: FRAME_HEIGHT }, (_, y) => y).filter((y) => frame.slice(y * FRAME_WIDTH, (y + 1) * FRAME_WIDTH).some((pixel) => pixel !== "."));
const lit = (frame: readonly PaletteChar[]) => frame.filter((pixel) => pixel !== ".").length;

describe("powerOffScreen", () => {
  /** The screen on the `frame`th 12-fps frame after the punch, a little into it. */
  const onFrame = (frame: number, still = false) => powerOffScreen(PICTURE, (frame + 0.5) * FRAME_MS, still);

  it("squeezes the picture into fewer rows from the frame the fist lands, flaring towards white", () => {
    const heights = [0, 1].map((frame) => litRows(onFrame(frame)).length);

    expect(heights[0]).toBeLessThan(FRAME_HEIGHT);
    expect(heights[1]).toBeLessThan(heights[0]!);
    expect(onFrame(1)).not.toContain("b");
  });

  it("becomes a single bright line across the middle, which shrinks", () => {
    const middle = [Math.floor(FRAME_HEIGHT / 2)];

    expect(litRows(onFrame(2))).toEqual(middle);
    expect(litRows(onFrame(3))).toEqual(middle);
    expect(lit(onFrame(3))).toBeLessThan(lit(onFrame(2)));
  });

  it("ends as a dot, which goes out", () => {
    expect(lit(onFrame(4))).toBe(5);
    expect(lit(onFrame(5))).toBe(1);
    expect(lit(onFrame(6))).toBe(0);
  });

  it("is black for good once the dot is out, inside the time card 10 gives it", () => {
    expect(lit(powerOffScreen(PICTURE, DEAD_MS))).toBe(0);
    expect(lit(powerOffScreen(PICTURE, 60_000))).toBe(0);
    expect(DEAD_MS).toBeLessThan(POWER_OFF_MS);
  });

  it("under reduced motion, is black at once: no collapse and no flare", () => {
    expect(lit(powerOffScreen(PICTURE, 0, true))).toBe(0);
  });
});
