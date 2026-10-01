import { FRAME_HEIGHT, FRAME_WIDTH } from "../art/grid";
import { singleScene } from "../art/render";
import { INTRO_CARDS, captionText } from "../script";
import { BLINK_MS, CAPTION_COLUMNS, composeScreen, isLit, type ScreenContent } from "./compose";
import { FONT } from "./font";
import { layoutCaption } from "./layout";

const PROMPTS = ["PRESS ANY KEY TO BEGIN ORIENTATION", "PRESS ANY KEY TO CONTINUE ORIENTATION"];

function screen(overrides: Partial<ScreenContent>): string[] {
  return composeScreen({
    art: undefined,
    caption: [],
    shownChars: 0,
    prompt: undefined,
    promptLit: true,
    timeMs: 0,
    ...overrides,
  });
}

/** The colours used anywhere in the given rows of the screen. */
function coloursIn(frame: readonly string[], fromRow: number, toRow = FRAME_HEIGHT): Set<string> {
  return new Set(frame.slice(fromRow * FRAME_WIDTH, toRow * FRAME_WIDTH));
}

describe("the pixel font", () => {
  it("has a glyph for every character of every caption and prompt", () => {
    const needed = new Set([...INTRO_CARDS.map(captionText).join(""), ...PROMPTS.join("")].filter((char) => char !== "\n"));
    const missing = [...needed].filter((char) => !FONT.has(char));

    expect(missing).toEqual([]);
  });
});

describe("the caption band", () => {
  it("fits every caption in four lines at most, so card art can count on rows above 153", () => {
    // Card 4's, the longest, takes four: a 63-pixel band, leaving 153 of 216 rows for the art.
    const lineCounts = INTRO_CARDS.map((card) => layoutCaption(card.caption, CAPTION_COLUMNS).length);

    expect(Math.max(...lineCounts)).toBeLessThanOrEqual(4);
  });

  it("sets the idents' title on one line and the module on the next", () => {
    const lines = layoutCaption(INTRO_CARDS[0]!.caption, CAPTION_COLUMNS).map((line) =>
      line.map((placed) => placed.char).join(""),
    );

    expect(lines).toEqual(["ABSOLUTE CONNECTIONS · Contractor Orientation", "Module 1 of 14: Where We Come From"]);
  });

  it("draws only the characters typed so far", () => {
    const caption = [{ text: "Nations argued." }];

    const none = screen({ caption, shownChars: 0 });
    const some = screen({ caption, shownChars: 7 });
    const all = screen({ caption, shownChars: 15 });
    const ink = (frame: string[]) => frame.filter((pixel) => pixel === "p").length;

    expect(ink(none)).toBe(0);
    expect(ink(some)).toBeGreaterThan(0);
    expect(ink(all)).toBeGreaterThan(ink(some));
  });

  it("sets emphasis in yellow, since the font has no italics", () => {
    const frame = screen({ caption: [{ text: "One world. " }, { text: "Many partners.", emphasis: true }], shownChars: 99 });

    expect(frame).toContain("p");
    expect(frame).toContain("Y");
  });

  it("covers the art under the text with black, and leaves the art above it alone", () => {
    const art = singleScene({ kind: "grid", background: { pixels: new Array(FRAME_WIDTH * FRAME_HEIGHT).fill("b") } });
    const frame = screen({ art, caption: [{ text: "Year Zero." }], shownChars: 99 });

    expect(coloursIn(frame, 0, 150)).toEqual(new Set(["b"]));
    expect(coloursIn(frame, FRAME_HEIGHT - 10).has("b")).toBe(false);
  });

  it("draws no band at all for a card with no caption and no prompt", () => {
    const art = singleScene({ kind: "grid", background: { pixels: new Array(FRAME_WIDTH * FRAME_HEIGHT).fill("b") } });

    expect(new Set(screen({ art }))).toEqual(new Set(["b"]));
  });
});

describe("the prompt", () => {
  it("is drawn in grey, centred at the foot of the screen, when lit", () => {
    const frame = screen({ prompt: PROMPTS[0], promptLit: true });

    expect(coloursIn(frame, FRAME_HEIGHT - 16)).toContain("g");
  });

  it("disappears in the dark half of its blink", () => {
    expect(screen({ prompt: PROMPTS[0], promptLit: false })).not.toContain("g");
  });

  it("blinks on one period and off the next", () => {
    expect([isLit(0), isLit(BLINK_MS - 1), isLit(BLINK_MS), isLit(2 * BLINK_MS)]).toEqual([true, true, false, true]);
  });
});
