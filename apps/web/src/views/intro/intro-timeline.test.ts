import {
  GLITCH_SILENCE_MS,
  HOLD_MS,
  MS_PER_CHAR,
  cardDurationMs,
  initialIntroState,
  msToType,
  stepIntro,
  typedCharsAt,
  visibleChars,
  type IntroEvent,
  type IntroState,
} from "./intro-timeline";
import { END_CARD, INTRO_CARDS, captionText } from "./script";

/** Run a list of actions from the gate, collecting every event on the way. */
function play(...actions: Parameters<typeof stepIntro>[1][]): { state: IntroState; events: IntroEvent[] } {
  let state = initialIntroState;
  const events: IntroEvent[] = [];

  for (const action of actions) {
    const step = stepIntro(state, action);
    state = step.state;
    events.push(...step.events);
  }

  return { state, events };
}

/** The whole video's running time, gate excluded. */
const TOTAL_MS = INTRO_CARDS.reduce((sum, _card, index) => sum + cardDurationMs(index), 0);

/** Tick in frame-sized steps, the way the browser will. */
function frames(ms: number, frameMs = 16): { type: "tick"; dtMs: number }[] {
  return Array.from({ length: Math.ceil(ms / frameMs) }, () => ({ type: "tick" as const, dtMs: frameMs }));
}

describe("the gate", () => {
  it("holds on the ident, whole, however much time passes", () => {
    const { state, events } = play({ type: "tick", dtMs: 60_000 });

    expect(state).toEqual(initialIntroState);
    expect(events).toEqual([]);
    expect(visibleChars(state)).toBe(captionText(INTRO_CARDS[0]!).length);
  });

  it("cannot be skipped before the player opts in", () => {
    expect(play({ type: "skip" }).state).toEqual(initialIntroState);
  });

  it("starts on the ident when the player opts in", () => {
    const { state, events } = play({ type: "start" });

    expect(state).toEqual({ phase: "playing", card: 0, elapsedMs: 0 });
    expect(events).toEqual([{ type: "started" }, { type: "card", index: 0 }]);
  });
});

describe("the sequence", () => {
  it("shows cards 1 to 10 once each, in order, then ends", () => {
    const { state, events } = play({ type: "start" }, ...frames(TOTAL_MS + 1000));

    const cards = events.flatMap((event) => (event.type === "card" ? [event.index] : []));

    expect(cards).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(events.at(-1)).toEqual({ type: "ended" });
    expect(state.phase).toBe("ended");
  });

  it("fires the same events for one long tick as for many short ones", () => {
    const long = play({ type: "start" }, { type: "tick", dtMs: TOTAL_MS });
    const short = play({ type: "start" }, ...frames(TOTAL_MS, 7));

    expect(long.events).toEqual(short.events);
  });

  it("types a caption out and holds it before moving on", () => {
    const card1 = INTRO_CARDS[1]!;
    const typing = msToType(card1, captionText(card1).length);
    const onCard1 = play({ type: "start" }, { type: "tick", dtMs: cardDurationMs(0) });

    const halfway = stepIntro(onCard1.state, { type: "tick", dtMs: typing / 2 }).state;
    const typed = stepIntro(onCard1.state, { type: "tick", dtMs: typing + HOLD_MS - 1 }).state;

    expect(visibleChars(halfway)).toBeGreaterThan(0);
    expect(visibleChars(halfway)).toBeLessThan(captionText(card1).length);
    expect(typed.card).toBe(1);
    expect(visibleChars(typed)).toBe(captionText(card1).length);
  });

  it("waits out a pause inside a caption", () => {
    const card8 = INTRO_CARDS[8]!;
    const first = card8.caption[0]!;
    const endOfFirst = first.text.length * MS_PER_CHAR;

    expect(typedCharsAt(card8, endOfFirst)).toBe(first.text.length);
    expect(typedCharsAt(card8, endOfFirst + first.pauseAfterMs! - 1)).toBe(first.text.length);
    expect(typedCharsAt(card8, endOfFirst + first.pauseAfterMs! + MS_PER_CHAR)).toBe(first.text.length + 1);
  });
});

describe("the Ganymede glitch", () => {
  it("fires once, on card 6, and the music is back before card 7", () => {
    const { events } = play({ type: "start" }, ...frames(TOTAL_MS + 1000));
    const at = (wanted: IntroEvent) => events.findIndex((event) => JSON.stringify(event) === JSON.stringify(wanted));

    expect(events.filter((event) => event.type === "glitch")).toHaveLength(1);
    expect(events.filter((event) => event.type === "glitch-end")).toHaveLength(1);
    expect(at({ type: "card", index: 6 })).toBeLessThan(at({ type: "glitch" }));
    expect(at({ type: "glitch" })).toBeLessThan(at({ type: "glitch-end" }));
    expect(at({ type: "glitch-end" })).toBeLessThan(at({ type: "card", index: 7 }));
  });

  it("lands on the full Ganymede line", () => {
    const card6 = INTRO_CARDS[6]!;
    const glitchMs = msToType(card6, card6.glitchAtChar!);

    expect(captionText(card6).slice(0, card6.glitchAtChar)).toMatch(/Ganymede was found unsuitable\.$/);
    expect(glitchMs + GLITCH_SILENCE_MS).toBeLessThanOrEqual(cardDurationMs(6));
  });
});

describe("skip", () => {
  it.each([0, 3, 9])("jumps from card %i straight to the end", (card) => {
    let state = play({ type: "start" }).state;
    while (state.card < card) state = stepIntro(state, { type: "tick", dtMs: 16 }).state;

    const step = stepIntro(state, { type: "skip" });

    expect(step.state.phase).toBe("ended");
    expect(step.state.card).toBe(END_CARD);
    expect(step.events).toEqual([{ type: "skipped" }, { type: "ended" }]);
  });

  it("does nothing once the video has ended", () => {
    const ended = play({ type: "start" }, { type: "skip" }).state;

    expect(stepIntro(ended, { type: "skip" })).toEqual({ state: ended, events: [] });
  });
});

describe("the end", () => {
  it("holds on the countdown's '4…' indefinitely", () => {
    const { state } = play({ type: "start" }, { type: "tick", dtMs: TOTAL_MS });
    const later = stepIntro(state, { type: "tick", dtMs: 600_000 });

    expect(captionText(INTRO_CARDS[END_CARD]!).slice(0, visibleChars(state))).toMatch(/5… 4…$/);
    expect(later).toEqual({ state, events: [] });
  });
});
