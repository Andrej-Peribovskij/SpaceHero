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

/** How long a finished caption stays on screen before the next card, unless the card says otherwise. */
export const HOLD_MS = 3000;

/** How long the ident stays once the player has opted in, before card 1. */
export const IDENT_HOLD_MS = 2500;

/** How long the music stays out after the Ganymede line. Must end inside card 6's hold. */
export const GLITCH_SILENCE_MS = 1500;

/** How long the punched screen takes to die: to a line, a dot, and black. Card 10 ends with it. */
export const POWER_OFF_MS = 600;

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
  | { readonly type: "skip" }
  /** Jump to the start of a card: a debugging aid, never the player's. See `useDebugSeek`. */
  | { readonly type: "seek"; readonly card: number };

export type IntroEvent =
  | { readonly type: "started" }
  | { readonly type: "card"; readonly index: number }
  | { readonly type: "glitch" }
  | { readonly type: "glitch-end" }
  /** Someone snores in Joe's room, on card 9. */
  | { readonly type: "snore" }
  /** Joe wakes, on card 10. */
  | { readonly type: "wake" }
  /** Joe punches the screen: the music dies, and the picture with it. */
  | { readonly type: "punch" }
  | { readonly type: "skipped" }
  /** The video jumped, to the start of card `index`. The `card` event for it follows. */
  | { readonly type: "seeked"; readonly index: number }
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
 * holds. The last card — the next module's ident — appears whole, as the first one did, and lasts
 * until Joe's punch has killed the screen: the video ends on black.
 */
export function cardDurationMs(index: number): number {
  return TIMINGS[index]!.durationMs;
}

function durationOf(index: number): number {
  const card = INTRO_CARDS[index]!;

  if (index === IDENT_CARD) return IDENT_HOLD_MS;
  if (card.punchAtMs !== undefined) return card.punchAtMs + POWER_OFF_MS;

  return msToType(card, captionText(card).length) + (card.holdMs ?? HOLD_MS);
}

export interface VisibleCharsOptions {
  /** Show every caption whole, never typed: for players who prefer reduced motion. */
  readonly whole?: boolean;
}

/**
 * The characters of the current caption to show. Both idents are always whole, never typed, and
 * so is every caption when `whole` is asked for: this is the one place that rule lives.
 */
export function visibleChars(state: IntroState, options: VisibleCharsOptions = {}): number {
  const card = INTRO_CARDS[state.card]!;
  const whole = options.whole || state.phase !== "playing" || state.card === IDENT_CARD || state.card === END_CARD;

  return whole ? TIMINGS[state.card]!.captionLength : typedCharsAt(card, state.elapsedMs);
}

/**
 * When, from the start of a card, the Ganymede glitch fires: as its line finishes typing. One
 * moment for both what reacts to it, the screen tearing and the music dropping out.
 */
export function glitchMs(index: number): number | undefined {
  return TIMINGS[index]!.glitchMs;
}

function glitchOf(card: IntroCard): number | undefined {
  return card.glitchAtChar === undefined ? undefined : msToType(card, card.glitchAtChar);
}

/**
 * When, from the start of a card, Joe's punch kills the screen. One moment for both what reacts to
 * it, the picture collapsing and the music dying.
 */
export function punchMs(index: number): number | undefined {
  return INTRO_CARDS[index]!.punchAtMs;
}

export interface Cue {
  readonly atMs: number;
  readonly event: IntroEvent;
}

/** The events that fire partway through a card, rather than on entering it, in the order they happen. */
export function cuesOf(card: IntroCard): readonly Cue[] {
  const glitchAtMs = glitchOf(card);
  const cues: Cue[] = [];

  if (glitchAtMs !== undefined) {
    cues.push({ atMs: glitchAtMs, event: { type: "glitch" } });
    cues.push({ atMs: glitchAtMs + GLITCH_SILENCE_MS, event: { type: "glitch-end" } });
  }
  const snoreAtMs = snoreOf(card);
  if (snoreAtMs !== undefined) cues.push({ atMs: snoreAtMs, event: { type: "snore" } });
  if (card.wakeAtMs !== undefined) cues.push({ atMs: card.wakeAtMs, event: { type: "wake" } });
  if (card.punchAtMs !== undefined) cues.push({ atMs: card.punchAtMs, event: { type: "punch" } });

  // In the order they happen, which is the order a tick crossing several of them fires them in.
  // Stable, so cues at the same moment keep the order they were pushed in.
  return cues.sort((a, b) => a.atMs - b.atMs);
}

function snoreOf(card: IntroCard): number | undefined {
  return card.snoreAfterMs === undefined ? undefined : msToType(card, captionText(card).length) + card.snoreAfterMs;
}

/** When, from the start of a card, someone in Joe's room snores: on card 9, once its caption is typed. */
export function snoreMs(index: number): number | undefined {
  return snoreOf(INTRO_CARDS[index]!);
}

interface CardTiming {
  readonly durationMs: number;
  readonly cues: readonly Cue[];
  readonly captionLength: number;
  readonly glitchMs: number | undefined;
}

/**
 * Each card's timings, worked out once: the script never changes, and `tick` reads them every
 * frame. Walking every caption again sixty times a second would be work for nothing.
 */
const TIMINGS: readonly CardTiming[] = INTRO_CARDS.map((card, index) => ({
  durationMs: durationOf(index),
  cues: cuesOf(card),
  captionLength: captionText(card).length,
  glitchMs: glitchOf(card),
}));

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
      // No skipping before the player has opted in: there is nothing yet to skip. Skipping skips
      // Module 1, so it lands on Module 2's ident, and Joe still wakes and punches the screen.
      // There is nothing to skip on that card itself: it is the ending.
      if (state.phase !== "playing" || state.card === END_CARD) return { state, events: [] };

      return {
        state: { phase: "playing", card: END_CARD, elapsedMs: 0 },
        events: [{ type: "skipped" }, { type: "card", index: END_CARD }],
      };

    case "seek":
      return seek(state, action.card);

    case "tick":
      return tick(state, action.dtMs);
  }
}

/**
 * Go to the start of a card, clamped to the cards there are, and play on from there. Allowed once
 * the player has opted in, and from the end too, which then plays again. Seeking to the last card
 * plays it from the top: Module 2's music, Joe waking, the punch.
 */
function seek(state: IntroState, card: number): IntroStep {
  // A card that is no number is nowhere to go: clamping cannot make one of NaN.
  if (state.phase === "gate" || !Number.isFinite(card)) return { state, events: [] };

  const index = Math.min(Math.max(Math.trunc(card), IDENT_CARD), END_CARD);

  return {
    state: { phase: "playing", card: index, elapsedMs: 0 },
    events: [{ type: "seeked", index }, { type: "card", index }],
  };
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

  // Keep going while time is left, or while the card just entered is already used up: a card that
  // takes no time must pass in the tick that reaches it, not the next one.
  while (remaining > 0 || elapsedMs >= cardDurationMs(card)) {
    const duration = cardDurationMs(card);
    const next = Math.min(duration, elapsedMs + remaining);

    for (const cue of TIMINGS[card]!.cues) {
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
