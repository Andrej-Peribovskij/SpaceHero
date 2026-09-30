import { Button } from "@space-hero/design-system";
import { useEffect } from "react";

import { IntroCardFrame } from "./intro-card-frame";
import { INTRO_CARDS, captionText } from "./script";
import { useIntroTimeline } from "./use-intro-timeline";

/**
 * Chapter 1, beat 0: the Absolute Connections contractor orientation video.
 * Script: `docs/story/chapter-01-intro.md`. Behaviour: the `story/chapter-1-intro` spec.
 *
 * It opens on the corporate ident and waits. The corporation makes the player opt in to its
 * own propaganda, and the opt-in is doing technical work too: a browser will not start sound
 * until the user has pressed or clicked something, so the gate is where the music gets
 * permission to play.
 */
export function IntroView() {
  const { state, shownChars, start, skip } = useIntroTimeline();
  const card = INTRO_CARDS[state.card]!;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (state.phase === "gate") {
        // Escape and modifier or shortcut presses are not user activation: starting on them
        // would leave the music (slice 3) unable to play.
        const modifierOnly = ["Shift", "Control", "Alt", "Meta"].includes(event.key);
        if (event.key === "Escape" || modifierOnly || event.ctrlKey || event.metaKey || event.altKey) return;
        start();
      }
      else if (state.phase === "playing" && event.key === "Escape") skip();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.phase, start, skip]);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[var(--color-black)] p-6 text-[var(--color-white)]"
      onClick={state.phase === "gate" ? start : undefined}
    >
      <h1 className="sr-only">Absolute Connections Contractor Orientation</h1>

      <IntroCardFrame card={card} shownChars={shownChars} />

      {/* Set once per card, so a screen reader hears each caption whole (design.md §7). */}
      <p className="sr-only" aria-live="polite">
        {captionText(card)}
      </p>

      {state.phase === "gate" && (
        <p className="font-mono text-sm tracking-widest motion-safe:animate-pulse">
          PRESS ANY KEY TO BEGIN ORIENTATION
        </p>
      )}

      {/* No variant: the portable call, as in WidgetsView. Skipping records nothing. */}
      {state.phase === "playing" && <Button onClick={skip}>Skipping is recorded.</Button>}
    </main>
  );
}
