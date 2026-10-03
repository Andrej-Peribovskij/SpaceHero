import { silentIntroAudio, type IntroAudio } from "./intro-audio";
import { renderSnore } from "./snore";
import { SAMPLE_RATE, renderTune, type Tune } from "./synth";

/**
 * The intro's music through Web Audio. The synth has already worked out every sample, so this
 * only plays buffers: the tune looping through one gain, which the glitch closes and opens, and
 * the snore once. Two node types, buffer source and gain, which every browser with Web Audio has.
 */

/**
 * How fast the gain moves when the music drops out or comes back, as a time constant: a cut to
 * the ear, but not an instant one, which would click.
 */
const CUT_S = 0.005;

/** The beat of silence on the black card between the music stopping and the snore. */
export const SNORE_PAUSE_S = 0.6;

interface Playing {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

function bufferOf(context: BaseAudioContext, samples: Float32Array<ArrayBuffer>): AudioBuffer {
  const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

export function webIntroAudio(context: AudioContext, tune: Tune): IntroAudio {
  let music: Playing | undefined;
  let closed = false;
  // The loop is rendered once: Module 2's ident starts it again, and must not pay for it twice.
  let loop: AudioBuffer | undefined;

  const gainTo = (level: number) => music?.gain.gain.setTargetAtTime(level, context.currentTime, CUT_S);

  return {
    start: () => {
      if (music || closed) return;

      loop ??= bufferOf(context, renderTune(tune));
      const source = context.createBufferSource();
      source.buffer = loop;
      source.loop = true;
      const gain = context.createGain();
      source.connect(gain).connect(context.destination);
      source.start();
      music = { source, gain };
    },
    dropOut: () => gainTo(0),
    resume: () => gainTo(1),
    stop: () => {
      music?.source.stop();
      music = undefined;
    },
    snore: () => {
      const source = context.createBufferSource();
      source.buffer = bufferOf(context, renderSnore());
      source.connect(context.destination);
      source.start(context.currentTime + SNORE_PAUSE_S);
    },
    close: () => {
      closed = true;
      music?.source.stop();
      music = undefined;
      context.close().catch(() => {});
    },
  };
}

/**
 * The music, if this browser can play it, and silence if it cannot. Call it from inside a key or
 * click handler: a browser lets an `AudioContext` make sound only once the user has done
 * something, and creating and resuming one inside the handler is what counts as that.
 */
export function openIntroAudio(tune: Tune): IntroAudio {
  if (typeof AudioContext === "undefined") return silentIntroAudio;

  try {
    const context = new AudioContext();
    // Usually already running, made inside a gesture. If the browser still says no, the video
    // plays on silently: nothing waits for this.
    context.resume().catch(() => {});
    return webIntroAudio(context, tune);
  } catch {
    return silentIntroAudio;
  }
}
