import { renderSnore } from "./snore";
import { SAMPLE_RATE } from "./synth";

describe("renderSnore", () => {
  const snore = renderSnore();
  const seconds = (from: number, to: number) => snore.slice(Math.round(from * SAMPLE_RATE), Math.round(to * SAMPLE_RATE));
  const loudest = (part: Float32Array) => part.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

  /** Its loudness, following changes up to `hz` a second: rectified, then smoothed. */
  function envelope(part: Float32Array, hz: number): Float64Array {
    const pull = 1 - Math.exp((-2 * Math.PI * hz) / SAMPLE_RATE);
    const out = new Float64Array(part.length);
    let level = 0;
    for (let i = 0; i < part.length; i += 1) out[i] = level += pull * (Math.abs(part[i]!) - level);
    return out;
  }

  /**
   * The rattle, as the ear hears it: the loudness beating faster than the breath swells. Its
   * `strength` is how alike one beat is to the next, 0 for none and 1 for perfectly regular, and
   * `hz` how many beats a second. The swell is divided out first, so a breath growing louder is
   * not mistaken for one.
   */
  function rattle(part: Float32Array): { strength: number; hz: number } {
    const fast = envelope(part, 120);
    const swell = envelope(part, 8);
    // Skip the first 50 ms, where both envelopes are still catching up.
    const from = Math.round(0.05 * SAMPLE_RATE);
    const beat = Array.from(fast.subarray(from), (level, i) => level / Math.max(swell[from + i]!, 1e-9) - 1);
    const mean = beat.reduce((sum, value) => sum + value, 0) / beat.length;
    const centred = beat.map((value) => value - mean);
    const power = centred.reduce((sum, value) => sum + value * value, 0);

    let best = { strength: 0, hz: 0 };
    for (let lag = Math.round(SAMPLE_RATE / 50); lag <= Math.round(SAMPLE_RATE / 18); lag += 1) {
      let sum = 0;
      for (let i = lag; i < centred.length; i += 1) sum += centred[i]! * centred[i - lag]!;
      const strength = sum / power;
      if (strength > best.strength) best = { strength, hz: SAMPLE_RATE / lag };
    }
    return best;
  }

  /** Roughly the pitch it sits at: how often the wave crosses zero, halved. */
  const crossingsHz = (part: Float32Array) => {
    let crossings = 0;
    for (let i = 1; i < part.length; i += 1) if (part[i - 1]! < 0 !== part[i]! < 0) crossings += 1;
    return crossings / 2 / (part.length / SAMPLE_RATE);
  };

  it("is a breath in, a pause and a breath out, leaving the black card time to fall silent", () => {
    expect(snore.length / SAMPLE_RATE).toBeCloseTo(2.65, 2);
  });

  it("is the same snore every time: the noise is a shift register, not a random number", () => {
    expect(renderSnore()).toEqual(snore);
  });

  it("comes out of silence and goes back to it, without clipping", () => {
    expect(Math.abs(snore[0]!)).toBe(0);
    expect(Math.abs(snore[snore.length - 1]!)).toBeLessThan(0.001);
    expect(loudest(snore)).toBeLessThanOrEqual(1);
  });

  it("pauses between the breaths", () => {
    expect(seconds(1.505, 1.645).every((value) => value === 0)).toBe(true);
  });

  it("breathes in louder than it breathes out", () => {
    expect(loudest(seconds(0, 1.5))).toBeGreaterThan(2 * loudest(seconds(1.65, 2.65)));
  });

  it("rattles as it breathes in: a strong beat, twenty to forty flaps a second, at the height of the breath", () => {
    const { strength, hz } = rattle(seconds(0.6, 1.3));

    expect(strength).toBeGreaterThan(0.4);
    expect(hz).toBeGreaterThanOrEqual(20);
    expect(hz).toBeLessThanOrEqual(40);
  });

  it("opens on plain breath, and breathes out without a rattle", () => {
    expect(rattle(seconds(0, 0.3)).strength).toBeLessThan(0.25);
    expect(rattle(seconds(1.7, 2.4)).strength).toBeLessThan(0.25);
  });

  it("growls low through the throat as it breathes in, and breathes out higher and softer", () => {
    expect(crossingsHz(seconds(0.7, 1.2))).toBeLessThan(500);
    expect(crossingsHz(seconds(1.7, 2.2))).toBeGreaterThan(crossingsHz(seconds(0.7, 1.2)));
  });
});
