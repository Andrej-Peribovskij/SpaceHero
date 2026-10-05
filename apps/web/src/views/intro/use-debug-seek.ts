import { useEffect, useState } from "react";

import type { IntroPhase } from "./intro-timeline";
import { END_CARD, IDENT_CARD } from "./script";

/** The address parameter naming the card a debugging session starts at. */
export const CARD_PARAM = "card";

/** The card an address asks to start at, if it names one past the ident that exists. */
export function startCardOf(search: string): number | undefined {
  const value = new URLSearchParams(search).get(CARD_PARAM);
  if (value === null || !/^\d+$/.test(value)) return undefined;

  const card = Number(value);
  return card > IDENT_CARD && card <= END_CARD ? card : undefined;
}

/** Writes the card jumped to into the address, so a reload starts there. The router's own state is kept. */
function remember(card: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set(CARD_PARAM, String(card));
  window.history.replaceState(window.history.state, "", url);
}

export interface DebugSeekOptions {
  readonly enabled: boolean;
  readonly phase: IntroPhase;
  readonly card: number;
  readonly seek: (card: number) => void;
}

/**
 * Card by card, for tuning the intro: a debugging aid, never the player's. `IntroView` turns it on
 * in the dev server only, so a production build has no way to jump; the player can only skip.
 *
 * Once the video plays, → jumps to the start of the next card and ← to the start of the one
 * before, each playing on from there, music restarted from the top. The card jumped to is written
 * into the address as `?card=N`, and an address carrying it starts there: a reload after editing a
 * card lands back on it, not eighty seconds before it. The gate still waits for a key, because only
 * a key press lets the music start.
 *
 * Returns the card to start at once the gate opens, if the address names one.
 */
export function useDebugSeek({ enabled, phase, card, seek }: DebugSeekOptions): number | undefined {
  const [startCard] = useState(() => (enabled ? startCardOf(window.location.search) : undefined));

  useEffect(() => {
    if (!enabled || phase === "gate") return;

    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (step === 0) return;

      const target = Math.min(Math.max(card + step, IDENT_CARD), END_CARD);
      // Past either end there is nowhere to go: the card stays as it is, playing on or over, rather
      // than starting again from its top.
      if (target === card) return;

      seek(target);
      remember(target);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, phase, card, seek]);

  return startCard;
}
