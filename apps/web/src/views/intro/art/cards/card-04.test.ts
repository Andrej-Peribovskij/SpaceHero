import { cardDurationMs, typedCharsAt } from "../../intro-timeline";
import { INTRO_CARDS, captionText } from "../../script";
import { FRAME_WIDTH } from "../grid";
import { FRAME_MS, renderFrame } from "../render";
import {
  CARD_04_ART,
  KINDLE_MS,
  LIGHT_X,
  LIGHT_Y,
  LIT_MS,
  ORBITS,
  PLANNED_MS,
  PLAN_MS,
  STATIONED_MS,
  STATIONS,
  STATIONS_MS,
  VISIBLE,
  WIRED_MS,
} from "./card-04";

const CARD = INTRO_CARDS[4]!;
const END_MS = cardDurationMs(4) - 1;
const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];
const count = (pixels: readonly string[], ...colours: string[]) => pixels.filter((pixel) => colours.includes(pixel)).length;
const visible = (frame: readonly string[]) => frame.slice(0, VISIBLE * FRAME_WIDTH);
const lit = (frame: readonly string[]) => visible(frame).filter((pixel) => pixel !== "." && pixel !== "n").length;
const upcoming = (time: number) => captionText(CARD).slice(typedCharsAt(CARD, time));

/** The station pixels: white 2×2 dots on the line, and nothing else in the hall is white there. */
const stationsOut = (frame: readonly string[]) =>
  STATIONS.filter(([x, y]) => at(frame, Math.round(x), Math.round(y)) === "w").length;

/** The status lights' teal, which only they and the pulses use. */
const teal = (frame: readonly string[]) => count(visible(frame), "t");

/** The dashes of an orbit: steel blue on the ring's own path. */
function onOrbit(frame: readonly string[], index: number): number {
  const { rx, ry } = ORBITS[index]!;
  let dashes = 0;
  for (let step = 0; step < 360; step += 1) {
    const angle = (step / 360) * 2 * Math.PI;
    if (at(frame, Math.floor(LIGHT_X + rx * Math.cos(angle)), Math.floor(LIGHT_Y + ry * Math.sin(angle))) === "s") dashes += 1;
  }
  return dashes;
}

describe("card 4: Helios", () => {
  it("opens on the black card 3 closed to", () => {
    expect(new Set(renderFrame(CARD_04_ART, 0))).toEqual(new Set(["."]));
  });

  it("kindles the light on \"Helios\", in the middle of the dark", () => {
    expect(upcoming(KINDLE_MS)).toMatch(/^Helios/);
    expect(lit(renderFrame(CARD_04_ART, KINDLE_MS - 1))).toBe(0);
    expect(at(renderFrame(CARD_04_ART, KINDLE_MS), LIGHT_X, LIGHT_Y)).toBe("w");
  });

  it("spreads the light from the inside out, until the hall is lit", () => {
    const counts = [KINDLE_MS, KINDLE_MS + 300, KINDLE_MS + 700, LIT_MS].map((time) => lit(renderFrame(CARD_04_ART, time)));

    expect(counts.every((now, index) => index === 0 || now > counts[index - 1]!)).toBe(true);
    expect(at(renderFrame(CARD_04_ART, KINDLE_MS + 200), LIGHT_X + 40, LIGHT_Y)).toBe(".");
    expect(counts.at(-1)).toBeGreaterThan(10_000);
  });

  it("keeps the hall dark: the light does not reach the edges of the frame", () => {
    const frame = renderFrame(CARD_04_ART, LIT_MS);
    const edges = visible(frame).filter((_pixel, index) => {
      const x = index % FRAME_WIDTH;
      const y = Math.floor(index / FRAME_WIDTH);
      return x < 24 || x >= FRAME_WIDTH - 24 || y < 12;
    });

    expect(count(edges, ".", "n") / edges.length).toBeGreaterThan(0.9);
  });

  it("lights the racks in every company's colour on \"every corporation\"", () => {
    expect(upcoming(WIRED_MS)).toMatch(/^every corporation/);
    expect(teal(renderFrame(CARD_04_ART, WIRED_MS - 1))).toBe(0);
    expect(teal(renderFrame(CARD_04_ART, LIT_MS))).toBeGreaterThan(0);
  });

  it("keeps the hall alive: the lights blink and the pulses run", () => {
    expect(renderFrame(CARD_04_ART, LIT_MS)).not.toEqual(renderFrame(CARD_04_ART, LIT_MS + 4 * FRAME_MS));
  });

  it("draws the Plan's orbits out of the light on \"the Plan\", one after another", () => {
    expect(upcoming(PLAN_MS)).toMatch(/^the Plan/);
    // A few of the status lights are steel blue too; an orbit puts dozens of dashes on its path.
    for (const index of ORBITS.keys()) expect(onOrbit(renderFrame(CARD_04_ART, PLAN_MS - 1), index)).toBeLessThan(5);

    const planned = renderFrame(CARD_04_ART, PLANNED_MS);
    for (const index of ORBITS.keys()) expect(onOrbit(planned, index)).toBeGreaterThan(30);
  });

  it("puts out the stations one by one on \"Station by station\", into the dark, before the card ends", () => {
    expect(upcoming(STATIONS_MS)).toBe("Station by station.");
    expect(stationsOut(renderFrame(CARD_04_ART, STATIONS_MS - 1))).toBe(0);
    expect(stationsOut(renderFrame(CARD_04_ART, STATIONS_MS))).toBe(1);

    const counts = Array.from({ length: 8 }, (_, step) => stationsOut(renderFrame(CARD_04_ART, STATIONS_MS + step * 300)));
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
    expect(stationsOut(renderFrame(CARD_04_ART, STATIONED_MS))).toBe(STATIONS.length);
    expect(STATIONED_MS).toBeLessThan(END_MS - 500);
    expect(Math.max(...STATIONS.map(([x]) => x))).toBeGreaterThan(FRAME_WIDTH - 10);
  });

  it("under reduced motion, holds a still for each beat: black, the hall lit, the Plan, every station", () => {
    const still = { still: true };

    expect(new Set(renderFrame(CARD_04_ART, LIT_MS - 1, still))).toEqual(new Set(["."]));
    expect(lit(renderFrame(CARD_04_ART, LIT_MS, still))).toBeGreaterThan(10_000);
    expect(onOrbit(renderFrame(CARD_04_ART, PLANNED_MS - 1, still), 2)).toBeLessThan(5);
    expect(onOrbit(renderFrame(CARD_04_ART, PLANNED_MS, still), 2)).toBeGreaterThan(30);
    expect(stationsOut(renderFrame(CARD_04_ART, STATIONED_MS - 1, still))).toBe(0);
    expect(stationsOut(renderFrame(CARD_04_ART, END_MS, still))).toBe(STATIONS.length);
  });
});
