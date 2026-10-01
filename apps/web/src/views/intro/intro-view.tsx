import { Button } from "@space-hero/design-system";
import { useEffect, useRef } from "react";

import { artFor } from "./art";
import { IntroCardFrame } from "./intro-card-frame";
import { INTRO_CARDS, captionText } from "./script";
import { useIntroTimeline } from "./use-intro-timeline";

/**
 * The line under an ident that asks the player for a key, if one is showing. The next module's
 * ident asks the same way the first did, and nothing answers it yet: in beat 1 the key press is
 * Joe slapping the screen off (docs/product-debt/intro-hand-off-to-beat-1.md).
 */
const PROMPTS = {
  gate: "PRESS ANY KEY TO BEGIN ORIENTATION",
  playing: undefined,
  ended: "PRESS ANY KEY TO CONTINUE ORIENTATION",
} as const;

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
  const { state, shownChars, reducedMotion, start, skip } = useIntroTimeline();
  const card = INTRO_CARDS[state.card]!;
  const prompt = PROMPTS[state.phase];
  const mainRef = useRef<HTMLElement>(null);

  // Ending unmounts the skip button. If it had focus, the browser drops focus to the top of the
  // document and a keyboard or screen-reader user loses their place; keep them on the video.
  useEffect(() => {
    const focusLost = document.activeElement === null || document.activeElement === document.body;
    if (state.phase === "ended" && focusLost) mainRef.current?.focus();
  }, [state.phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (state.phase === "gate") {
        // Escape and modifier or shortcut presses are not user activation: starting on them
        // would leave the music (slice 3) unable to play.
        const modifierOnly = ["Shift", "Control", "Alt", "Meta"].includes(event.key);
        if (event.key === "Escape" || modifierOnly || event.ctrlKey || event.metaKey || event.altKey) return;
        start();
      } else if (state.phase === "playing" && event.key === "Escape") skip();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.phase, start, skip]);

  return (
    <main
      ref={mainRef}
      // Focusable from script only, as the landing place when skipping removes the button.
      tabIndex={-1}
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[var(--color-black)] p-6 text-[var(--color-white)] outline-none"
      onClick={state.phase === "gate" ? start : undefined}
    >
      <h1 className="sr-only">Absolute Connections Contractor Orientation</h1>

      <IntroCardFrame
        card={card}
        shownChars={shownChars}
        art={artFor(state.card)}
        prompt={prompt}
        still={reducedMotion}
      />

      {/* Set once per card, so a screen reader hears each caption whole (design.md §7). */}
      <p className="sr-only" aria-live="polite">
        {captionText(card)}
      </p>

      {/* The prompt blinks on the screen; this is it as text, for assistive technology. */}
      {prompt && <p className="sr-only">{prompt}</p>}

      {/* No variant: the portable call, as in WidgetsView. Skipping records nothing. */}
      {state.phase === "playing" && <Button onClick={skip}>Skipping is recorded.</Button>}
    </main>
  );
}
