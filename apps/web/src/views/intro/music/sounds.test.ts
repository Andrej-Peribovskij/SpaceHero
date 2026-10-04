import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cardDurationMs, snoreMs } from "../intro-timeline";
import { END_CARD, INTRO_CARDS, SNORE_CARD } from "../script";
import { encodeWav } from "../tools/wav";
import { decodeWav, soundStore } from "./sounds";
import { SAMPLE_RATE } from "./synth";

// Resolved by hand: Vite rewrites `new URL("…", import.meta.url)` into a served-asset URL, which is
// not a path readFileSync can open.
const SOUNDS = resolve(dirname(fileURLToPath(import.meta.url)), "sounds");

/** A committed sound file's bytes, as `fetch` would hand them over. */
function fileBytes(name: string): ArrayBuffer {
  const bytes = readFileSync(resolve(SOUNDS, name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const seconds = (samples: Float32Array) => samples.length / SAMPLE_RATE;
const loudest = (samples: Float32Array) => samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

/** A WAV header with its format chunk altered: for the files `decodeWav` must refuse. */
function withFormat(channels: number, rate: number): ArrayBuffer {
  const bytes = encodeWav(new Float32Array(10), rate);
  new DataView(bytes.buffer).setUint16(22, channels, true);
  return bytes.buffer as ArrayBuffer;
}

describe("decodeWav", () => {
  it("reads back what the preview tool's encoder writes, to 16-bit precision", () => {
    const samples = Float32Array.from({ length: 200 }, (_, i) => Math.sin(i / 7) * 0.8);
    const read = decodeWav(encodeWav(samples, SAMPLE_RATE).buffer as ArrayBuffer);

    expect(read).toHaveLength(samples.length);
    read.forEach((value, i) => expect(value).toBeCloseTo(samples[i]!, 4));
  });

  it("refuses anything it would play wrong: not a WAV, stereo, or another sample rate", () => {
    expect(() => decodeWav(new TextEncoder().encode("not a sound at all").buffer as ArrayBuffer)).toThrow(/not a WAV/);
    expect(() => decodeWav(withFormat(2, SAMPLE_RATE))).toThrow(/mono 16-bit/);
    expect(() => decodeWav(withFormat(1, 44_100))).toThrow(/mono 16-bit/);
  });
});

describe("the recorded sounds", () => {
  const snore = decodeWav(fileBytes("snore.wav"));
  const wake = decodeWav(fileBytes("wake.wav"));

  it("are the snore and the waking snort, each a second or two", () => {
    expect(seconds(snore)).toBeCloseTo(2.14, 1);
    expect(seconds(wake)).toBeCloseTo(1.14, 1);
  });

  it("let the snore end with card 9, with a beat to spare, never running into Module 2", () => {
    const snoreEndsMs = snoreMs(SNORE_CARD)! + seconds(snore) * 1000;

    expect(cardDurationMs(SNORE_CARD) - snoreEndsMs).toBeGreaterThanOrEqual(500);
  });

  it("start and end on silence, levelled to the music and short of clipping", () => {
    for (const sound of [snore, wake]) {
      expect(Math.abs(sound[0]!)).toBeLessThan(0.01);
      expect(Math.abs(sound[sound.length - 1]!)).toBeLessThan(0.01);
      expect(loudest(sound)).toBeGreaterThan(0.5);
      expect(loudest(sound)).toBeLessThan(0.9);
    }
  });
});

describe("soundStore", () => {
  /** A fetch that serves the committed files, and fails for whichever names it is told to. */
  function serving(failing: readonly string[] = []) {
    const asked: string[] = [];
    const fetchFile = async (url: string) => {
      asked.push(url);
      const name = url.includes("snore") ? "snore.wav" : "wake.wav";
      if (failing.includes(name)) throw new TypeError("network down");
      return new Response(fileBytes(name));
    };
    return { asked, fetchFile };
  }

  it("has nothing before it loads, and both sounds after", async () => {
    const { fetchFile } = serving();
    const store = soundStore(fetchFile);

    expect(store.sounds()).toEqual({});
    await store.load();

    expect(store.sounds().snore).toEqual(decodeWav(fileBytes("snore.wav")));
    expect(store.sounds().wake).toEqual(decodeWav(fileBytes("wake.wav")));
  });

  it("fetches each sound once, however often it is asked to load", async () => {
    const { asked, fetchFile } = serving();
    const store = soundStore(fetchFile);

    await Promise.all([store.load(), store.load()]);
    await store.load();

    expect(asked).toHaveLength(2);
  });

  it("leaves a sound it cannot fetch missing, without failing, and still loads the other", async () => {
    const { fetchFile } = serving(["snore.wav"]);
    const store = soundStore(fetchFile);

    await expect(store.load()).resolves.toBeUndefined();
    expect(store.sounds().snore).toBeUndefined();
    expect(store.sounds().wake).toBeDefined();
  });

  it("leaves a sound missing when the server answers with an error", async () => {
    const store = soundStore(async () => new Response("gone", { status: 404 }));

    await store.load();

    expect(store.sounds()).toEqual({});
  });
});

describe("the snort and the punch", () => {
  it("lets the snort finish, and gives Joe a couple of seconds to come round, before his fist lands", () => {
    const wake = decodeWav(fileBytes("wake.wav"));
    const { wakeAtMs, punchAtMs } = INTRO_CARDS[END_CARD]!;

    expect(punchAtMs! - (wakeAtMs! + seconds(wake) * 1000)).toBeGreaterThanOrEqual(2000);
  });
});
