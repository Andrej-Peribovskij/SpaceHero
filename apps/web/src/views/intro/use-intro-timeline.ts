import { useCallback, useEffect, useRef, useState } from "react";

import {
  initialIntroState,
  stepIntro,
  visibleChars,
  type IntroAction,
  type IntroEvent,
  type IntroState,
} from "./intro-timeline";
import { INTRO_CARDS, captionText } from "./script";

/**
 * The longest step one animation frame may take — a backstop, not the pause mechanism.
 *
 * Browsers stop calling `requestAnimationFrame` in a background tab, so without care, coming
 * back would deliver the whole absence as one tick and the video would jump ahead. The loop
 * handles that by restarting its clock when the page is hidden. This cap only catches a stall
 * that no visibility change announced. It is deliberately generous: a slow or throttled machine
 * that draws five frames a second must still play the video at its real speed, which a tight
 * cap would silently slow down.
 */
const MAX_FRAME_MS = 1000;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function reducedMotionQuery(): MediaQueryList | undefined {
  return typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION) : undefined;
}

/** Whether the player has asked for less motion. Follows the setting live. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => reducedMotionQuery()?.matches ?? false);

  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) return;

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export interface IntroTimeline {
  readonly state: IntroState;
  /** How much of the current caption to show: all of it when the player prefers reduced motion. */
  readonly shownChars: number;
  readonly reducedMotion: boolean;
  readonly start: () => void;
  readonly skip: () => void;
}

/**
 * Drives the pure timeline from the browser's frame clock.
 *
 * `onEvent` hears every event the timeline emits, synchronously and in order, including the
 * ones fired from inside the player's key or click handler. That matters for audio: a browser
 * only lets sound start from within a user gesture, so the `started` event has to reach the
 * music while the gesture is still on the stack.
 */
export function useIntroTimeline(onEvent?: (event: IntroEvent) => void): IntroTimeline {
  const [state, setState] = useState(initialIntroState);
  const stateRef = useRef(state);
  const onEventRef = useRef(onEvent);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const dispatch = useCallback((action: IntroAction) => {
    const step = stepIntro(stateRef.current, action);

    stateRef.current = step.state;
    setState(step.state);
    for (const event of step.events) onEventRef.current?.(event);
  }, []);

  useEffect(() => {
    if (state.phase !== "playing") return;

    let frame = 0;
    let last: number | undefined;

    const loop = (now: number) => {
      if (last !== undefined) dispatch({ type: "tick", dtMs: Math.min(now - last, MAX_FRAME_MS) });
      last = now;
      frame = requestAnimationFrame(loop);
    };

    // Hidden, the video pauses: the next frame after coming back starts a fresh clock.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") last = undefined;
    };

    frame = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [state.phase, dispatch]);

  const start = useCallback(() => dispatch({ type: "start" }), [dispatch]);
  const skip = useCallback(() => dispatch({ type: "skip" }), [dispatch]);

  return {
    state,
    shownChars: reducedMotion ? captionText(INTRO_CARDS[state.card]!).length : visibleChars(state),
    reducedMotion,
    start,
    skip,
  };
}
