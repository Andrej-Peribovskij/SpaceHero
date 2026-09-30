import { FRAME_HEIGHT, FRAME_WIDTH, parseBackground, parseFrames, parseSprite } from "./grid";

const row = (char = ".") => char.repeat(FRAME_WIDTH);
const grid = (rows: string[]) => `\n${rows.join("\n")}\n`;

describe("parseBackground", () => {
  it("reads a full frame, indented or not", () => {
    const rows = Array.from({ length: FRAME_HEIGHT }, () => row());
    rows[3] = "t" + row().slice(1);

    const background = parseBackground("test", grid(rows.map((line) => `    ${line}`)));

    expect(background.pixels).toHaveLength(FRAME_WIDTH * FRAME_HEIGHT);
    expect(background.pixels[3 * FRAME_WIDTH]).toBe("t");
    expect(background.pixels[0]).toBe(".");
  });

  it("accepts a colour cycle as a pixel", () => {
    const rows = Array.from({ length: FRAME_HEIGHT }, () => row());
    rows[0] = "1" + row().slice(1);

    expect(parseBackground("test", grid(rows)).pixels[0]).toBe("1");
  });

  it("names the art when the row count is wrong", () => {
    expect(() => parseBackground("card 3", grid([row(), row()]))).toThrow("card 3: expected 54 rows, found 2");
  });

  it("names the row when a row is the wrong width", () => {
    const rows = Array.from({ length: FRAME_HEIGHT }, () => row());
    rows[9] = row().slice(1);

    expect(() => parseBackground("card 3", grid(rows))).toThrow("card 3, row 10: expected 96 pixels, found 95");
  });

  it("names the row and column of an unknown character", () => {
    const rows = Array.from({ length: FRAME_HEIGHT }, () => row());
    rows[1] = "..Z" + row().slice(3);

    expect(() => parseBackground("card 3", grid(rows))).toThrow(
      'card 3, row 2, column 3: "Z" is not a palette colour or a cycle',
    );
  });

  it("refuses a transparent pixel: a background has no nothing", () => {
    const rows = Array.from({ length: FRAME_HEIGHT }, () => row());
    rows[0] = "_" + row().slice(1);

    expect(() => parseBackground("card 3", grid(rows))).toThrow('"_" is not a palette colour or a cycle');
  });
});

describe("parseSprite", () => {
  it("reads a square with transparent pixels", () => {
    const sprite = parseSprite("dot", grid(["_w_", "www", "_w_"]));

    expect(sprite.size).toBe(3);
    expect(sprite.pixels).toEqual([null, "w", null, "w", "w", "w", null, "w", null]);
  });

  it("reads a flipbook's frames, separated by blank lines", () => {
    const frames = parseFrames("dots", grid(["  w_", "  __", "", "  _w", "  __"]));

    expect(frames.map((frame) => frame.pixels)).toEqual([
      ["w", null, null, null],
      [null, "w", null, null],
    ]);
  });

  it("names the frame when a flipbook's frames differ in size", () => {
    expect(() => parseFrames("dots", grid(["w_", "__", "", "www", "www", "www"]))).toThrow(
      "dots, frame 2: expected 2×2 like frame 1, found 3×3",
    );
  });

  it("refuses a sprite that is not square", () => {
    expect(() => parseSprite("bar", grid(["www", "www"]))).toThrow("bar, row 1: expected 2 pixels, found 3");
  });
});
