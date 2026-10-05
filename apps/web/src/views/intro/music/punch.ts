import { SAMPLE_RATE } from "./synth";

/**
 * Joe's fist on the screen, as samples: the thud of the blow, the knock of knuckles on the case,
 * and the set dying — the falling whine of an old monitor switching off, and a crackle of static.
 *
 * Unlike the snore, a thump is simple enough to compute: a low tone falling fast in pitch is what
 * a body hitting something sounds like, and the whine is a tone falling the other way, high to
 * low. The noise is a console's noise channel, as the snore's once was.
 */

const LENGTH_MS = 450;

/** The blow: a low tone dropping from `fromHz` to `toHz`, dying away. */
const THUD = { fromHz: 120, toHz: 38, sweepMs: 160, decayMs: 70, volume: 1 } as const;
/** The knuckles: a few milliseconds of noise as the blow lands. */
const KNOCK = { ms: 8, volume: 0.45 } as const;
/** The set dying: a thin tone falling from high to low, a beat after the blow. */
const WHINE = { atMs: 40, ms: 220, fromHz: 2600, toHz: 220, volume: 0.1 } as const;
/** Static, scattered over the whine. */
const CRACKLE = { atMs: 30, ms: 260, chance: 0.004, volume: 0.25 } as const;

/** Its loudest sample: level with the snore and the music. */
const PEAK = 0.85;

/** The noise channel's shift register, from its power-on state. */
function noiseChannel(): () => number {
  let register = 1;

  return () => {
    const feedback = (register ^ (register >> 1)) & 1;
    register = (register >> 1) | (feedback << 14);
    return register & 1 ? 1 : -1;
  };
}

/** A fixed, even spread of numbers in [0, 1): the same crackle every time. */
function scatter(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A pitch falling exponentially from `fromHz` to `toHz` over `ms`, then held. */
const falling = (fromHz: number, toHz: number, ms: number, atMs: number) =>
  fromHz * (toHz / fromHz) ** Math.min(1, atMs / ms);

export function renderPunch(): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.round((LENGTH_MS * SAMPLE_RATE) / 1000));
  const noise = noiseChannel();
  let thudPhase = 0;
  let whinePhase = 0;
  let crackle = 0;

  for (let i = 0; i < out.length; i += 1) {
    const ms = (i * 1000) / SAMPLE_RATE;

    thudPhase += falling(THUD.fromHz, THUD.toHz, THUD.sweepMs, ms) / SAMPLE_RATE;
    const thudLevel = Math.min(1, ms / 2) * Math.exp(-ms / THUD.decayMs);
    let sample = Math.sin(2 * Math.PI * thudPhase) * thudLevel * THUD.volume;

    const hiss = noise();
    if (ms < KNOCK.ms) sample += hiss * KNOCK.volume * Math.min(1, ms / 0.5) * (1 - ms / KNOCK.ms);

    const whineMs = ms - WHINE.atMs;
    if (whineMs >= 0 && whineMs < WHINE.ms) {
      whinePhase += falling(WHINE.fromHz, WHINE.toHz, WHINE.ms, whineMs) / SAMPLE_RATE;
      const fade = Math.min(1, whineMs / 5) * (1 - whineMs / WHINE.ms);
      sample += Math.sin(2 * Math.PI * whinePhase) * fade * WHINE.volume;
    }

    // A crackle is a spark: a jolt of noise that dies within a millisecond, at scattered moments.
    const crackleMs = ms - CRACKLE.atMs;
    if (crackleMs >= 0 && crackleMs < CRACKLE.ms && scatter(i) < CRACKLE.chance) {
      crackle = CRACKLE.volume * (1 - crackleMs / CRACKLE.ms);
    }
    sample += crackle * hiss;
    crackle *= 0.9;

    out[i] = sample;
  }

  // Fades to nothing over its last 20 ms, so it ends on silence, then levelled.
  const tail = Math.round(0.02 * SAMPLE_RATE);
  for (let i = 0; i < tail; i += 1) out[out.length - 1 - i]! *= i / tail;
  const loudest = out.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i]! / loudest) * PEAK;

  return out;
}
