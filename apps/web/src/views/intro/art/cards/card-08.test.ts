import { cardDurationMs, typedCharsAt } from "../../intro-timeline";
import { INTRO_CARDS, captionText } from "../../script";
import { FRAME_WIDTH } from "../grid";
import { FRAME_MS, frameTime, renderFrame } from "../render";
import { VISIBLE } from "./card-05";
import { CARD_07_ART } from "./card-07";
import { CARD_08_ART, CAVES, CLEARED_MS, CLIFF_MS, COURTESY_MS, FIGURE, FIGURE_X, INSIDE_MS, STAY_MS } from "./card-08";

const CARD = INTRO_CARDS[8]!;
const END_MS = cardDurationMs(8) - 1;
const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];
const count = (pixels: readonly string[], ...colours: string[]) => pixels.filter((pixel) => colours.includes(pixel)).length;
/** What is still to type the moment a cue fires: its words, if the cue is on them. */
const upcoming = (time: number) => captionText(CARD).slice(typedCharsAt(CARD, time - 1));
const frameAt = (time: number, still = false) => renderFrame(CARD_08_ART, time, { still });
const visible = (frame: readonly string[]) => frame.slice(0, VISIBLE * FRAME_WIDTH);
const card7End = () => visible(renderFrame(CARD_07_ART, frameTime(cardDurationMs(7) - 1)));

function region(frame: readonly string[], left: number, top: number, right: number, bottom: number): string[] {
  const pixels: string[] = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) pixels.push(at(frame, x, y)!);
  return pixels;
}

/** Where the figure stands in the view from inside: their feet on the cave's lip. */
const figure = (frame: readonly string[]) => region(frame, FIGURE_X - 8, 152 - FIGURE.height, FIGURE_X + 8, 152);
const FLAMES = ["Y", "o", "r"];

describe("card 8: the ones who stayed", () => {
  it("opens on card 7's last frame, the Earth's ground, and falls on into the glare until all is white", () => {
    expect(visible(frameAt(0))).toEqual(card7End());
    expect(visible(frameAt(CLIFF_MS - 1)).every((pixel) => pixel === "w")).toBe(true);
  });

  it("comes out of the white on a towering cliff with a few caves, before the caption starts", () => {
    const cliff = frameAt(CLEARED_MS);

    for (const cave of CAVES) expect(at(cliff, cave.x, cave.floor - 3)).toMatch(/^[.n]$|^[mYor]$/);
    // A few caves in a cliff that towers out of the frame: rock along the top edge, not sky.
    expect(CAVES.length).toBeLessThanOrEqual(3);
    expect(count(region(cliff, 0, 0, 200, 1), "d", "m", "a", "y")).toBeGreaterThan(190);
    expect(count(visible(cliff), ...FLAMES)).toBeGreaterThan(10);
    expect(typedCharsAt(CARD, CLEARED_MS)).toBe(0);
    expect(STAY_MS).toBeGreaterThan(CLEARED_MS);
  });

  it("closes in on one cave on \"Some chose to stay.\", and cuts inside it, to the one who looks up", () => {
    expect(upcoming(STAY_MS)).toMatch(/^Some chose to stay/);
    expect(INSIDE_MS).toBeLessThan(COURTESY_MS);

    const inside = visible(frameAt(INSIDE_MS));
    // Dark rock round the frame, the glare in the middle, the figure a silhouette against it.
    for (const [x, y] of [[2, 2], [FRAME_WIDTH - 3, 2], [2, VISIBLE - 3], [FRAME_WIDTH - 3, VISIBLE - 3]] as const) {
      expect([".", "n", "b"]).toContain(at(inside, x, y));
    }
    expect(at(inside, 196, 40)).toBe("w");
    const silhouette = FIGURE.pixels.filter(Boolean).length;
    expect(count(figure(inside), ".")).toBeGreaterThan(silhouette * 0.9);
  });

  it("holds on the figure to the end, the courtesy in the caption and none in the picture", () => {
    expect(upcoming(COURTESY_MS)).toMatch(/^Absolute Connections respects every choice/);
    for (const time of [COURTESY_MS, END_MS]) {
      expect(count(figure(frameAt(time)), ".")).toBeGreaterThan(FIGURE.pixels.filter(Boolean).length * 0.9);
    }
    // No Absolute Connections teal anywhere: the picture does not join in.
    for (const time of [CLEARED_MS, INSIDE_MS, COURTESY_MS, END_MS]) expect(count(visible(frameAt(time)), "t")).toBe(0);
  });

  it("keeps every shot moving", () => {
    for (const time of [CLEARED_MS + 200, INSIDE_MS + 300, END_MS - 800]) {
      expect(frameAt(time)).not.toEqual(frameAt(time + 4 * FRAME_MS));
    }
  });

  it("under reduced motion, holds a still for each beat: card 7's ground, the cliff, the one who looks up", () => {
    expect(visible(frameAt(0, true))).toEqual(card7End());
    expect(count(visible(frameAt(CLEARED_MS, true)), ...FLAMES)).toBeGreaterThan(10);
    expect(count(figure(frameAt(END_MS, true)), ".")).toBeGreaterThan(FIGURE.pixels.filter(Boolean).length * 0.9);
  });
});
