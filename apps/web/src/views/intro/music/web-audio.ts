import { silentIntroAudio, type IntroAudio } from "./intro-audio";
import { renderSnore } from "./snore";
import { SAMPLE_RATE, renderTune, type Tune } from "./synth";

/**
 * The intro's music through Web Audio. The synth has already worked out every sample, so this
 * only plays buffers, each through a gain of its own: the tune looping, its gain closed and opened
 * by the glitch, and the snore once. Two node types, buffer source and gain, which every browser
 * with Web Audio has.
 */

/**
 * How fast a gain moves when the music drops out, comes back or stops, as a time constant: a cut
 * to the ear, but not an instant one, which would click.
 */
const CUT_S = 0.005;

/** How long a sound is let fade before it is stopped: five time constants is under 1% left. */
const FADE_S = 5 * CUT_S;

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
  // Kept so a skip on the black card can stop it: the snore waits a beat before it starts, and
  // must not then play over Module 2's music.
  let snore: Playing | undefined;
  let closed = false;
  // The loop is rendered once: Module 2's ident starts it again, and must not pay for it twice.
  let loop: AudioBuffer | undefined;

  const play = (buffer: AudioBuffer, options: { loop: boolean; at: number }): Playing => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop;
    const gain = context.createGain();
    source.connect(gain).connect(context.destination);
    source.start(options.at);
    return { source, gain };
  };

  const gainTo = (level: number) => music?.gain.gain.setTargetAtTime(level, context.currentTime, CUT_S);

  /** Both sounds faded out and stopped: a source stopped mid-wave clicks. */
  const stopAll = () => {
    for (const playing of [music, snore]) {
      playing?.gain.gain.setTargetAtTime(0, context.currentTime, CUT_S);
      playing?.source.stop(context.currentTime + FADE_S);
    }
    music = undefined;
    snore = undefined;
  };

  return {
    start: () => {
      if (music || closed) return;

      loop ??= bufferOf(context, renderTune(tune));
      music = play(loop, { loop: true, at: 0 });
    },
    dropOut: () => gainTo(0),
    resume: () => gainTo(1),
    stop: stopAll,
    snore: () => {
      if (closed) return;

      snore = play(bufferOf(context, renderSnore()), { loop: false, at: context.currentTime + SNORE_PAUSE_S });
    },
    // The context's own clock stops with it, so whatever was scheduled holds its place too. A
    // context once allowed to play may be resumed outside a gesture; if the browser says no, the
    // video plays on without it.
    pause: () => {
      if (!closed) context.suspend().catch(() => {});
    },
    unpause: () => {
      if (!closed) context.resume().catch(() => {});
    },
    close: () => {
      if (closed) return;

      closed = true;
      stopAll();
      // Closing the context silences it at once, so it waits out the fade.
      setTimeout(() => void context.close().catch(() => {}), FADE_S * 1000);
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
