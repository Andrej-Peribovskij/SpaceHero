import { renderSnore } from "./snore";
import { SAMPLE_RATE } from "./synth";

describe("renderSnore", () => {
  const snore = renderSnore();

  it("is a breath in, a pause and a breath out: under the black card's three seconds", () => {
    expect(snore.length / SAMPLE_RATE).toBeCloseTo(2.45, 2);
  });

  it("is the same snore every time: the noise is a shift register, not a random number", () => {
    expect(renderSnore()).toEqual(snore);
  });

  it("comes out of silence and goes back to it, without clipping", () => {
    expect(Math.abs(snore[0]!)).toBe(0);
    expect(Math.abs(snore[snore.length - 1]!)).toBeLessThan(0.001);
    expect(Math.max(...snore.map(Math.abs))).toBeLessThanOrEqual(1);
  });

  it("pauses between the breaths", () => {
    const pause = snore.slice(Math.round(1.45 * SAMPLE_RATE), Math.round(1.6 * SAMPLE_RATE));

    expect(pause.every((value) => value === 0)).toBe(true);
  });

  it("breathes in louder than it breathes out", () => {
    const loudest = (from: number, to: number) => Math.max(...snore.slice(from * SAMPLE_RATE, to * SAMPLE_RATE).map(Math.abs));

    expect(loudest(0, 1.4)).toBeGreaterThan(2 * loudest(1.65, 2.45));
  });
});
