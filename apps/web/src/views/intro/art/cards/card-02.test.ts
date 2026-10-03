import { cardDurationMs, typedCharsAt } from "../../intro-timeline";
import { INTRO_CARDS, captionText } from "../../script";
import { FRAME_WIDTH } from "../grid";
import { FRAME_MS, renderFrame } from "../render";
import { CARD_02_ART, CLASH_MS, CUT_MS, FLASH_MS, MASS_MS, WIDE_CITY, type Building } from "./card-02";

/** The middle of the frame, where the two sides meet. */
const CLASH_X = 192;

const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];
const END_MS = cardDurationMs(2) - 1;

/** The fade in is over: six steps, 100 ms apart, from 0. */
const CLEAR_MS = 600;

/** Below this row, in the wide shot, the crowds stand in front of the city. */
const CROWD_TOP = 106;

/** The pixels of a rectangle, row by row. */
function region(frame: readonly string[], left: number, top: number, right: number, bottom: number): string[] {
  const pixels: string[] = [];
  for (let y = top; y < bottom; y += 1) for (let x = Math.max(0, left); x < Math.min(FRAME_WIDTH, right); x += 1) pixels.push(at(frame, x, y)!);
  return pixels;
}

/**
 * A building's front, below anything its jagged top could leave open: what shows there is the
 * building, or the fire in its windows.
 */
const front = (frame: readonly string[], building: Building) =>
  region(frame, building.left, building.top + 12, building.left + building.width, CROWD_TOP);

/**
 * Whether a building is burning: fire colours in its front. Only orange and yellow count, since
 * a red flag may fly across it; at every step of the flicker, some of the fire shows one of them.
 */
const burning = (frame: readonly string[], building: Building) => front(frame, building).some((pixel) => pixel === "o" || pixel === "Y");

const fire = (pixel: string) => pixel === "r" || pixel === "o" || pixel === "Y";

/** Black in the close shot's middle, where the fighters meet: the buildings there are violet. */
const blackInTheMiddle = (frame: readonly string[]) => region(frame, 180, 110, 204, 160).filter((pixel) => pixel === ".").length;

/** Black high in the close shot, above every head and the grey crowd's poles: the fight's flagpoles. */
const polesUpHigh = (frame: readonly string[]) => region(frame, 0, 0, FRAME_WIDTH, 60).filter((pixel) => pixel === ".").length;

const wideTimes = () => {
  const times: number[] = [];
  for (let time = CLEAR_MS; time < FLASH_MS; time += FRAME_MS) times.push(time);
  return times;
};

