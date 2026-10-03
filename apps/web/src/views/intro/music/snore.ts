import { SAMPLE_RATE } from "./synth";

/**
 * Card 10's snore, as samples: one long rattling breath in, a short breathy one out.
 *
 * A snore is the soft palate flapping in the airflow. Each flap shuts the airway for an instant
 * and lets it go with a burst, twenty to forty times a second and never quite evenly, and the
 * throat colours those bursts into a low growl. So the breath in is built that way: noise, beaten
 * by a train of flaps whose rate and strength wander, rung through resonances like a throat's and
 * swelling and fading with the air. The rattle only starts once enough air is moving, so it opens
 * on a plain breath. The breath out does not rattle: it is the air leaving, a soft "pfff".
 *
 * The noise is a console's noise channel: a 15-bit shift register whose low bit is the output,
 * fed back from its two lowest bits.
 */

/** A resonance: where it rings, how wide, and how much of it is heard. */
type Formant = readonly [hz: number, bandwidthHz: number, gain: number];

/** A breath: how its air moves, and what it sounds through. */
interface Breath {
  readonly ms: number;
  /** When the air moves fastest, as a fraction of the breath: late for a long pull in. */
  readonly peakAt: number;
  /** Its loudest sample. */
  readonly volume: number;
  /** How fast the palate flaps with the least air moving, and with the most. */
  readonly flapHz: readonly [number, number];
  /** How much of the sound the flapping makes at full airflow: zero for a breath that does not rattle. */
  readonly rattle: number;
  readonly formants: readonly Formant[];
}

const INHALE: Breath = {
  ms: 1500,
  peakAt: 0.65,
  volume: 0.55,
  flapHz: [22, 34],
  rattle: 0.95,
  formants: [
    [170, 90, 1],
    [480, 110, 0.55],
    [1250, 300, 0.15],
  ],
};
const PAUSE_MS = 150;
const EXHALE: Breath = {
  ms: 1000,
  peakAt: 0.25,
  volume: 0.2,
  flapHz: [0, 0],
  rattle: 0,
  formants: [
    [650, 350, 0.6],
    [1700, 700, 0.5],
  ],
};

/** How irregular the flapping is: each flap's length and strength wander by up to this share. */
const FLAP_JITTER = 0.08;
const FLAP_WANDER = 0.25;

/** The noise channel's shift register, from its power-on state. */
function noiseChannel(): () => number {
  let register = 1;

  return () => {
    const feedback = (register ^ (register >> 1)) & 1;
    register = (register >> 1) | (feedback << 14);
    return register & 1 ? 1 : -1;
  };
}

/** A fixed, even spread of numbers in [0, 1): the same irregularity every time the snore plays. */
function scatter(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A two-pole resonator, ringing at `hz`: the throat and mouth as filters. */
function resonator([hz, bandwidthHz]: Formant): (x: number) => number {
  const r = Math.exp((-Math.PI * bandwidthHz) / SAMPLE_RATE);
  const a1 = 2 * r * Math.cos((2 * Math.PI * hz) / SAMPLE_RATE);
  const a2 = -r * r;
  let y1 = 0;
  let y2 = 0;

  return (x) => {
    const y = (1 - r) * x + a1 * y1 + a2 * y2;
    y2 = y1;
    y1 = y;
    return y;
  };
}

const smoothstep = (from: number, to: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** How fast the air moves, 0 to 1, a share `through` the breath: a smooth rise to its peak and fall. */
function airflow(breath: Breath, through: number): number {
  const half = through < breath.peakAt ? through / breath.peakAt : 1 - (through - breath.peakAt) / (1 - breath.peakAt);
  return Math.sin((Math.PI / 2) * half) ** 2;
}

/**
 * A flap: the airway bursts open and the air rushes, then eases until the next shuts it. `phase`
 * runs from 0 to 1 across one flap.
 */
const flap = (phase: number) => (1 - Math.exp(-phase * 40)) * Math.exp(-phase * 8);

/** The knock of the palate slapping shut, which sets the throat ringing: it dies in about a millisecond. */
const KNOCK_SAMPLES = 0.0012 * SAMPLE_RATE;
const KNOCK = 10;
/** How much of the rush of air is still heard under the knocks, at full rattle. */
const RUSH = 0.5;

function breathe(breath: Breath, out: Float32Array, from: number): void {
  const length = Math.round((breath.ms * SAMPLE_RATE) / 1000);
  const noise = noiseChannel();
  const filters = breath.formants.map(resonator);
  const sound = new Float32Array(length);

  let phase = 0;
  let flaps = 0;
  let since = Infinity;
  let stretch = 1;
  let strength = 1;

  for (let i = 0; i < length; i += 1) {
    const air = airflow(breath, i / length);
    // The rattle comes in once the air is moving hard enough to lift the palate.
    const depth = breath.rattle * smoothstep(0.15, 0.55, air);

    const [slowest, fastest] = breath.flapHz;
    phase += ((slowest + (fastest - slowest) * air) * stretch) / SAMPLE_RATE;
    since += 1;
    if (phase >= 1) {
      phase -= 1;
      flaps += 1;
      since = 0;
      stretch = 1 + (scatter(flaps) - 0.5) * 2 * FLAP_JITTER;
      strength = 1 + (scatter(flaps + 500) - 0.5) * 2 * FLAP_WANDER;
    }

    // Air through a fluttering airway: each flap a knock that rings the throat, and the rush of air
    // that follows it, chopped by the flaps.
    const knock = KNOCK * Math.exp(-since / KNOCK_SAMPLES) * strength;
    const rush = noise() * (1 - depth + depth * RUSH * 1.8 * flap(phase) * strength);
    const source = depth * knock + rush;

    let ringing = 0;
    breath.formants.forEach(([, , gain], index) => {
      ringing += gain * filters[index]!(source);
    });

    sound[i] = ringing * air;
  }

  const loudest = sound.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  for (let i = 0; i < length; i += 1) out[from + i] = (sound[i]! / loudest) * breath.volume;
}

export function renderSnore(): Float32Array<ArrayBuffer> {
  const samples = (ms: number) => Math.round((ms * SAMPLE_RATE) / 1000);
  const out = new Float32Array(samples(INHALE.ms + PAUSE_MS + EXHALE.ms));

  breathe(INHALE, out, 0);
  breathe(EXHALE, out, samples(INHALE.ms + PAUSE_MS));

  return out;
}
