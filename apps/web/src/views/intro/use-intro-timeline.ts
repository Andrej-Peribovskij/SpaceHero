import { useCallback, useEffect, useRef, useState } from "react";

import {
  initialIntroState,
  stepIntro,
  visibleChars,
  type IntroAction,
  type IntroEvent,
  type IntroPhase,
  type IntroState,
} from "./intro-timeline";

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

/** What the view shows of the timeline: it re-renders when one of these changes, and only then. */
interface Shown {
  readonly phase: IntroPhase;
  readonly card: number;
  /** How much of the current caption to show: all of it when the player prefers reduced motion. */
  readonly shownChars: number;
}

function shownOf(state: IntroState, whole: boolean): Shown {
  return { phase: state.phase, card: state.card, shownChars: visibleChars(state, { whole }) };
}

const sameShown = (a: Shown, b: Shown) => a.phase === b.phase && a.card === b.card && a.shownChars === b.shownChars;

export interface IntroTimeline extends Shown {
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
  const reducedMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(() => shownOf(initialIntroState, reducedMotion));
  // The timeline itself moves on every frame; React hears of it only when what is shown changes.
  const stateRef = useRef(initialIntroState);
  const wholeRef = useRef(reducedMotion);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Compared here, not in a state updater: an update React has to check can still cost a render.
  const shownRef = useRef(shown);
  const show = useCallback(() => {
    const next = shownOf(stateRef.current, wholeRef.current);
    if (sameShown(shownRef.current, next)) return;
    shownRef.current = next;
    setShown(next);
  }, []);

  // The setting can change mid-caption: show the caption whole, or typed, from now on.
  useEffect(() => {
    wholeRef.current = reducedMotion;
    show();
  }, [reducedMotion, show]);

  const dispatch = useCallback(
    (action: IntroAction) => {
      const step = stepIntro(stateRef.current, action);

      stateRef.current = step.state;
      show();
      for (const event of step.events) onEventRef.current?.(event);
    },
    [show],
  );

  useEffect(() => {
    if (shown.phase !== "playing") return;

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
  }, [shown.phase, dispatch]);

  const start = useCallback(() => dispatch({ type: "start" }), [dispatch]);
  const skip = useCallback(() => dispatch({ type: "skip" }), [dispatch]);

  return {
    ...shown,
    reducedMotion,
    start,
    skip,
  };
}
