import { cardDurationMs } from "../intro-timeline";
import { END_CARD, IDENT_CARD, INTRO_CARDS } from "../script";
import { FRAME_HEIGHT, FRAME_WIDTH } from "./grid";
import { artFor } from "./index";
import { isPaletteChar } from "./palette";
import { renderFrame } from "./render";

/**
 * Every card of the script has its picture. A card's pixel data is parsed when its module loads,
 * so importing them all here is already the check that every grid parses; rendering each card at
 * its start, middle and end checks the painted scenery as well.
 */
const CARDS = INTRO_CARDS.map((_card, index) => index);

describe("the intro's art", () => {
  it.each(CARDS)("card %i has art, which renders whole frames of palette colours from start to end", (card) => {
    const art = artFor(card);
    expect(art).toBeDefined();

    const duration = Math.max(cardDurationMs(card), 1);
    for (const timeMs of [0, duration / 2, duration - 1]) {
      for (const still of [false, true]) {
        const frame = renderFrame(art!, timeMs, { still });
        expect(frame).toHaveLength(FRAME_WIDTH * FRAME_HEIGHT);
        expect(frame.every(isPaletteChar)).toBe(true);
      }
    }
  });

  it("closes on the next module's ident, the same picture as the first", () => {
    expect(artFor(END_CARD)).toBe(artFor(IDENT_CARD));
  });
});
