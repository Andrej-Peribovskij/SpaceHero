import { silentIntroAudio, type IntroAudio } from "./intro-audio";
import { renderPunch } from "./punch";
import { loadSounds, loadedSounds, type RecordedSounds } from "./sounds";
import { SAMPLE_RATE, renderTune, type Tune } from "./synth";

/**
 * The intro's sound through Web Audio. Every sample is worked out already, by the synth or read
 * from a recording, so this only plays buffers, each through a gain of its own: the tune looping,
 * its gain closed and opened by the glitch, and the snore, the waking snort and the punch once
 * each. Two node types, buffer source and gain, which every browser with Web Audio has.
 */

/**
 * How fast a gain moves when the music drops out, comes back or stops, as a time constant: a cut
 * to the ear, but not an instant one, which would click.
 */
const CUT_S = 0.005;

/** How long a sound is let fade before it is stopped: five time constants is under 1% left. */
const FADE_S = 5 * CUT_S;

interface Playing {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

/**
 * Each tune's samples, rendered once for the page's life. They need no `AudioContext`, so
 * `prepareIntroAudio` can work them out ahead, and Module 2's restart never pays for them again.
 */
const rendered = new WeakMap<Tune, Float32Array<ArrayBuffer>>();

/** A tune's samples: rendered now if nothing has rendered them yet. */
export function renderedTune(tune: Tune): Float32Array<ArrayBuffer> {
  let samples = rendered.get(tune);
  if (!samples) rendered.set(tune, (samples = renderTune(tune)));
  return samples;
}

let punchSamples: Float32Array<ArrayBuffer> | undefined;

/** The punch's samples: rendered now if nothing has rendered them yet. */
const renderedPunch = () => (punchSamples ??= renderPunch());

/**
 * Works the tune out ahead, so the gate's key press only has to copy it into a buffer. Rendering
 * the loop takes tens of milliseconds, too long to spend inside the handler, where it would hold
 * up the first frame. The recorded sounds are fetched and the punch rendered now too, long before
 * the end needs them; the fetch goes first, so a render that throws cannot hold it back. Where
 * there is no Web Audio, nobody will hear any of it, so nothing is rendered or fetched.
 */
export function prepareIntroAudio(tune: Tune): void {
  if (typeof AudioContext === "undefined") return;

  void loadSounds();
  renderedTune(tune);
  renderedPunch();
}

function bufferOf(context: BaseAudioContext, samples: Float32Array<ArrayBuffer>): AudioBuffer {
  const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

/**
 * `sounds` is asked at the moment a recording is to play, not when the audio opens: the gate's key
 * may come before the fetch has finished, and card 9's snore long after it.
 */
export function webIntroAudio(context: AudioContext, tune: Tune, sounds: () => RecordedSounds = loadedSounds): IntroAudio {
  let music: Playing | undefined;
  // Kept so a stop can cut them: a skip during the snore must not let it run on into Module 2,
  // and leaving the screen must silence the snort and the blow too.
  let snore: Playing | undefined;
  let wake: Playing | undefined;
  let thump: Playing | undefined;
  let closed = false;
  // The loop's buffer, made once: Module 2's ident starts it again from the same one.
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

  /** Every sound faded out and stopped: a source stopped mid-wave clicks. */
  const stopAll = () => {
    for (const playing of [music, snore, wake, thump]) {
      playing?.gain.gain.setTargetAtTime(0, context.currentTime, CUT_S);
      playing?.source.stop(context.currentTime + FADE_S);
    }
    music = undefined;
    snore = undefined;
    wake = undefined;
    thump = undefined;
  };

  /** Samples, once, now: nothing if they never arrived. The timeline says when. */
  const playOnce = (samples: Float32Array<ArrayBuffer> | undefined): Playing | undefined => {
    if (closed || !samples) return undefined;

    return play(bufferOf(context, samples), { loop: false, at: context.currentTime });
  };

  return {
    start: () => {
      if (music || closed) return;

      loop ??= bufferOf(context, renderedTune(tune));
      music = play(loop, { loop: true, at: 0 });
    },
    dropOut: () => gainTo(0),
    resume: () => gainTo(1),
    stop: stopAll,
    snore: () => {
      snore = playOnce(sounds().snore);
    },
    wake: () => {
      wake = playOnce(sounds().wake);
    },
    // The set is struck dead: everything stops at once, in the gain's short cut rather than a
    // fade a listener would hear, and the blow sounds over the silence.
    punch: () => {
      stopAll();
      thump = playOnce(renderedPunch());
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
    // Whatever preparing did not fetch, or failed to: card 9 is over a minute away yet.
    void loadSounds();
    return webIntroAudio(context, tune);
  } catch {
    return silentIntroAudio;
  }
}
