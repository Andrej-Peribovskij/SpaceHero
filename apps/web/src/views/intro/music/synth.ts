import { parseLine, stepsOf } from "./notes";

/**
 * A chip synthesiser in plain arithmetic: a tune in, its samples out.
 *
 * It computes every sample itself instead of asking Web Audio's oscillators for them, so the
 * music is a pure function — the same numbers in every browser, in a test and in the preview
 * tool that writes it to a WAV for listening. Web Audio only has to play the result.
 *
 * The voices are the ones a 1980s console had: pulse waves of a few fixed widths, and a triangle
 * stepped in sixteen levels. Neither is smoothed. The slight grit of the stepped triangle, and the
 * aliasing of a square computed at a low rate, are what that hardware sounded like.
 */

/** Low, as the hardware's was: half CD rate is plenty for a square wave, and quick to compute. */
export const SAMPLE_RATE = 22_050;

export type Wave =
  /** A square wave high for `duty` of each cycle: 0.5 is hollow, 0.125 thin and reedy. */
  | { readonly kind: "pulse"; readonly duty: number }
  /** A triangle in sixteen steps: soft, round, for the bass. */
  | { readonly kind: "triangle" };

/** How a note's loudness moves: up, down to where it holds, and away once let go. */
export interface Envelope {
  readonly attackMs: number;
  readonly decayMs: number;
  /** The level held after the decay, from 0 to 1. */
  readonly sustain: number;
  /** How long a note takes to fade once its steps are over. */
  readonly releaseMs: number;
}

export interface Voice {
  readonly name: string;
  readonly wave: Wave;
  /** The voice's share of the mix. The voices' volumes together stay at or under 1. */
  readonly volume: number;
  readonly envelope: Envelope;
  /** One line of the note table per bar (`notes.ts` has the notation). */
  readonly bars: readonly string[];
}

export interface Tune {
  readonly bpm: number;
  /** How many tokens of the note table make one beat: 2 for eighth notes. */
  readonly stepsPerBeat: number;
  readonly voices: readonly Voice[];
}

/** One cycle of a wave, at `phase` from 0 to 1, between -1 and 1. */
export function waveAt(wave: Wave, phase: number): number {
  if (wave.kind === "triangle") {
    const ramp = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
    return Math.round((ramp + 1) * 7.5) / 7.5 - 1;
  }

  // Centred on zero, so a note starting or stopping does not thump: high for `duty` of the cycle
  // at full height, low for the rest at whatever depth balances it.
  return phase < wave.duty ? 1 : -wave.duty / (1 - wave.duty);
}

/** A held note's loudness `ms` after it starts: up, then down to the sustain. */
function heldLevel(envelope: Envelope, ms: number): number {
  if (ms < envelope.attackMs) return ms / envelope.attackMs;
  const decayed = (ms - envelope.attackMs) / envelope.decayMs;
  return decayed >= 1 ? envelope.sustain : 1 - (1 - envelope.sustain) * decayed;
}

/**
 * A note's loudness `ms` after it starts, when it is let go after `heldMs`. Called for every
 * sample of every note, so it allocates nothing.
 */
export function envelopeAt(envelope: Envelope, ms: number, heldMs: number): number {
  if (ms < heldMs) return heldLevel(envelope, ms);

  const released = (ms - heldMs) / envelope.releaseMs;
  return released >= 1 ? 0 : heldLevel(envelope, heldMs) * (1 - released);
}

/** How many steps the tune lasts. Every voice must last as long as the others. */
export function stepsIn(tune: Tune): number {
  const lengths = tune.voices.map((voice) => stepsOf(voice.bars.join(" ")).length);
  const steps = lengths[0] ?? 0;

  if (lengths.some((length) => length !== steps)) {
    throw new Error(`The voices are of different lengths: ${lengths.join(", ")} steps`);
  }

  return steps;
}

/** How long the tune lasts, in milliseconds, before it repeats. */
export function loopMs(tune: Tune): number {
  return (stepsIn(tune) * 60_000) / (tune.bpm * tune.stepsPerBeat);
}

/**
 * The tune as samples at `SAMPLE_RATE`, ready to loop. A note still fading at the end of the
 * tune fades over its start instead, so the loop has no seam.
 */
export function renderTune(tune: Tune): Float32Array<ArrayBuffer> {
  const samplesPerStep = (SAMPLE_RATE * 60) / (tune.bpm * tune.stepsPerBeat);
  const total = Math.round(stepsIn(tune) * samplesPerStep);
  const out = new Float32Array(total);

  for (const voice of tune.voices) {
    const releaseSamples = Math.round((voice.envelope.releaseMs * SAMPLE_RATE) / 1000);

    for (const note of parseLine(voice.bars.join(" "))) {
      const start = Math.round(note.step * samplesPerStep);
      const held = Math.round(note.steps * samplesPerStep);
      const heldMs = (held * 1000) / SAMPLE_RATE;

      for (let i = 0; i < held + releaseSamples; i += 1) {
        const phase = ((i * note.frequency) / SAMPLE_RATE) % 1;
        const level = envelopeAt(voice.envelope, (i * 1000) / SAMPLE_RATE, heldMs);
        out[(start + i) % total]! += waveAt(voice.wave, phase) * level * voice.volume;
      }
    }
  }

  return out;
}
