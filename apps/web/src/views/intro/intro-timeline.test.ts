import {
  GLITCH_SILENCE_MS,
  HOLD_MS,
  MS_PER_CHAR,
  POWER_OFF_MS,
  cardDurationMs,
  initialIntroState,
  msToType,
  stepIntro,
  typedCharsAt,
  visibleChars,
  type IntroEvent,
  type IntroState,
} from "./intro-timeline";
import { ORIENTATION_TUNE } from "./music/tune";
import { END_CARD, INTRO_CARDS, SNORE_CARD, captionText } from "./script";

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
  it("shows cards 1 to 11 once each, in order, then ends", () => {
    const { state, events } = play({ type: "start" }, ...frames(TOTAL_MS + 1000));

    const cards = events.flatMap((event) => (event.type === "card" ? [event.index] : []));

    expect(cards).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
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

  it("shows a caption whole, never typed, when asked to: for reduced motion", () => {
    const card1 = INTRO_CARDS[1]!;
    const onCard1 = play({ type: "start" }, { type: "tick", dtMs: cardDurationMs(0) });
    const justStarted = stepIntro(onCard1.state, { type: "tick", dtMs: MS_PER_CHAR }).state;

    expect(visibleChars(justStarted)).toBe(1);
    expect(visibleChars(justStarted, { whole: true })).toBe(captionText(card1).length);
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
  it.each([0, 3, 9, SNORE_CARD])("jumps from card %i to the start of Module 2's ident, which then plays out", (card) => {
    let state = play({ type: "start" }).state;
    while (state.card < card) state = stepIntro(state, { type: "tick", dtMs: 16 }).state;

    const step = stepIntro(state, { type: "skip" });

    expect(step.state).toEqual({ phase: "playing", card: END_CARD, elapsedMs: 0 });
    expect(step.events).toEqual([{ type: "skipped" }, { type: "card", index: END_CARD }]);

    const rest = stepIntro(step.state, { type: "tick", dtMs: cardDurationMs(END_CARD) });
    expect(rest.events).toEqual([{ type: "wake" }, { type: "punch" }, { type: "ended" }]);
  });

  it("does nothing on Module 2's ident, the ending, nor once the video has ended", () => {
    const ending = play({ type: "start" }, { type: "skip" }, { type: "tick", dtMs: 1000 }).state;
    const ended = stepIntro(ending, { type: "tick", dtMs: cardDurationMs(END_CARD) }).state;

    expect(stepIntro(ending, { type: "skip" })).toEqual({ state: ending, events: [] });
    expect(ended.phase).toBe("ended");
    expect(stepIntro(ended, { type: "skip" })).toEqual({ state: ended, events: [] });
  });
});

describe("seek, the debugging jump", () => {
  it("does nothing before the player opts in", () => {
    expect(play({ type: "seek", card: 5 })).toEqual({ state: initialIntroState, events: [] });
  });

  it("goes to the start of a card, says so, and plays on from there", () => {
    const { state, events } = play({ type: "start" }, { type: "tick", dtMs: 1000 }, { type: "seek", card: 5 });

    expect(state).toEqual({ phase: "playing", card: 5, elapsedMs: 0 });
    expect(events.slice(-2)).toEqual([{ type: "seeked" }, { type: "card", index: 5 }]);

    const after = stepIntro(state, { type: "tick", dtMs: cardDurationMs(5) });
    expect(after.state).toEqual({ phase: "playing", card: 6, elapsedMs: 0 });
  });

  it("goes back as readily as forward, to the start of a card already seen", () => {
    const { state } = play({ type: "start" }, { type: "tick", dtMs: cardDurationMs(0) + 500 }, { type: "seek", card: 0 });

    expect(state).toEqual({ phase: "playing", card: 0, elapsedMs: 0 });
  });

  it("keeps to the cards there are", () => {
    expect(play({ type: "start" }, { type: "seek", card: -3 }).state.card).toBe(0);
    expect(play({ type: "start" }, { type: "seek", card: 99 }).state.card).toBe(END_CARD);
  });

  it("lands on card 6 before its glitch, which then fires on time", () => {
    const { events } = play({ type: "start" }, { type: "seek", card: 6 }, ...frames(cardDurationMs(6)));

    expect(events.filter((event) => event.type === "glitch")).toHaveLength(1);
    expect(events.filter((event) => event.type === "glitch-end")).toHaveLength(1);
  });

  it("plays again from the end, back onto the snore card", () => {
    const { state, events } = play({ type: "start" }, { type: "tick", dtMs: TOTAL_MS }, { type: "seek", card: SNORE_CARD });

    expect(state).toEqual({ phase: "playing", card: SNORE_CARD, elapsedMs: 0 });
    expect(events.slice(-2)).toEqual([{ type: "seeked" }, { type: "card", index: SNORE_CARD }]);
  });

  it("onto the last card, plays it from the top: Joe wakes and punches the screen again", () => {
    const { state, events } = play({ type: "start" }, { type: "seek", card: END_CARD }, ...frames(cardDurationMs(END_CARD)));

    expect(state.phase).toBe("ended");
    expect(events.filter((event) => event.type === "wake" || event.type === "punch")).toEqual([{ type: "wake" }, { type: "punch" }]);
  });
});

describe("the end", () => {
  it("plays Module 2's ident whole, never typed, then wakes Joe, then his punch, then ends", () => {
    const toLastCard = INTRO_CARDS.slice(0, END_CARD).reduce((sum, _card, index) => sum + cardDurationMs(index), 0);
    const { state } = play({ type: "start" }, { type: "tick", dtMs: toLastCard + 10 });
    const { wakeAtMs, punchAtMs } = INTRO_CARDS[END_CARD]!;

    expect(state).toEqual({ phase: "playing", card: END_CARD, elapsedMs: 10 });
    expect(visibleChars(state)).toBe(captionText(INTRO_CARDS[END_CARD]!).length);

    const atMs = (event: IntroEvent["type"]) => {
      let clock = state;
      for (let ms = 10; ms <= cardDurationMs(END_CARD) + 16; ms += 16) {
        const step = stepIntro(clock, { type: "tick", dtMs: 16 });
        if (step.events.some((fired) => fired.type === event)) return ms + 16;
        clock = step.state;
      }
      return undefined;
    };
    expect(atMs("wake")).toBeGreaterThan(wakeAtMs!);
    expect(atMs("wake")).toBeLessThanOrEqual(wakeAtMs! + 16);
    expect(atMs("punch")).toBeGreaterThan(punchAtMs!);
    expect(atMs("punch")).toBeLessThanOrEqual(punchAtMs! + 16);
    expect(atMs("ended")).toBeGreaterThan(punchAtMs! + POWER_OFF_MS);
  });

  it("wakes Joe a second before the tune's first phrase ends, two bars in, and punches a few seconds later", () => {
    const { wakeAtMs, punchAtMs } = INTRO_CARDS[END_CARD]!;
    const barMs = (4 * 60_000) / ORIENTATION_TUNE.bpm;

    expect(wakeAtMs).toBeCloseTo(2 * barMs - 1000, -1);
    expect(punchAtMs! - wakeAtMs!).toBeGreaterThanOrEqual(3000);
    expect(punchAtMs! - wakeAtMs!).toBeLessThanOrEqual(4000);
  });

  it("holds on black once ended, indefinitely, with nothing more to happen", () => {
    const { state } = play({ type: "start" }, { type: "tick", dtMs: TOTAL_MS });
    const later = stepIntro(state, { type: "tick", dtMs: 600_000 });

    expect(state).toEqual({ phase: "ended", card: END_CARD, elapsedMs: cardDurationMs(END_CARD) });
    expect(later).toEqual({ state, events: [] });
  });

  it("has a captionless card before the end, the snore, held for its own hold rather than a caption's", () => {
    expect(INTRO_CARDS[SNORE_CARD]!.caption).toEqual([]);
    expect(cardDurationMs(SNORE_CARD)).toBe(INTRO_CARDS[SNORE_CARD]!.holdMs);
    expect(cardDurationMs(SNORE_CARD)).toBeGreaterThan(HOLD_MS);
  });

  it("holds every other card for the usual hold once its caption is typed", () => {
    expect(cardDurationMs(1)).toBe(captionText(INTRO_CARDS[1]!).length * MS_PER_CHAR + HOLD_MS);
  });
});
