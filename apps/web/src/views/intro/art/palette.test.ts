import { PALETTE, STEPS_TO_WHITE, brighter, type PaletteChar } from "./palette";

const COLOURS = Object.keys(PALETTE) as PaletteChar[];

describe("the brightness ladder", () => {
  it("takes every colour to white within STEPS_TO_WHITE steps", () => {
    expect(COLOURS.filter((colour) => brighter(colour, STEPS_TO_WHITE) !== "w")).toEqual([]);
  });

  it("needs all of them for at least one colour, so the constant is not padded", () => {
    expect(COLOURS.some((colour) => brighter(colour, STEPS_TO_WHITE - 1) !== "w")).toBe(true);
  });

  it("leaves a colour alone at zero steps, and white at white", () => {
    expect(COLOURS.every((colour) => brighter(colour, 0) === colour)).toBe(true);
    expect(brighter("w", 3)).toBe("w");
  });

  it("climbs within a family: black through blues, embers through fire", () => {
    expect([1, 2, 3, 4, 5].map((steps) => brighter(".", steps))).toEqual(["n", "b", "s", "p", "w"]);
    expect([1, 2, 3].map((steps) => brighter("m", steps))).toEqual(["r", "o", "Y"]);
  });
});
