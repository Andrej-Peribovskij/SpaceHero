import { SAMPLE_RATE } from "./synth";

/**
 * Card 10's snore, as samples: one long rattling breath in, a short soft one out.
 *
 * The noise is a console's noise channel: a 15-bit shift register whose low bit is the output,
 * fed back from its two lowest bits. Clocked slowly it rumbles, quickly it hisses. A snore is
 * that rumble, beaten by the soft palate's flutter, swelling and fading with the breath.
 */

/** A breath: how its noise sounds and how its loudness moves. */
interface Breath {
  readonly ms: number;
  /** How many samples each noise value is held: higher is a lower, darker noise. */
  readonly noiseHold: number;
  /** The flutter's rate. Zero for a breath that does not rattle. */
  readonly flutterHz: number;
  readonly volume: number;
  /** When the breath is loudest, as a fraction of it: early for a sigh, late for a long pull in. */
  readonly peakAt: number;
}

const INHALE: Breath = { ms: 1400, noiseHold: 5, flutterHz: 26, volume: 0.5, peakAt: 0.75 };
const PAUSE_MS = 250;
const EXHALE: Breath = { ms: 800, noiseHold: 2, flutterHz: 0, volume: 0.18, peakAt: 0.2 };

/** The noise channel's shift register, from its power-on state. */
function noiseChannel(): () => number {
  let register = 1;

  return () => {
    const feedback = (register ^ (register >> 1)) & 1;
    register = (register >> 1) | (feedback << 14);
    return register & 1 ? 1 : -1;
  };
}

function breathe(breath: Breath, out: Float32Array, from: number): void {
  const length = Math.round((breath.ms * SAMPLE_RATE) / 1000);
  const noise = noiseChannel();
  let value = 0;
  // A one-pole low-pass: each sample moves a quarter of the way to the noise, which takes the
  // edge off it without a filter node.
  let smoothed = 0;

  for (let i = 0; i < length; i += 1) {
    if (i % breath.noiseHold === 0) value = noise();
    smoothed += 0.25 * (value - smoothed);

    const through = i / length;
    const swell = through < breath.peakAt ? through / breath.peakAt : (1 - through) / (1 - breath.peakAt);
    const flutter = breath.flutterHz === 0 ? 1 : 0.55 + 0.45 * Math.sin((2 * Math.PI * breath.flutterHz * i) / SAMPLE_RATE);

    out[from + i] = smoothed * swell * flutter * breath.volume;
  }
}

export function renderSnore(): Float32Array<ArrayBuffer> {
  const samples = (ms: number) => Math.round((ms * SAMPLE_RATE) / 1000);
  const out = new Float32Array(samples(INHALE.ms + PAUSE_MS + EXHALE.ms));

  breathe(INHALE, out, 0);
  breathe(EXHALE, out, samples(INHALE.ms + PAUSE_MS));

  return out;
}
