import { GLYPH_COLUMNS, GLYPH_ROWS, parseFont } from "./glyphs";

const glyph = (label: string, rows: string[]) => `[${label}]\n${rows.join("\n")}`;
const blank = Array.from({ length: GLYPH_ROWS }, () => ".".repeat(GLYPH_COLUMNS));

describe("parseFont", () => {
  it("reads labelled glyphs, including space", () => {
    const dot = [...blank];
    dot[0] = "#" + ".".repeat(GLYPH_COLUMNS - 1);

    const font = parseFont([glyph("i", dot), glyph("space", blank)].join("\n\n"));

    expect(font.get("i")?.[0]).toBe(true);
    expect(font.get("i")?.filter(Boolean)).toHaveLength(1);
    expect(font.get(" ")?.some(Boolean)).toBe(false);
  });

  it("names the glyph with the wrong number of rows", () => {
    expect(() => parseFont(glyph("a", blank.slice(1)))).toThrow(`font [a]: expected ${GLYPH_ROWS} rows, found ${GLYPH_ROWS - 1}`);
  });

  it("names the glyph and row with a bad pixel", () => {
    const rows = [...blank];
    rows[2] = "..x....";

    expect(() => parseFont(glyph("a", rows))).toThrow('font [a], row 3: expected 7 of "#" or ".", found "..x...."');
  });

  it("refuses a character drawn twice", () => {
    expect(() => parseFont([glyph("a", blank), glyph("a", blank)].join("\n\n"))).toThrow("font [a]: drawn twice");
  });
});
