import { silentIntroAudio } from "./intro-audio";
import type { Tune } from "./synth";
import { openIntroAudio, webIntroAudio } from "./web-audio";

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
  buffer: { length: number } | null = null;
  loop = false;
  startedAt: number | undefined;
  stopped = false;
  connectedTo: unknown;
  connect<T>(node: T): T {
    this.connectedTo = node;
    return node;
  }
  start(when = 0) {
    this.startedAt = when;
  }
  stop() {
    this.stopped = true;
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
    return { length, copyToChannel: () => {} };
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
  resume() {
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

function play() {
  const context = new FakeContext();
  const audio = webIntroAudio(context as unknown as AudioContext, TUNE);
  return { context, audio };
}

afterEach(() => {
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

  it("snores once, straight to the speakers, after a beat of silence", () => {
    const { context, audio } = play();

    audio.snore();

    const [snore] = context.sources;
    expect(snore!.loop).toBe(false);
    expect(snore!.connectedTo).toBe(context.destination);
    expect(snore!.startedAt).toBeGreaterThan(context.currentTime);
  });

  it("closes the context, stopping the music if it still plays", () => {
    const { context, audio } = play();
    audio.start();

    audio.close();

    expect(context.sources[0]!.stopped).toBe(true);
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
