import { END_CARD, IDENT_CARD, INTRO_CARDS, captionText, type IntroCard } from "./script";

/**
 * The intro as a pure timeline: a state, an action, the next state and what happened.
 *
 * No React, no clock, no audio. Time only moves when a caller sends a `tick` with a
 * duration, which is what lets a test play the whole video in a millisecond and assert every
 * card and every cue on the way — see design.md §2. Whatever *reacts* to the video (the
 * music, later the picture's glitch) listens to the events `stepIntro` returns rather than
 * working out for itself where the video is.
 */

/** How long one caption character takes to type. */
export const MS_PER_CHAR = 40;

/** How long a finished caption stays on screen before the next card. */
export const HOLD_MS = 3000;

/** How long the ident stays once the player has opted in, before card 1. */
export const IDENT_HOLD_MS = 2500;

/** How long the music stays out after the Ganymede line. Must end inside card 6's hold. */
export const GLITCH_SILENCE_MS = 1500;

export type IntroPhase = "gate" | "playing" | "ended";

/**
 * Where the video is. `card` and `elapsedMs` mean the same thing in every phase: at the gate
 * the ident is shown and time has not started; once ended, the last card is shown complete.
 */
export interface IntroState {
  readonly phase: IntroPhase;
  readonly card: number;
  readonly elapsedMs: number;
}

export type IntroAction =
  | { readonly type: "start" }
  | { readonly type: "tick"; readonly dtMs: number }
  | { readonly type: "skip" };

export type IntroEvent =
  | { readonly type: "started" }
  | { readonly type: "card"; readonly index: number }
  | { readonly type: "glitch" }
  | { readonly type: "glitch-end" }
  | { readonly type: "skipped" }
  | { readonly type: "ended" };

export interface IntroStep {
  readonly state: IntroState;
  readonly events: readonly IntroEvent[];
}

export const initialIntroState: IntroState = { phase: "gate", card: IDENT_CARD, elapsedMs: 0 };

/** The moment, from the start of a card, at which its first `chars` characters are visible. */
export function msToType(card: IntroCard, chars: number): number {
  let ms = 0;
  let remaining = chars;

  for (const segment of card.caption) {
    if (remaining <= segment.text.length) return ms + remaining * MS_PER_CHAR;

    remaining -= segment.text.length;
    ms += segment.text.length * MS_PER_CHAR + (segment.pauseAfterMs ?? 0);
  }

  return ms;
}

/** How many characters of a card's caption are visible `ms` after it started. */
export function typedCharsAt(card: IntroCard, ms: number): number {
  let clock = 0;
  let typed = 0;

  for (const segment of card.caption) {
    const typingMs = segment.text.length * MS_PER_CHAR;

    if (ms < clock + typingMs) return typed + Math.floor((ms - clock) / MS_PER_CHAR);

    typed += segment.text.length;
    clock += typingMs + (segment.pauseAfterMs ?? 0);

    if (ms < clock) return typed;
  }

  return typed;
}

/**
 * How long a card is on screen. The ident is already whole when the player opts in, so it only
 * holds. The last card — the next module's ident — takes no time at all: it appears whole, as the
 * first one did, and the video ends the moment it is on screen.
 */
export function cardDurationMs(index: number): number {
  const card = INTRO_CARDS[index]!;
  const typing = msToType(card, captionText(card).length);

  if (index === IDENT_CARD) return IDENT_HOLD_MS;
  if (index === END_CARD) return 0;

  return typing + HOLD_MS;
}

/** The characters of the current caption to show. Both idents are always whole, never typed. */
export function visibleChars(state: IntroState): number {
  const card = INTRO_CARDS[state.card]!;

  if (state.phase !== "playing" || state.card === IDENT_CARD || state.card === END_CARD) {
    return captionText(card).length;
  }

  return typedCharsAt(card, state.elapsedMs);
}

/** When, from the start of a card, the Ganymede glitch fires: as its line finishes typing. */
export function glitchMs(card: IntroCard): number | undefined {
  return card.glitchAtChar === undefined ? undefined : msToType(card, card.glitchAtChar);
}

interface Cue {
  readonly atMs: number;
  readonly event: IntroEvent;
}

/** The events that fire partway through a card, rather than on entering it. */
function cuesOf(index: number): readonly Cue[] {
  const atMs = glitchMs(INTRO_CARDS[index]!);

  if (atMs === undefined) return [];

  return [
    { atMs, event: { type: "glitch" } },
    { atMs: atMs + GLITCH_SILENCE_MS, event: { type: "glitch-end" } },
  ];
}

const ENDED: IntroState = { phase: "ended", card: END_CARD, elapsedMs: cardDurationMs(END_CARD) };

export function stepIntro(state: IntroState, action: IntroAction): IntroStep {
  switch (action.type) {
    case "start":
      if (state.phase !== "gate") return { state, events: [] };

      return {
        state: { phase: "playing", card: IDENT_CARD, elapsedMs: 0 },
        events: [{ type: "started" }, { type: "card", index: IDENT_CARD }],
      };

    case "skip":
      // No skipping before the player has opted in: there is nothing yet to skip.
      if (state.phase !== "playing") return { state, events: [] };

      return { state: ENDED, events: [{ type: "skipped" }, { type: "ended" }] };

    case "tick":
      return tick(state, action.dtMs);
  }
}

/**
 * Advance by `dtMs`, crossing as many cards as that takes. A long tick is not a special case:
 * it fires every cue and every card it passes, in order, exactly as short ones would.
 */
function tick(state: IntroState, dtMs: number): IntroStep {
  if (state.phase !== "playing" || dtMs <= 0) return { state, events: [] };

  const events: IntroEvent[] = [];
  let { card, elapsedMs } = state;
  let remaining = dtMs;

  // Keep going while time is left, or while the card just entered is already used up: the last
  // card takes no time, and must end the video in the tick that reaches it, not the next one.
  while (remaining > 0 || elapsedMs >= cardDurationMs(card)) {
    const duration = cardDurationMs(card);
    const next = Math.min(duration, elapsedMs + remaining);

    for (const cue of cuesOf(card)) {
      if (elapsedMs < cue.atMs && cue.atMs <= next) events.push(cue.event);
    }

    remaining -= next - elapsedMs;
    elapsedMs = next;

    if (elapsedMs < duration) break;

    if (card === END_CARD) {
      events.push({ type: "ended" });
      return { state: ENDED, events };
    }

    card += 1;
    elapsedMs = 0;
    events.push({ type: "card", index: card });
  }

  return { state: { phase: "playing", card, elapsedMs }, events };
}
