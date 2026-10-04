import { useCallback, useEffect, useRef } from "react";

import type { IntroEvent } from "./intro-timeline";
import { silentIntroAudio, type IntroAudio } from "./music/intro-audio";
import { END_CARD } from "./script";

/** What each moment of the video asks of the music. Everything else leaves it as it is. */
function cue(audio: IntroAudio, event: IntroEvent): void {
  switch (event.type) {
    case "started":
      return audio.start();
    case "glitch":
      return audio.dropOut();
    case "glitch-end":
      return audio.resume();
    case "card":
      // Module 2's ident is the next video, and starts the loop again from the top: a cut, as one
      // video gives way to the next, never a silence. Skipped or played through, Module 1 is over,
      // and Joe has slept through it; this is what wakes him.
      if (event.index === END_CARD) {
        audio.stop();
        audio.start();
      }
      return;
    case "snore":
      return audio.snore();
    case "wake":
      return audio.wake();
    case "punch":
      return audio.punch();
    case "skipped":
      return audio.stop();
    case "seeked":
      // A jump, while debugging: the loop starts again from the top, out of whatever it was in —
      // the glitch's silence, or the snore, which the stop cancels. The card landed on comes next.
      audio.stop();
      return audio.start();
    case "ended":
      // The punch has already silenced everything: the video ends on black, and in silence.
      return;
  }
}

/**
 * Runs `task` when the browser next has time to spare, and returns a way to call it off. Safari
 * has no `requestIdleCallback`, so there it waits for the current task to finish instead.
 */
function whenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(task, { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }

  const id = setTimeout(task, 0);
  return () => clearTimeout(id);
}

/**
 * The music, listening to the timeline: hand what this returns to `useIntroTimeline`.
 *
 * The audio is opened on `started`, which the timeline fires synchronously from inside the gate's
 * key or click handler. That is the one moment a browser lets sound begin, so `open` must create
 * and resume its `AudioContext` there and then, not later.
 *
 * Whatever `open` would have to work out first, `prepare` works out ahead, while the gate waits:
 * it runs once, when the browser is next idle, so the key press is left only the quick part.
 *
 * Sound never stops the video. If opening or playing throws, the music goes silent for the rest
 * of the video and every card plays on.
 */
export function useIntroMusic(open: () => IntroAudio, prepare?: () => void): (event: IntroEvent) => void {
  const audio = useRef<IntroAudio>(silentIntroAudio);
  const openRef = useRef(open);
  const prepareRef = useRef(prepare);

  useEffect(() => {
    openRef.current = open;
    prepareRef.current = prepare;
  }, [open, prepare]);

  useEffect(
    () =>
      whenIdle(() => {
        try {
          prepareRef.current?.();
        } catch {
          // Nothing lost: opening the music works it out instead, or finds it cannot.
        }
      }),
    [],
  );

  /**
   * Lets go of the audio for good. Closed, not just dropped: a loop left playing by a cue that
   * threw would otherwise play on, with nothing left holding it to stop it.
   */
  const silence = useCallback(() => {
    const playing = audio.current;
    audio.current = silentIntroAudio;
    try {
      playing.close();
    } catch {
      // Broken already, or leaving the screen: there is nothing more to ask of it.
    }
  }, []);

  useEffect(() => silence, [silence]);

  // Hidden, the video pauses (`useIntroTimeline`), and the music holds with it rather than playing
  // on to an empty room. Before the gate the audio is the silent one, so nothing opens here.
  useEffect(() => {
    const onVisibilityChange = () => {
      try {
        if (document.visibilityState === "hidden") audio.current.pause();
        else audio.current.unpause();
      } catch {
        silence();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [silence]);

  return useCallback(
    (event: IntroEvent) => {
      try {
        if (event.type === "started") audio.current = openRef.current();
        cue(audio.current, event);
      } catch {
        silence();
      }
    },
    [silence],
  );
}
