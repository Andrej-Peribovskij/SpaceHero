import { useCallback, useEffect, useRef } from "react";

import type { IntroEvent } from "./intro-timeline";
import { silentIntroAudio, type IntroAudio } from "./music/intro-audio";
import { SNORE_CARD } from "./script";

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
      if (event.index === SNORE_CARD) {
        audio.stop();
        audio.snore();
      }
      return;
    case "skipped":
      return audio.stop();
    case "ended":
      // Module 2's ident starts the loop again from the top, and it plays while the ident waits:
      // in beat 1, it is what wakes Joe. Skipped or played through, Module 1 is over.
      return audio.start();
  }
}

/**
 * The music, listening to the timeline: hand what this returns to `useIntroTimeline`.
 *
 * The audio is opened on `started`, which the timeline fires synchronously from inside the gate's
 * key or click handler. That is the one moment a browser lets sound begin, so `open` must create
 * and resume its `AudioContext` there and then, not later.
 *
 * Sound never stops the video. If opening or playing throws, the music goes silent for the rest
 * of the video and every card plays on.
 */
export function useIntroMusic(open: () => IntroAudio): (event: IntroEvent) => void {
  const audio = useRef<IntroAudio>(silentIntroAudio);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

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
