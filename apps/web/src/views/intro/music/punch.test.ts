import { renderPunch } from "./punch";
import { SAMPLE_RATE } from "./synth";

describe("renderPunch", () => {
  const punch = renderPunch();
  const seconds = (from: number, to: number) => punch.slice(Math.round(from * SAMPLE_RATE), Math.round(to * SAMPLE_RATE));
  const loudness = (part: Float32Array) => Math.sqrt(part.reduce((sum, value) => sum + value * value, 0) / part.length);
  const loudest = (part: Float32Array) => part.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

  it("is short: a blow and a dying set, under half a second", () => {
    expect(punch.length / SAMPLE_RATE).toBeCloseTo(0.45, 2);
  });

  it("is the same every time: the noise is a shift register, not a random number", () => {
    expect(renderPunch()).toEqual(punch);
  });

  it("comes out of silence and goes back to it, levelled with the other sounds and short of clipping", () => {
    expect(Math.abs(punch[0]!)).toBe(0);
    expect(Math.abs(punch[punch.length - 1]!)).toBeLessThan(0.001);
    expect(loudest(punch)).toBeCloseTo(0.85, 2);
  });

  it("lands hard and dies away: the blow is far louder than what follows it", () => {
    expect(loudness(seconds(0, 0.12))).toBeGreaterThan(3 * loudness(seconds(0.25, 0.45)));
  });

  it("is still sounding after the blow: the set dies with a whine and a crackle, not in silence", () => {
    expect(loudest(seconds(0.15, 0.3))).toBeGreaterThan(0.02);
  });
});
