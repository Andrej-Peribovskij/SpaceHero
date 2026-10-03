import { artFor } from "../art";
import { FRAME_MS } from "../art/render";
import { cardDurationMs, glitchMs, initialIntroState, stepIntro, typedCharsAt, type IntroEvent } from "../intro-timeline";
import { INTRO_CARDS } from "../script";
import { composeScreen, isLit } from "./compose";
import { GLITCH_FRAMES, glitchFrameAt } from "./glitch";

const CARD = INTRO_CARDS[6]!;
const GLITCH_MS = glitchMs(CARD)!;

/** Card 6's screen at a moment, as the view shows it: glitching, unless told not to. */
function screen(timeMs: number, options: { still?: boolean; glitch?: boolean } = {}) {
  return composeScreen({
    art: artFor(6),
    caption: CARD.caption,
    shownChars: typedCharsAt(CARD, timeMs),
    prompt: undefined,
    promptLit: isLit(timeMs),
    timeMs,
    still: options.still ?? false,
    glitchAtMs: options.glitch === false ? undefined : GLITCH_MS,
  });
}

/** The 12-fps frame times round the glitch, a second either side. */
const AROUND = Array.from({ length: 25 }, (_, index) => (Math.ceil(GLITCH_MS / FRAME_MS) - 12 + index) * FRAME_MS);
const differing = (a: readonly string[], b: readonly string[]) => a.filter((pixel, index) => pixel !== b[index]).length;

describe("the Ganymede glitch", () => {
  it("fires on card 6 only, as \"Ganymede was found unsuitable.\" finishes typing", () => {
    expect(INTRO_CARDS.filter((card) => glitchMs(card) !== undefined)).toEqual([CARD]);
    expect(CARD.caption.map((segment) => segment.text).join("").slice(0, CARD.glitchAtChar)).toMatch(/Ganymede was found unsuitable\.$/);
  });

  it("tears exactly two frames, then the screen is as it was", () => {
    const torn = AROUND.filter((time) => differing(screen(time), screen(time, { glitch: false })) > 0);

    expect(torn).toHaveLength(GLITCH_FRAMES);
    expect(torn[1]! - torn[0]!).toBeCloseTo(FRAME_MS);
    expect(torn[0]).toBeGreaterThanOrEqual(GLITCH_MS);
    expect(torn[0]! - GLITCH_MS).toBeLessThan(FRAME_MS);
  });

  it("tears the screen hard, differently in each frame, and the same every time", () => {
    const [first, second] = AROUND.filter((time) => glitchFrameAt(GLITCH_MS, time) !== undefined).map((time) => screen(time));
    const whole = first!.length;

    expect(differing(first!, screen(GLITCH_MS + 0.5 * FRAME_MS, { glitch: false }))).toBeGreaterThan(whole / 5);
    expect(differing(first!, second!)).toBeGreaterThan(whole / 5);
    expect(screen(AROUND.find((time) => glitchFrameAt(GLITCH_MS, time) === 0)!)).toEqual(first);
  });

  it("never tears under reduced motion", () => {
    for (const time of AROUND) expect(screen(time, { still: true })).toEqual(screen(time, { still: true, glitch: false }));
  });

  it("takes no time: card 7 starts when card 6's time is up, as it would without it", () => {
    let state = stepIntro(initialIntroState, { type: "start" }).state;
    let elapsed = 0;
    let card7At: number | undefined;
    while (card7At === undefined) {
      const step = stepIntro(state, { type: "tick", dtMs: FRAME_MS });
      elapsed += FRAME_MS;
      state = step.state;
      if (step.events.some((event: IntroEvent) => event.type === "card" && event.index === 7)) card7At = elapsed;
    }
    const expected = [0, 1, 2, 3, 4, 5, 6].reduce((sum, card) => sum + cardDurationMs(card), 0);

    expect(card7At - expected).toBeGreaterThanOrEqual(0);
    expect(card7At - expected).toBeLessThan(FRAME_MS);
  });
});
