import { silentIntroAudio } from "./intro-audio";
import type { Tune } from "./synth";
import type { RecordedSounds } from "./sounds";
import { SNORE_PAUSE_S, WAKE_PAUSE_S, openIntroAudio, renderedTune, webIntroAudio } from "./web-audio";

const TUNE: Tune = {
  bpm: 120,
  stepsPerBeat: 2,
  voices: [
    {
      name: "test",
      wave: { kind: "pulse", duty: 0.5 },
      volume: 0.5,
      envelope: { attackMs: 1, decayMs: 1, sustain: 1, releaseMs: 1 },
      bars: ["A4 - - -"],
    },
  ],
};

/** Just enough of Web Audio to see what the intro builds with it: no sound, only the graph. */
class FakeSource {
  buffer: { length: number; samples?: Float32Array } | null = null;
  loop = false;
  startedAt: number | undefined;
  stopped = false;
  stoppedAt: number | undefined;
  connectedTo: unknown;
  connect<T>(node: T): T {
    this.connectedTo = node;
    return node;
  }
  start(when = 0) {
    this.startedAt = when;
  }
  stop(when = 0) {
    this.stopped = true;
    this.stoppedAt = when;
  }
}

class FakeGain {
  readonly gain = { target: 1, setTargetAtTime: (level: number) => void (this.gain.target = level) };
  connectedTo: unknown;
  connect<T>(node: T): T {
    this.connectedTo = node;
    return node;
  }
}

class FakeContext {
  currentTime = 10;
  readonly destination = { destination: true };
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  closed = false;

