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

  useEffect(
    () => () => {
      try {
        audio.current.close();
      } catch {
        // Leaving the screen anyway: nothing left to keep quiet for.
      }
      audio.current = silentIntroAudio;
    },
    [],
  );

  return useCallback((event: IntroEvent) => {
    try {
      if (event.type === "started") audio.current = openRef.current();
      cue(audio.current, event);
    } catch {
      audio.current = silentIntroAudio;
    }
  }, []);
}
