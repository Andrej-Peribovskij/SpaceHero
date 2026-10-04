import { SAMPLE_RATE } from "./synth";
import snoreUrl from "./sounds/snore.wav?url";
import wakeUrl from "./sounds/wake.wav?url";

/**
 * The intro's two recorded sounds: card 9's snore and card 10's waking snort. `sounds/README.md`
 * says where they come from and what was done to them. Everything else the intro plays is
 * computed; these are fetched while the gate waits and read into samples like the synth's, so
 * Web Audio plays them the same way.
 */

export type SoundName = "snore" | "wake";

/** The sounds read so far. One that is missing plays as silence. */
export type RecordedSounds = Readonly<Partial<Record<SoundName, Float32Array<ArrayBuffer>>>>;

const URLS: Readonly<Record<SoundName, string>> = { snore: snoreUrl, wake: wakeUrl };

/**
 * Reads a WAV as `sounds/` holds them: mono, 16-bit PCM, at the synth's `SAMPLE_RATE`. Throws on
 * anything else, rather than playing it at the wrong speed.
 */
export function decodeWav(bytes: ArrayBuffer): Float32Array<ArrayBuffer> {
  const view = new DataView(bytes);
  const text = (at: number, length: number) => String.fromCharCode(...new Uint8Array(bytes, at, length));
  if (bytes.byteLength < 12 || text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") throw new Error("not a WAV file");

  let format: { pcm: boolean; channels: number; rate: number; bits: number } | undefined;
  let data: { from: number; size: number } | undefined;

  for (let at = 12; at + 8 <= bytes.byteLength; ) {
    const id = text(at, 4);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      format = {
        pcm: view.getUint16(at + 8, true) === 1,
        channels: view.getUint16(at + 10, true),
        rate: view.getUint32(at + 12, true),
        bits: view.getUint16(at + 22, true),
      };
    }
    if (id === "data") data = { from: at + 8, size: Math.min(size, bytes.byteLength - at - 8) };
    at += 8 + size + (size % 2);
  }

  if (!format || !data) throw new Error("a WAV file with no format or no data");
  if (!format.pcm || format.channels !== 1 || format.bits !== 16 || format.rate !== SAMPLE_RATE) {
    throw new Error(`expected mono 16-bit PCM at ${SAMPLE_RATE} Hz`);
  }

  const samples = new Float32Array(Math.floor(data.size / 2));
  for (let i = 0; i < samples.length; i += 1) samples[i] = view.getInt16(data.from + i * 2, true) / 32768;
  return samples;
}

export interface SoundStore {
  /** Fetches and reads every sound, once: a second call waits on the first. */
  readonly load: () => Promise<void>;
  readonly sounds: () => RecordedSounds;
}

/**
 * The sounds, fetched with `fetchFile`. A sound that cannot be fetched or read stays missing, and
 * plays as silence: sound never stops the video.
 */
export function soundStore(fetchFile: (url: string) => Promise<Response>): SoundStore {
  const loaded: Partial<Record<SoundName, Float32Array<ArrayBuffer>>> = {};
  let loading: Promise<void> | undefined;

  const loadOne = async (name: SoundName) => {
    try {
      const response = await fetchFile(URLS[name]);
      if (response.ok) loaded[name] = decodeWav(await response.arrayBuffer());
    } catch {
      // Missing, then: the moment it was for passes in silence.
    }
  };

  return {
    load: () => (loading ??= Promise.all((Object.keys(URLS) as SoundName[]).map(loadOne)).then(() => {})),
    sounds: () => loaded,
  };
}

/** The page's sounds: fetched once, for the page's life. */
const pageSounds = soundStore((url) => fetch(url));

export const loadSounds = pageSounds.load;
export const loadedSounds = pageSounds.sounds;