  createBuffer(_channels: number, length: number) {
    const buffer = {
      length,
      samples: undefined as Float32Array | undefined,
      copyToChannel: (samples: Float32Array) => void (buffer.samples = samples),
    };
    return buffer;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  suspended = false;

  resume() {
    this.suspended = false;
    return Promise.resolve();
  }
  suspend() {
    this.suspended = true;
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

/** Stand-ins for the recordings: only which buffer plays matters here, not how it sounds. */
const SOUNDS = { snore: new Float32Array(100), wake: new Float32Array(50) } as const;

function play() {
  const context = new FakeContext();
  const audio = webIntroAudio(context as unknown as AudioContext, TUNE, () => SOUNDS);
  return { context, audio };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("webIntroAudio", () => {
  it("starts the tune looping, through a gain, to the speakers", () => {
    const { context, audio } = play();

    audio.start();

    const [music] = context.sources;
    expect(context.sources).toHaveLength(1);
    expect(music!.loop).toBe(true);
    expect(music!.buffer!.length).toBeGreaterThan(0);
    expect(music!.startedAt).toBe(0);
    expect(music!.connectedTo).toBe(context.gains[0]);
    expect(context.gains[0]!.connectedTo).toBe(context.destination);
  });

  it("starts once, however often it is asked", () => {
    const { context, audio } = play();

    audio.start();
    audio.start();

    expect(context.sources).toHaveLength(1);
  });

  it("drops out by closing the gain, and comes back by opening it, with the loop running on", () => {
    const { context, audio } = play();
    audio.start();

    audio.dropOut();
    expect(context.gains[0]!.gain.target).toBe(0);

    audio.resume();
    expect(context.gains[0]!.gain.target).toBe(1);
    expect(context.sources[0]!.stopped).toBe(false);
  });

  it("starts the loop again from the top after a stop, at full volume, from the loop it already rendered", () => {
    const { context, audio } = play();
    const createBuffer = vi.spyOn(context, "createBuffer");
    audio.start();
    audio.dropOut();

    audio.stop();
    audio.start();

    const [first, again] = context.sources;
    expect(first!.stopped).toBe(true);
    expect(again!.stopped).toBe(false);
    expect(again!.loop).toBe(true);
    expect(again!.buffer).toBe(first!.buffer);
    expect(again!.connectedTo).toBe(context.gains[1]);
    expect(context.gains[1]!.gain.target).toBe(1);
    expect(createBuffer).toHaveBeenCalledTimes(1);
  });

  it("starts nothing once closed", () => {
    const { context, audio } = play();

    audio.close();
    audio.start();

    expect(context.sources).toHaveLength(0);
  });

  it("snores once, the recording, through a gain of its own, after a beat of silence", () => {
    const { context, audio } = play();

    audio.snore();

    const [snore] = context.sources;
    expect(snore!.loop).toBe(false);
    expect(snore!.buffer!.samples).toBe(SOUNDS.snore);
    expect(snore!.connectedTo).toBe(context.gains[0]);
    expect(context.gains[0]!.connectedTo).toBe(context.destination);
    expect(snore!.startedAt).toBe(context.currentTime + SNORE_PAUSE_S);
  });

  it("wakes with the snort once, a beat after it is asked, alongside the music", () => {
    const { context, audio } = play();
    audio.start();

    audio.wake();

    const [music, wake] = context.sources;
    expect(wake!.loop).toBe(false);
    expect(wake!.buffer!.samples).toBe(SOUNDS.wake);
    expect(wake!.startedAt).toBe(context.currentTime + WAKE_PAUSE_S);
    expect(music!.stopped).toBe(false);
  });

  it("plays nothing for a recording that never arrived, and carries on", () => {
    const context = new FakeContext();
    const audio = webIntroAudio(context as unknown as AudioContext, TUNE, () => ({}));
    audio.start();

    audio.snore();
    audio.wake();

    expect(context.sources).toHaveLength(1);
  });

  it("asks for the recordings when they are to play, so one that arrives after the gate still plays", () => {
    const context = new FakeContext();
    let sounds: RecordedSounds = {};
    const audio = webIntroAudio(context as unknown as AudioContext, TUNE, () => sounds);

    sounds = SOUNDS;
    audio.snore();

    expect(context.sources[0]!.buffer!.samples).toBe(SOUNDS.snore);
  });

  it("cancels a snort still waiting out its beat on a stop", () => {
    const { context, audio } = play();
    audio.start();
    audio.wake();

    audio.stop();

    expect(context.sources[1]!.stopped).toBe(true);
  });

  it("fades the music and the snore out on a stop, rather than cutting them mid-wave", () => {
    const { context, audio } = play();
    audio.start();
    audio.snore();

    audio.stop();

    for (const [index, source] of context.sources.entries()) {
      expect(context.gains[index]!.gain.target).toBe(0);
      expect(source.stoppedAt).toBeGreaterThan(context.currentTime);
      expect(source.stoppedAt).toBeLessThan(context.currentTime + 0.1);
    }
  });

  it("stops a snore on a stop, even one still waiting out its beat of silence", () => {
    const { context, audio } = play();
    audio.start();
    audio.stop();
    audio.snore();

    // A skip on the black card: the snore must not play over Module 2's music.
    audio.stop();
    audio.start();

    const [, snore, again] = context.sources;
    expect(snore!.stopped).toBe(true);
    expect(again!.stopped).toBe(false);
  });

  it("pauses by suspending the context, and goes on by resuming it, with every sound kept", () => {
    const { context, audio } = play();
    audio.start();

    audio.pause();
    expect(context.suspended).toBe(true);

    audio.unpause();
    expect(context.suspended).toBe(false);
    expect(context.sources[0]!.stopped).toBe(false);
  });

  it("does not wake a closed context on a pause or an unpause", () => {
    const { context, audio } = play();
    const suspend = vi.spyOn(context, "suspend");
    const resume = vi.spyOn(context, "resume");
    audio.close();

    audio.pause();
    audio.unpause();

    expect(suspend).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it("snores nothing once closed", () => {
    const { context, audio } = play();

    audio.close();
    audio.snore();

    expect(context.sources).toHaveLength(0);
  });

  it("closes the context, stopping the music if it still plays, once the music has faded", () => {
    vi.useFakeTimers();
    const { context, audio } = play();
    audio.start();

    audio.close();

    expect(context.sources[0]!.stopped).toBe(true);
    expect(context.gains[0]!.gain.target).toBe(0);
    expect(context.closed).toBe(false);

    vi.advanceTimersByTime(100);
    expect(context.closed).toBe(true);
  });

  it("does nothing on a drop-out, resume or stop before the music has started", () => {
    const { context, audio } = play();

    audio.dropOut();
    audio.resume();
    audio.stop();

    expect(context.sources).toHaveLength(0);
  });
});

describe("renderedTune", () => {
  it("renders a tune once, and the music plays those very samples", () => {
    const samples = renderedTune(TUNE);
    const { context, audio } = play();

    audio.start();

    expect(renderedTune(TUNE)).toBe(samples);
    expect(context.sources[0]!.buffer!.samples).toBe(samples);
  });
});

describe("openIntroAudio", () => {
  it("is silent where the browser has no Web Audio", () => {
    vi.stubGlobal("AudioContext", undefined);

    expect(openIntroAudio(TUNE)).toBe(silentIntroAudio);
  });

  it("is silent where the browser refuses an AudioContext", () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("NotSupportedError");
        }
      },
    );

    expect(openIntroAudio(TUNE)).toBe(silentIntroAudio);
  });

  it("plays where it can, and does not wait on the browser's permission", async () => {
    const resume = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    vi.stubGlobal("AudioContext", class extends FakeContext {
      override resume() {
        return resume();
      }
    });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const audio = openIntroAudio(TUNE);
    await new Promise((settled) => setTimeout(settled, 0));
    process.off("unhandledRejection", unhandled);

    expect(audio).not.toBe(silentIntroAudio);
    expect(resume).toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });
});
