/**
 * The orientation's sound, as the video sees it: seven things that happen to the music, and a way
 * to let go of the speakers. Nothing here knows about Web Audio — see design.md §5.
 *
 * The port exists so the rest of the intro never has to ask whether sound works. A browser may
 * have no `AudioContext`, may refuse one, or may have no output at all; the video plays the same
 * either way, through the silent implementation below. Tests use a recording one, and assert on
 * what was asked of the music rather than on what came out of a speaker.
 */
export interface IntroAudio {
  /**
   * The loop begins, from the top. The first start comes from inside the gate's key or click
   * handler: see `useIntroMusic`. After a stop, a start begins the loop again.
   */
  readonly start: () => void;
  /** The music cuts out, mid-bar, as if the signal had been lost. The loop runs on, unheard. */
  readonly dropOut: () => void;
  /** The music is back, where the loop has got to by now, as if nothing had happened. */
  readonly resume: () => void;
  /** The music ends: Module 1 is over. */
  readonly stop: () => void;
  /** Someone in the room is asleep. */
  readonly snore: () => void;
  /** The video has paused, its page hidden: every sound holds where it is, the snore's wait too. */
  readonly pause: () => void;
  /** The page is back: every sound goes on from where it held. */
  readonly unpause: () => void;
  /** Lets go of the audio hardware: the intro has left the screen. */
  readonly close: () => void;
}

const nothing = () => {};

/** The intro with no sound: where audio is missing or broken, and wherever nobody asked for it. */
export const silentIntroAudio: IntroAudio = {
  start: nothing,
  dropOut: nothing,
  resume: nothing,
  stop: nothing,
  snore: nothing,
  pause: nothing,
  unpause: nothing,
  close: nothing,
};
