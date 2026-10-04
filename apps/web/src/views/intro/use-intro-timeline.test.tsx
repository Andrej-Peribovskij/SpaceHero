import { act, renderHook } from "@testing-library/react";

import { HOLD_MS, MS_PER_CHAR, cardDurationMs, typedCharsAt } from "./intro-timeline";
import { END_CARD, INTRO_CARDS, captionText } from "./script";
import { useIntroTimeline } from "./use-intro-timeline";

beforeEach(() => {
  // The frame clock is faked along with the timers: the video runs on requestAnimationFrame.
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

/** The hook, with a count of how often it made its caller render. */
function counted() {
  let renders = 0;
  const hook = renderHook(() => {
    renders += 1;
    return useIntroTimeline();
  });
  return { hook, renders: () => renders };
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("the screen's clock", () => {
  it("runs for the ident at the gate, where the timeline has not started", () => {
    const { hook } = counted();
    advance(1000);

    expect(hook.result.current.phase).toBe("gate");
    expect(hook.result.current.clock.current.card).toBe(0);
    expect(hook.result.current.clock.current.ms).toBeGreaterThan(900);
  });

  it("is the card's own time on the timeline while it plays, so the picture keeps the caption's pace", () => {
    const { hook } = counted();
    act(() => hook.result.current.start());
    advance(cardDurationMs(0) + 25 * MS_PER_CHAR);

    const { card, ms } = hook.result.current.clock.current;
    expect(card).toBe(1);
    expect(hook.result.current.card).toBe(1);
    expect(typedCharsAt(INTRO_CARDS[1]!, ms)).toBe(hook.result.current.shownChars);
  });

  it("starts the next module's ident from 0 when the player skips", () => {
    const { hook } = counted();
    act(() => hook.result.current.start());
    advance(cardDurationMs(0) + 2000);

    act(() => hook.result.current.skip());

    expect(hook.result.current.clock.current).toEqual({ card: END_CARD, ms: 0 });
  });

  it("holds where the video stopped once it has ended, so the punched screen stays black", () => {
    const { hook } = counted();
    act(() => hook.result.current.start());
    act(() => hook.result.current.skip());
    advance(cardDurationMs(END_CARD) + 500);

    expect(hook.result.current.phase).toBe("ended");
    expect(hook.result.current.clock.current).toEqual({ card: END_CARD, ms: cardDurationMs(END_CARD) });

    advance(60_000);
    expect(hook.result.current.clock.current).toEqual({ card: END_CARD, ms: cardDurationMs(END_CARD) });
  });
});

describe("useIntroTimeline", () => {
  it("re-renders when what is shown changes, not on every frame", () => {
    const { hook, renders } = counted();
    act(() => hook.result.current.start());

    // The ident's hold: about 150 frames go by, and nothing on screen changes until card 1.
    const before = renders();
    advance(cardDurationMs(0) - 50);
    expect(hook.result.current.card).toBe(0);
    expect(renders() - before).toBe(0);

    // Typing: one render per character, give or take a frame, not one per frame.
    advance(50 + 10 * MS_PER_CHAR);
    expect(hook.result.current.card).toBe(1);
    expect(renders() - before).toBeLessThanOrEqual(12);

    // The hold after the caption is typed: still for three seconds.
    const typed = captionText(INTRO_CARDS[1]!).length;
    advance((typed - 10) * MS_PER_CHAR + 100);
    expect(hook.result.current.shownChars).toBe(typed);
    const holding = renders();
    advance(HOLD_MS - 300);
    expect(renders()).toBe(holding);
  });
});
