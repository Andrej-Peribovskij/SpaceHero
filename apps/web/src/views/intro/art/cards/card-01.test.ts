import { cardDurationMs } from "../../intro-timeline";
import { FRAME_WIDTH } from "../grid";
import { FRAME_MS, renderFrame } from "../render";
import { CARD_01_ART } from "./card-01";

const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];
const count = (frame: readonly string[], colour: string) => frame.filter((pixel) => pixel === colour).length;

/** Pixels of the Sun and its glow: anything but the night sky's colours. */
const sunlit = (frame: readonly string[]) => frame.filter((pixel) => !["n", "k", "m", "b", "s"].includes(pixel)).length;

/** A pixel in the middle of the child's chest, well away from any edge the light can eat. */
const CHEST = { x: 115, y: 104 };

describe("card 1: the Brightening", () => {
  it("opens on night and a Sun too big for the frame", () => {
    const frame = renderFrame(CARD_01_ART, 0);

    expect(at(frame, 214, 92)).toBe("w");
    expect(at(frame, 5, 5)).toBe("n");
  });

  it("swells the Sun", () => {
    expect(sunlit(renderFrame(CARD_01_ART, 2900))).toBeGreaterThan(sunlit(renderFrame(CARD_01_ART, 0)));
  });

  it("bleeds every colour to white, and holds the white", () => {
    expect(new Set(renderFrame(CARD_01_ART, 3600))).toEqual(new Set(["w"]));
    expect(new Set(renderFrame(CARD_01_ART, 3990))).toEqual(new Set(["w"]));
  });

  it("cuts hard to the child, at the scene's dimmest: no fade back out of the white", () => {
    const frame = renderFrame(CARD_01_ART, 4000);

    expect(at(frame, CHEST.x, CHEST.y)).toBe(".");
    expect(["d", "m"]).toContain(at(frame, 300, 160));
    expect(count(frame, "Y")).toBeGreaterThan(0);
  });

  it("only ever lets the light rise after the cut", () => {
    const whites: number[] = [];
    for (let time = 4000; time < 6400; time += FRAME_MS) whites.push(count(renderFrame(CARD_01_ART, time), "w"));

    whites.forEach((white, index) => {
      if (index > 0) expect(white).toBeGreaterThanOrEqual(whites[index - 1]!);
    });
    expect(whites.at(-1)).toBeGreaterThan(whites[0]!);
  });

  it("keeps the child dark while the light eats only its edge", () => {
    expect(at(renderFrame(CARD_01_ART, 6300), CHEST.x, CHEST.y)).toBe(".");
  });

  it("hands over to card 2 on white, before the card ends", () => {
    expect(new Set(renderFrame(CARD_01_ART, cardDurationMs(1) - 1))).toEqual(new Set(["w"]));
  });

  it("under reduced motion, stops the swell but still tells the story", () => {
    const still = { still: true };

    expect(sunlit(renderFrame(CARD_01_ART, 2900, still))).toBe(sunlit(renderFrame(CARD_01_ART, 0)));
    expect(new Set(renderFrame(CARD_01_ART, 3600, still))).toEqual(new Set(["w"]));
    expect(at(renderFrame(CARD_01_ART, 4100, still), CHEST.x, CHEST.y)).toBe(".");
  });
});