describe("card 2: the wars", () => {
  it("opens on the white card 1 handed over", () => {
    expect(new Set(renderFrame(CARD_02_ART, 0))).toEqual(new Set(["w"]));
  });

  it("comes up out of the white, under a sky that stays white", () => {
    const frame = renderFrame(CARD_02_ART, CLEAR_MS);
    const sky = region(frame, 0, 0, FRAME_WIDTH, 10);

    expect(frame).toContain(".");
    expect(sky.filter((pixel) => pixel === "w").length).toBeGreaterThan(sky.length / 2);
  });

  it("is a dense city: no sky shows between the buildings, only more buildings", () => {
    const frame = renderFrame(CARD_02_ART, CLEAR_MS);

    expect(region(frame, 0, 100, FRAME_WIDTH, 101)).not.toContain("w");
  });

  it("is dark but for the fire in its windows", () => {
    const frame = renderFrame(CARD_02_ART, FLASH_MS - 1);
    const fronts = WIDE_CITY.buildings.flatMap((building) => front(frame, building));

    // Most of what is not black is the flags flying across the fronts.
    expect(fronts.filter((pixel) => pixel === ".").length).toBeGreaterThan(fronts.length * 0.7);
    expect(fronts.filter(fire).length).toBeLessThan(fronts.length * 0.15);
  });

  it("has big flames rising behind the skyline, and the last blaze catches on its cue", () => {
    const above = (time: number, left: number, right: number) => region(renderFrame(CARD_02_ART, time), left, 0, right, 52).filter(fire).length;
    const last = WIDE_CITY.blazes.at(-1)!;

    expect(above(CLEAR_MS, 0, FRAME_WIDTH)).toBeGreaterThan(300);
    expect(above(last.burnsFromMs - FRAME_MS, last.centre - 10, last.centre + 10)).toBe(0);
    expect(above(last.burnsFromMs + 700, last.centre - 10, last.centre + 10)).toBeGreaterThan(0);
  });

  it("raises its smoke from amid the buildings, not out of the empty sky", () => {
    // Grey this low, over the buildings behind and below every flag, is only ever smoke.
    const amid = region(renderFrame(CARD_02_ART, CLEAR_MS), 0, 40, FRAME_WIDTH, 66).filter((pixel) => pixel === "g").length;

    expect(amid).toBeGreaterThan(100);
  });

  it("only ever spreads the fire: a building catches on its cue, nobody puts it out, and some never catch", () => {
    for (const time of wideTimes()) {
      const frame = renderFrame(CARD_02_ART, time);

      for (const building of WIDE_CITY.buildings) {
        if (time < building.burnsFromMs) expect(burning(frame, building)).toBe(false);
        else if (time >= building.burnsFromMs + 300) expect(burning(frame, building)).toBe(true);
      }
    }
    expect(WIDE_CITY.buildings.some((building) => building.burnsFromMs === Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("flashes white, cuts under the white, and comes down on the close shot", () => {
    expect(new Set(renderFrame(CARD_02_ART, CUT_MS - 1))).toEqual(new Set(["w"]));
    expect(new Set(renderFrame(CARD_02_ART, CUT_MS))).toEqual(new Set(["w"]));
    expect(renderFrame(CARD_02_ART, CUT_MS + 240)).toContain(".");
  });

  it("charges the crowds in from the edges, to meet in the middle as the caption types \"itself\"", () => {
    const card = INTRO_CARDS[2]!;
    const typed = captionText(card).slice(0, typedCharsAt(card, CLASH_MS));

    expect(blackInTheMiddle(renderFrame(CARD_02_ART, CUT_MS + 300))).toBe(0);
    expect(blackInTheMiddle(renderFrame(CARD_02_ART, CLASH_MS))).toBeGreaterThan(200);
    expect(typed).toMatch(/and i?t?s?e?l?f?$/);
  });

  it("keeps everyone running into the middle, until the fight is one mass", () => {
    const mass = (time: number) => region(renderFrame(CARD_02_ART, time), 120, 110, 264, 160).filter((pixel) => pixel === ".").length;
    const atClash = mass(CLASH_MS);

    expect(mass(CLASH_MS + 1000)).toBeGreaterThan(atClash);
    expect(mass(END_MS)).toBeGreaterThan(region(renderFrame(CARD_02_ART, END_MS), 120, 110, 264, 160).length * 0.85);
  });

  it("shoves the first two fighters into each other just after they meet, leaving no daylight between them", () => {
    // The most of any column, across the middle of the fight, that is not black.
    const daylight = (time: number) => {
      const frame = renderFrame(CARD_02_ART, time);
      let most = 0;
      for (let x = CLASH_X - 8; x < CLASH_X + 12; x += 1) most = Math.max(most, region(frame, x, 110, x + 1, 166).filter((pixel) => pixel !== ".").length);
      return most;
    };

    expect(daylight(CLASH_MS)).toBeGreaterThan(40);
    for (let time = CLASH_MS + 450; time < END_MS; time += FRAME_MS) expect(daylight(time)).toBeLessThan(28);
  });

  it("grows the fight by accumulation: newcomers stick to its edge, which keeps moving out", () => {
    // How far the fight reaches out from the middle, leftwards: as far as 8-pixel strips stay
    // solid black from the heads down. The stream running in has gaps between its bodies; the fight,
    // where they are glued together, has none.
    const reach = (time: number) => {
      const frame = renderFrame(CARD_02_ART, time);
      const solid = (x: number) => region(frame, x, 110, x + 8, 160).filter((pixel) => pixel === ".").length >= 0.95 * 8 * 50;
      let x = CLASH_X - 24;
      while (x >= 8 && solid(x - 8)) x -= 8;
      return CLASH_X - x;
    };
    const reaches = [CLASH_MS + 400, CLASH_MS + 1000, CLASH_MS + 1600, END_MS].map(reach);

    reaches.forEach((value, index) => {
      if (index > 0) expect(value).toBeGreaterThan(reaches[index - 1]!);
    });
    expect(reaches.at(-1)).toBeGreaterThan(120);
  });

  it("is still streaming people in from both edges as the card ends", () => {
    const frame = renderFrame(CARD_02_ART, END_MS);

    expect(region(frame, 0, 110, 40, 160)).toContain(".");
    expect(region(frame, FRAME_WIDTH - 40, 110, FRAME_WIDTH, 160)).toContain(".");
  });

  it("mixes the flags over the fight: red over the right side, steel blue over the left", () => {
    const frame = renderFrame(CARD_02_ART, END_MS);

    // Dark red is only ever a red flag's shade, and steel blue only ever a flag of the other side.
    expect(region(frame, CLASH_X, 0, FRAME_WIDTH, 110)).toContain("m");
    expect(region(frame, 0, 0, CLASH_X, 110)).toContain("s");
    expect(polesUpHigh(frame)).toBeGreaterThan(polesUpHigh(renderFrame(CARD_02_ART, CLASH_MS)));
  });

  it("moves: the flags ripple, the fire flickers, the fighters swing", () => {
    expect(renderFrame(CARD_02_ART, 1000)).not.toEqual(renderFrame(CARD_02_ART, 1000 + FRAME_MS));
    expect(renderFrame(CARD_02_ART, 5000)).not.toEqual(renderFrame(CARD_02_ART, 5000 + FRAME_MS));
  });

  it("under reduced motion, still fades and flashes, then holds the clash and the mass, never an empty street", () => {
    const still = { still: true };

    expect(new Set(renderFrame(CARD_02_ART, 0, still))).toEqual(new Set(["w"]));
    expect(renderFrame(CARD_02_ART, 2000, still)).toEqual(renderFrame(CARD_02_ART, CLEAR_MS, still));
    expect(new Set(renderFrame(CARD_02_ART, CUT_MS, still))).toEqual(new Set(["w"]));
    expect(blackInTheMiddle(renderFrame(CARD_02_ART, CLASH_MS + 500, still))).toBeGreaterThan(200);

    const mass = renderFrame(CARD_02_ART, MASS_MS, still);
    expect(blackInTheMiddle(mass)).toBeGreaterThan(blackInTheMiddle(renderFrame(CARD_02_ART, CLASH_MS, still)));
    expect(renderFrame(CARD_02_ART, END_MS, still)).toEqual(mass);
  });
});
