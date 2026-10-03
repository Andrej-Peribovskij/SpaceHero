import { FRAME_HEIGHT, FRAME_WIDTH, parseBackground, parseFrames, parseSprite } from "./grid";
import { CYCLE_STEP_MS, CYCLES, STEPS_TO_WHITE } from "./palette";
import { FRAME_MS, fadeRamp, frameTime, renderFrame, singleScene, stillKey, writeRgba, type CardArt } from "./render";

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
  return singleScene(
    { kind: "grid", background },
    { kind: "rotated", sprite: marker, centreX: 48, centreY: 27, turnsPerSecond, stepsPerTurn },
  );
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
  return singleScene(
    { kind: "grid", background },
    { kind: "flipbook", frames, centreX: 48, centreY: 27, turnsPerSecond, stepsPerTurn: 3 },
  );
}

describe("palette cycling", () => {
  it("changes a cycle's colour over time without moving it", () => {
    const art: CardArt = singleScene({ kind: "grid", background });
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

describe("scenes and fades", () => {
  const white = parseBackground("white", Array.from({ length: FRAME_HEIGHT }, () => "w".repeat(FRAME_WIDTH)).join("\n"));
  const cut: CardArt = {
    scenes: [
      { fromMs: 0, layers: [{ kind: "grid", background }] },
      { fromMs: 1000, layers: [{ kind: "grid", background: white }] },
    ],
  };

  it("cuts from one scene to the next on cue", () => {
    expect(at(renderFrame(cut, 999), 5, 5)).toBe(".");
    expect(at(renderFrame(cut, 1000), 5, 5)).toBe("w");
  });

  it("runs each scene on its own clock, from 0 at its cut", () => {
    const twinkleAt = (art: CardArt, time: number) => at(renderFrame(art, time), 0, 0);
    const late: CardArt = {
      scenes: [
        { fromMs: 0, layers: [{ kind: "grid", background: white }] },
        { fromMs: 5 * CYCLE_STEP_MS, layers: [{ kind: "grid", background }] },
      ],
    };

    expect(twinkleAt(late, 5 * CYCLE_STEP_MS)).toBe(CYCLES["1"].colours[0]);
  });

  it("steps every colour brighter on the fade's schedule", () => {
    const fading: CardArt = { ...singleScene({ kind: "grid", background }), fade: fadeRamp(1000, 100, 1, STEPS_TO_WHITE) };

    expect(at(renderFrame(fading, 999), 5, 5)).toBe(".");
    expect(at(renderFrame(fading, 1000), 5, 5)).toBe("n");
    expect(new Set(renderFrame(fading, 1000 + 100 * (STEPS_TO_WHITE - 1)))).toEqual(new Set(["w"]));
  });

  it("writes a fade ramp one step at a time, either way", () => {
    expect(fadeRamp(100, 50, 1, 3)).toEqual([
      { atMs: 100, steps: 1 },
      { atMs: 150, steps: 2 },
      { atMs: 200, steps: 3 },
    ]);
    expect(fadeRamp(0, 10, 2, 0).map((key) => key.steps)).toEqual([2, 1, 0]);
  });

  it("holds still under reduced motion, while scenes still cut on cue", () => {
    expect(renderFrame(artTurning(1), 250, { still: true })).toEqual(renderFrame(artTurning(1), 0));
    expect(at(renderFrame(cut, 1000, { still: true }), 5, 5)).toBe("w");
  });

  it("tells a still screen when to repaint: on a cut or a fade step, not otherwise", () => {
    expect(stillKey(cut, 0)).toBe(stillKey(cut, 999));
    expect(stillKey(cut, 1000)).not.toBe(stillKey(cut, 999));
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
