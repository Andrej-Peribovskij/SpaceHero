import { parseLine, stepsOf } from "./notes";
import { loopMs, renderTune, stepsIn } from "./synth";
import { ORIENTATION_TUNE } from "./tune";

describe("the orientation tune", () => {
  it("is readable: every token of every voice is a note, a hold or a rest", () => {
    for (const voice of ORIENTATION_TUNE.voices) {
      expect(() => parseLine(voice.bars.join(" ")), voice.name).not.toThrow();
    }
  });

  it("keeps every voice in step: the same number of bars, each a 4/4 bar of eighths", () => {
    const bars = ORIENTATION_TUNE.voices[0]!.bars.length;

    for (const voice of ORIENTATION_TUNE.voices) {
      expect(voice.bars, voice.name).toHaveLength(bars);
      for (const bar of voice.bars) expect(stepsOf(bar), `${voice.name}: ${bar}`).toHaveLength(8);
    }
    expect(stepsIn(ORIENTATION_TUNE)).toBe(bars * 8);
  });

  it("loops slowly enough to stay out of the captions' way, but more than once in the video", () => {
    expect(loopMs(ORIENTATION_TUNE)).toBeGreaterThan(15_000);
    expect(loopMs(ORIENTATION_TUNE)).toBeLessThan(40_000);
  });

  it("never clips, however its voices pile up", () => {
    const volumes = ORIENTATION_TUNE.voices.reduce((sum, voice) => sum + voice.volume, 0);
    const samples = renderTune(ORIENTATION_TUNE);
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));

    expect(volumes).toBeLessThanOrEqual(1);
    expect(peak).toBeLessThanOrEqual(1);
  });
});
