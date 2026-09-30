import { FRAME_WIDTH } from "../grid";
import { renderFrame } from "../render";
import { CARD_00_ART } from "./card-00";

const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];

/** The logo sits in the middle; everything further than this from (48, 27) is sky. */
const inSky = (index: number) => Math.hypot((index % FRAME_WIDTH) - 48, Math.floor(index / FRAME_WIDTH) - 27) > 19;

describe("card 0: the Absolute Connections ident", () => {
  it("shows the logo at rest at time 0: four coloured corners around a white dial", () => {
    const frame = renderFrame(CARD_00_ART, 0);

    expect([at(frame, 36, 15), at(frame, 59, 15), at(frame, 36, 38), at(frame, 59, 38)]).toEqual(["t", "Y", "r", "s"]);
    expect([at(frame, 47, 26), at(frame, 48, 27)]).toEqual(["w", "w"]);
  });

  it("turns the square clockwise: an eighth of a turn later its corners point up, right, down, left", () => {
    // The square turns once per 4.8 s, so an eighth of a turn takes 0.6 s. Clockwise carries the
    // top-left teal corner to the top, yellow to the right, steel blue down and red to the left.
    const frame = renderFrame(CARD_00_ART, 600);

    expect(at(frame, 36, 15)).not.toBe("t");
    expect([at(frame, 47, 11), at(frame, 62, 26), at(frame, 47, 41), at(frame, 32, 26)]).toEqual(["t", "Y", "s", "r"]);
  });

  it("twinkles the stars while their positions stay put", () => {
    const early = renderFrame(CARD_00_ART, 0);
    const later = renderFrame(CARD_00_ART, 280);
    const sky = early.map((_, index) => index).filter(inSky);

    const changed = sky.filter((index) => early[index] !== later[index]);
    const lit = (frame: string[]) => sky.filter((index) => frame[index] !== ".");

    expect(changed.length).toBeGreaterThan(0);
    expect(lit(later)).toEqual(lit(early));
  });
});
