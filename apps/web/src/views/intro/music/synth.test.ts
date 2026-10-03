import { SAMPLE_RATE, envelopeAt, loopMs, renderTune, stepsIn, waveAt, type Envelope, type Tune, type Voice } from "./synth";

const FLAT: Envelope = { attackMs: 1, decayMs: 1, sustain: 1, releaseMs: 1 };

function voice(bars: readonly string[], overrides: Partial<Voice> = {}): Voice {
  return { name: "test", wave: { kind: "pulse", duty: 0.5 }, volume: 0.5, envelope: FLAT, bars, ...overrides };
}

/** 120 bpm in eighths: a step is 250 ms. */
function tune(...voices: Voice[]): Tune {
  return { bpm: 120, stepsPerBeat: 2, voices };
}

const msToSample = (ms: number) => Math.round((ms * SAMPLE_RATE) / 1000);

/** How many times the signal crosses zero going up, between two moments: its frequency, counted. */
function upwardCrossings(samples: Float32Array, fromMs: number, toMs: number): number {
  let crossings = 0;
  for (let i = msToSample(fromMs) + 1; i < msToSample(toMs); i += 1) {
    if (samples[i - 1]! <= 0 && samples[i]! > 0) crossings += 1;
  }
  return crossings;
}

describe("waveAt", () => {
  it("balances a pulse about zero, so starting a note does not thump", () => {
    for (const duty of [0.125, 0.25, 0.5]) {
      const cycle = Array.from({ length: 1000 }, (_, i) => waveAt({ kind: "pulse", duty }, i / 1000));
      const mean = cycle.reduce((sum, value) => sum + value, 0) / cycle.length;

      expect(Math.max(...cycle)).toBe(1);
      expect(Math.abs(mean)).toBeLessThan(0.01);
    }
  });

  it("steps the triangle through sixteen levels, from -1 to 1, as the console's did", () => {
    const levels = new Set(Array.from({ length: 1000 }, (_, i) => waveAt({ kind: "triangle" }, i / 1000).toFixed(6)));

    expect(levels.size).toBe(16);
    expect(waveAt({ kind: "triangle" }, 0)).toBe(-1);
    expect(waveAt({ kind: "triangle" }, 0.5)).toBe(1);
  });
});

describe("envelopeAt", () => {
  const envelope: Envelope = { attackMs: 10, decayMs: 100, sustain: 0.5, releaseMs: 200 };

  it("rises through the attack, decays to the sustain and holds there", () => {
    expect(envelopeAt(envelope, 0, 1000)).toBe(0);
    expect(envelopeAt(envelope, 5, 1000)).toBe(0.5);
    expect(envelopeAt(envelope, 10, 1000)).toBe(1);
    expect(envelopeAt(envelope, 60, 1000)).toBe(0.75);
    expect(envelopeAt(envelope, 500, 1000)).toBe(0.5);
  });

  it("fades from wherever it was let go, to nothing", () => {
    expect(envelopeAt(envelope, 1100, 1000)).toBe(0.25);
    expect(envelopeAt(envelope, 1200, 1000)).toBe(0);
    // Let go mid-attack, at half height.
    expect(envelopeAt(envelope, 105, 5)).toBe(0.25);
  });
});

describe("stepsIn and loopMs", () => {
  it("count the steps across bars, and time them at the tune's tempo", () => {
    const twoBars = tune(voice(["A4 - - -", ". . . ."]));

    expect(stepsIn(twoBars)).toBe(8);
    expect(loopMs(twoBars)).toBe(2000);
  });

  it("refuse voices of different lengths, which would drift apart on every loop", () => {
    expect(() => stepsIn(tune(voice(["A4 - - -"]), voice(["A4 - -"])))).toThrow(/different lengths/);
  });
});

describe("renderTune", () => {
  it("lasts exactly one loop", () => {
    expect(renderTune(tune(voice(["A4 - - -"]))).length).toBe(msToSample(1000));
  });

  it("plays each note at its pitch, in its steps, and nothing in a rest", () => {
    const samples = renderTune(tune(voice(["A4 - . . A5 - . ."])));

    // A4 sounds for 500 ms: 220 cycles. A5, an octave up, for as long: twice as many.
    expect(upwardCrossings(samples, 0, 500)).toBeCloseTo(220, -1);
    expect(upwardCrossings(samples, 1000, 1500)).toBeCloseTo(440, -1);
    expect(samples.slice(msToSample(510), msToSample(1000)).every((value) => value === 0)).toBe(true);
  });

  it("mixes voices at their volumes", () => {
    const quiet = renderTune(tune(voice(["A4 -"], { volume: 0.2 })));
    const both = renderTune(tune(voice(["A4 -"], { volume: 0.2 }), voice(["A4 -"], { volume: 0.3 })));

    expect(Math.max(...quiet)).toBeCloseTo(0.2, 5);
    expect(Math.max(...both)).toBeCloseTo(0.5, 5);
  });

  it("fades a note held over the end across the start, so the loop has no seam", () => {
    const release = 100;
    const samples = renderTune(tune(voice([". . . A4"], { envelope: { ...FLAT, releaseMs: release } })));

    expect(samples.slice(0, msToSample(release / 2)).some((value) => value !== 0)).toBe(true);
    expect(samples.slice(msToSample(release + 5), msToSample(750)).every((value) => value === 0)).toBe(true);
  });
});
