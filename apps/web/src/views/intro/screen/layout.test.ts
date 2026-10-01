import { layoutCaption, type CaptionLine } from "./layout";

const text = (line: CaptionLine) => line.map((placed) => placed.char).join("");

describe("layoutCaption", () => {
  it("wraps whole words to the column width", () => {
    const lines = layoutCaption([{ text: "Nations argued. Nations fought." }], 16);

    expect(lines.map(text)).toEqual(["Nations argued.", "Nations fought."]);
  });

  it("breaks where the caption says, for the idents' two-line titles", () => {
    const lines = layoutCaption([{ text: "ABSOLUTE CONNECTIONS\nModule 1 of 14: " }, { text: "Where", emphasis: true }], 46);

    expect(lines.map(text)).toEqual(["ABSOLUTE CONNECTIONS", "Module 1 of 14: Where"]);
  });

  it("keeps each character's place in the caption, so typing reveals it in order", () => {
    const [first, second] = layoutCaption([{ text: "ab cd" }], 2);

    expect(first!.map((placed) => placed.index)).toEqual([0, 1]);
    expect(second!.map((placed) => placed.index)).toEqual([3, 4]);
  });

  it("carries emphasis per character across segments", () => {
    const [line] = layoutCaption([{ text: "One " }, { text: "world", emphasis: true }], 46);

    expect(line!.map((placed) => placed.emphasis)).toEqual([false, false, false, false, true, true, true, true, true]);
  });

  it("splits a word longer than a line rather than overflowing the screen", () => {
    expect(layoutCaption([{ text: "abcdefg" }], 3).map(text)).toEqual(["abc", "def", "g"]);
  });

  it("lays out an empty caption as no lines", () => {
    expect(layoutCaption([], 46)).toEqual([]);
  });
});
