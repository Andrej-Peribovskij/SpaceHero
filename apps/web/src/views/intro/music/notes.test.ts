import { frequencyOf, parseLine } from "./notes";

describe("frequencyOf", () => {
  it.each([
    ["A4", 440],
    ["A3", 220],
    ["A5", 880],
    ["C4", 261.63],
    ["A#4", 466.16],
    ["D2", 73.42],
  ])("tunes %s to %d Hz", (name, hertz) => {
    expect(frequencyOf(name)).toBeCloseTo(hertz, 2);
  });

  it.each(["Bb4", "H4", "A", "a4", "A10", ""])("refuses %j, which is not in the notation", (name) => {
    expect(() => frequencyOf(name)).toThrow(/not a note/i);
  });
});

describe("parseLine", () => {
  it("starts a note on its token and holds it through each dash", () => {
    expect(parseLine("D4 - - A3")).toEqual([
      { step: 0, steps: 3, frequency: frequencyOf("D4") },
      { step: 3, steps: 1, frequency: frequencyOf("A3") },
    ]);
  });

  it("leaves a rest silent, and a note after it starts where it stands", () => {
    expect(parseLine(". . E4 -")).toEqual([{ step: 2, steps: 2, frequency: frequencyOf("E4") }]);
  });

  it("reads bars joined across line breaks and runs of spaces", () => {
    expect(parseLine("C4  -\n  -   .")).toEqual([{ step: 0, steps: 3, frequency: frequencyOf("C4") }]);
  });

  it.each(["- C4", "C4 . -"])("refuses %j: a hold with nothing sounding is a typo", (line) => {
    expect(() => parseLine(line)).toThrow(/holds a note/);
  });
});
