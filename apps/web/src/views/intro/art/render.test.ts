import { FRAME_HEIGHT, FRAME_WIDTH, parseBackground, parseFrames, parseSprite } from "./grid";
import { CYCLE_STEP_MS, CYCLES } from "./palette";
import { FRAME_MS, frameTime, renderFrame, writeRgba, type CardArt } from "./render";

/** A black frame with one twinkling star at (0, 0). */
const background = parseBackground(
  "test",
  ["1" + ".".repeat(FRAME_WIDTH - 1), ...Array.from({ length: FRAME_HEIGHT - 1 }, () => ".".repeat(FRAME_WIDTH))].join(
    "\n",
  ),
);

/** A 4×4 sprite, transparent but for one red pixel in its top-left corner: a turn shows where it went. */
const marker = parseSprite("marker", ["r___", "____", "____", "____"].join("\n"));

const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];

/** Turning about (48, 27): the sprite covers x 46–49, y 25–28 at rest. */
function artTurning(turnsPerSecond: number, stepsPerTurn = 64): CardArt {
  return { background, layers: [{ kind: "rotated", sprite: marker, centreX: 48, centreY: 27, turnsPerSecond, stepsPerTurn }] };
}

/** Three 2×2 frames, each lighting a different corner, centred on (48, 27): x 47–48, y 26–27. */
const frames = parseFrames(
  "corners",
  `
  r_
  __

  _r
  __

  __
  _r
`,
);

/** A flipbook stepping once per second: 1 turn per 3 s over 3 steps. */
function flipbook(turnsPerSecond: number): CardArt {
  return { background, layers: [{ kind: "flipbook", frames, centreX: 48, centreY: 27, turnsPerSecond, stepsPerTurn: 3 }] };
}

describe("palette cycling", () => {
  it("changes a cycle's colour over time without moving it", () => {
    const art: CardArt = { background, layers: [] };
    const colours = [0, 1, 2, 3].map((step) => at(renderFrame(art, step * CYCLE_STEP_MS), 0, 0));

    expect(colours).toEqual(CYCLES["1"].colours.slice(0, 4));
  });
});

describe("rotating sprites", () => {
  it("draws the sprite unturned at time 0", () => {
    const frame = renderFrame(artTurning(1), 0);

    expect(at(frame, 46, 25)).toBe("r");
  });

  it("turns clockwise a quarter at a quarter turn", () => {
    // A quarter turn clockwise carries the top-left corner to the top-right.
    const frame = renderFrame(artTurning(1), 250);

    expect(at(frame, 49, 25)).toBe("r");
    expect(at(frame, 46, 25)).toBe(".");
  });

  it("turns anticlockwise when the speed is negative", () => {
    // A quarter turn anticlockwise carries the top-left corner to the bottom-left.
    const frame = renderFrame(artTurning(-1), 250);

    expect(at(frame, 46, 28)).toBe("r");
  });

  it("rounds the angle to its steps: four steps never show a diagonal", () => {
    // At an eighth of a turn, four steps per turn rounds to a whole quarter or to none.
    const frame = renderFrame(artTurning(1, 4), 125 - 1);

    expect(at(frame, 46, 25)).toBe("r");
  });

  it("leaves the background showing through transparent pixels", () => {
    const frame = renderFrame(artTurning(1), 0);

    expect(at(frame, 47, 25)).toBe(".");
    expect(frame.filter((pixel) => pixel === "r")).toHaveLength(1);
  });
});

describe("flipbooks", () => {
  it("shows frame 1 at time 0, drawn pixel for pixel about the centre", () => {
    const frame = renderFrame(flipbook(1 / 3), 0);

    expect(at(frame, 47, 26)).toBe("r");
    expect(frame.filter((pixel) => pixel === "r")).toHaveLength(1);
  });

  it("moves on one frame per step when turning clockwise", () => {
    expect(at(renderFrame(flipbook(1 / 3), 1000), 48, 26)).toBe("r");
    expect(at(renderFrame(flipbook(1 / 3), 2000), 48, 27)).toBe("r");
  });

  it("wraps round to frame 1 after the last", () => {
    expect(at(renderFrame(flipbook(1 / 3), 3000), 47, 26)).toBe("r");
  });

  it("runs backwards when turning anticlockwise", () => {
    // One step anticlockwise from frame 1 is the last frame.
    expect(at(renderFrame(flipbook(-1 / 3), 1000), 48, 27)).toBe("r");
  });
});

describe("frames", () => {
  it("steps time at 12 frames a second", () => {
    expect(frameTime(0)).toBe(0);
    expect(frameTime(FRAME_MS - 1)).toBe(0);
    expect(frameTime(FRAME_MS + 1)).toBe(FRAME_MS);
  });

  it("writes opaque RGBA for every pixel", () => {
    const target = new Uint8ClampedArray(FRAME_WIDTH * FRAME_HEIGHT * 4);

    writeRgba(renderFrame(artTurning(1), 0), target);

    expect([...target.slice(0, 4)]).toEqual([0x1f, 0x2f, 0x5c, 255]);
    expect(target.every((byte, index) => index % 4 !== 3 || byte === 255)).toBe(true);
  });
});
