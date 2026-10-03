import { Button } from "@space-hero/design-system";
import { useCallback, useEffect, useRef, useState } from "react";

import { artFor } from "./art";
import { IntroCardFrame } from "./intro-card-frame";
import type { IntroAudio } from "./music/intro-audio";
import { ORIENTATION_TUNE } from "./music/tune";
import { openIntroAudio, prepareIntroAudio } from "./music/web-audio";
import { canvasDraws } from "./screen/canvas";
import { INTRO_CARDS, captionText } from "./script";
import { useDebugSeek } from "./use-debug-seek";
import { useIntroMusic } from "./use-intro-music";
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

/** The orientation music through Web Audio, or silence where the browser has none to give. */
const openOrientationAudio = () => openIntroAudio(ORIENTATION_TUNE);

/** Renders the orientation music while the gate waits, so the key press need not. */
const prepareOrientationAudio = () => prepareIntroAudio(ORIENTATION_TUNE);

export interface IntroViewProps {
  /** Opens the music, from inside the gate's key or click handler. Tests pass a recording one. */
  readonly openAudio?: () => IntroAudio;
  /** Works out ahead, in idle time, what opening the music would otherwise have to. */
  readonly prepareAudio?: () => void;
  /** Arrow keys and `?card=N` jump between cards, for tuning: on in the dev server only. */
  readonly debugSeek?: boolean;
}

/**
 * Chapter 1, beat 0: the Absolute Connections contractor orientation video.
 * Script: `docs/story/chapter-01-intro.md`. Behaviour: the `story/chapter-1-intro` spec.
 *
 * It opens on the corporate ident and waits. The corporation makes the player opt in to its
 * own propaganda, and the opt-in is doing technical work too: a browser will not start sound
 * until the user has pressed or clicked something, so the gate is where the music gets
 * permission to play.
 */
export function IntroView({
  openAudio = openOrientationAudio,
  prepareAudio = prepareOrientationAudio,
  debugSeek = import.meta.env.DEV,
}: IntroViewProps = {}) {
  const music = useIntroMusic(openAudio, prepareAudio);
  const { phase, card: index, shownChars, clock, reducedMotion, start, skip, seek } = useIntroTimeline(music);
  const startCard = useDebugSeek({ enabled: debugSeek, phase, card: index, seek });
  // Opening the gate, then — while debugging, with `?card=N` — jumping on, inside the same gesture.
  const begin = useCallback(() => {
    start();
    if (startCard !== undefined) seek(startCard);
  }, [start, seek, startCard]);
  const card = INTRO_CARDS[index]!;
  const prompt = PROMPTS[phase];
  const mainRef = useRef<HTMLElement>(null);
  // The caption and the prompt are kept as text for assistive technology. Where the screen cannot
  // paint them, that text is everyone's: shown, rather than an empty screen and no way to start.
  const [asText] = useState(() => !canvasDraws());
  const textClass = asText ? "font-mono text-sm tracking-widest" : "sr-only";

  // Ending unmounts the skip button. If it had focus, the browser drops focus to the top of the
  // document and a keyboard or screen-reader user loses their place; keep them on the video.
  useEffect(() => {
    const focusLost = document.activeElement === null || document.activeElement === document.body;
    if (phase === "ended" && focusLost) mainRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (phase === "gate") {
        // Escape and modifier or shortcut presses are not user activation: starting on them
        // would leave the music unable to play.
        const modifierOnly = ["Shift", "Control", "Alt", "Meta"].includes(event.key);
        if (event.key === "Escape" || modifierOnly || event.ctrlKey || event.metaKey || event.altKey) return;
        begin();
      } else if (phase === "playing" && event.key === "Escape") skip();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, begin, skip]);

  return (
    <main
      ref={mainRef}
      // Focusable from script only, as the landing place when skipping removes the button.
      tabIndex={-1}
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[var(--color-black)] p-6 text-[var(--color-white)] outline-none"
      onClick={phase === "gate" ? begin : undefined}
    >
      <h1 className="sr-only">Absolute Connections Contractor Orientation</h1>

      <IntroCardFrame
        index={index}
        clock={clock}
        card={card}
        shownChars={shownChars}
        art={artFor(index)}
        prompt={prompt}
        still={reducedMotion}
      />

      {/* Set once per card, so a screen reader hears each caption whole (design.md §7). */}
      <p className={textClass} aria-live="polite">
        {captionText(card)}
      </p>

      {/* The prompt blinks on the screen; this is it as text, for assistive technology. */}
      {prompt && <p className={textClass}>{prompt}</p>}

      {/* No variant: the portable call, as in WidgetsView. Skipping records nothing. */}
      {phase === "playing" && <Button onClick={skip}>Skipping is recorded.</Button>}
    </main>
  );
}
