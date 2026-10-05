import { useCallback, useEffect, useRef, useState } from "react";

import { IDENT_CARD } from "./script";
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

/** Where the screen is on a card's own clock. */
export interface CardClock {
  /** The card the time belongs to: a screen still showing another card holds its picture. */
  readonly card: number;
  readonly ms: number;
}

export interface IntroTimeline extends Shown {
  /**
   * The clock the screen paints from, read every frame rather than rendered. While a card plays it
   * is the timeline's own, so the picture keeps step with the caption: it stops while the page is
   * hidden and loses what a stalled frame loses, as the caption does. The ident at the gate, which
   * nothing cues, runs on it too, by the same frames.
   */
  readonly clock: { readonly current: CardClock };
  readonly reducedMotion: boolean;
  readonly start: () => void;
  readonly skip: () => void;
  /** Jumps to the start of a card: a debugging aid, never the player's. See `useDebugSeek`. */
  readonly seek: (card: number) => void;
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

  const clock = useRef<CardClock>({ card: initialIntroState.card, ms: 0 });

  /**
   * The screen's clock moves on: with the timeline once it has started, by `dtMs` for the ident,
   * which nothing cues. Ended, it holds where the video stopped: black, after the punch.
   */
  const advanceClock = useCallback((dtMs: number) => {
    const state = stateRef.current;
    const timed = state.phase !== "gate" && state.card !== IDENT_CARD;
    const sameCard = state.card === clock.current.card;
    clock.current = { card: state.card, ms: timed ? state.elapsedMs : sameCard ? clock.current.ms + dtMs : 0 };
  }, []);

  const dispatch = useCallback(
    (action: IntroAction) => {
      const step = stepIntro(stateRef.current, action);

      stateRef.current = step.state;
      // Before React hears of a new card, so the screen never paints one card at another's time.
      advanceClock(action.type === "tick" ? action.dtMs : 0);
      show();
      for (const event of step.events) onEventRef.current?.(event);
    },
    [advanceClock, show],
  );

  /** When the frame clock last counted to: the last frame, or a key press since it. */
  const counted = useRef<number | undefined>(undefined);

  // The frame clock runs for as long as the video is on screen: the timeline only moves while it
  // plays, but the ident at the gate is never still.
  useEffect(() => {
    let frame = 0;

    const loop = (now: number) => {
      const last = counted.current;
      const dtMs = last === undefined ? 0 : Math.min(Math.max(0, now - last), MAX_FRAME_MS);
      // A frame is stamped with when it was due. One held up by a slow key press is stamped before
      // the press ended, and must not wind the clock back to before it.
      counted.current = last === undefined ? now : Math.max(now, last);
      if (stateRef.current.phase === "playing" && dtMs > 0) dispatch({ type: "tick", dtMs });
      else advanceClock(dtMs);
      frame = requestAnimationFrame(loop);
    };

    // Hidden, the video pauses: the next frame after coming back starts a fresh clock.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") counted.current = undefined;
    };

    frame = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [dispatch, advanceClock]);

  /**
   * An action from the player, between two frames: what it starts is timed from now, not from the
   * frame before it. A frame can be a third of a second apart in a throttled tab, and the next tick
   * would otherwise hand the new card time that passed before the key was pressed.
   */
  const byPlayer = useCallback(
    (action: IntroAction) => {
      dispatch(action);
      if (counted.current !== undefined) counted.current = performance.now();
    },
    [dispatch],
  );

  const start = useCallback(() => byPlayer({ type: "start" }), [byPlayer]);
  const skip = useCallback(() => byPlayer({ type: "skip" }), [byPlayer]);
  const seek = useCallback((card: number) => byPlayer({ type: "seek", card }), [byPlayer]);

  return {
    ...shown,
    clock,
    reducedMotion,
    start,
    skip,
    seek,
  };
}
