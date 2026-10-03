import { cardDurationMs, msToType, typedCharsAt } from "../../intro-timeline";
import { INTRO_CARDS, captionText } from "../../script";
import { FRAME_WIDTH } from "../grid";
import { VISIBLE } from "../paint";
import { FRAME_MS, frameTime, renderFrame } from "../render";
import { CARD_05_ART } from "./card-05";
import {
  CALLISTO,
  CALLISTO_LIT_MS,
  CALLISTO_MS,
  CARD_06_ART,
  DIVE_MS,
  EUROPA,
  EUROPA_LIT_MS,
  EUROPA_MS,
  GANYMEDE,
  GANYMEDE_MS,
  IO,
  IO_LIT_MS,
  IO_MS,
  JUPITER_RADIUS,
  JUPITER_X,
  JUPITER_Y,
  LEGS,
  PULL_FROM_MS,
  REVEALED_MS,
} from "./card-06";

const CARD = INTRO_CARDS[6]!;
const END_MS = cardDurationMs(6) - 1;
const GLITCH_MS = msToType(CARD, CARD.glitchAtChar!);
const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];
const count = (pixels: readonly string[], ...colours: string[]) => pixels.filter((pixel) => colours.includes(pixel)).length;
/** What is still to type the moment a cue fires: its words, if the cue is on them. */
const upcoming = (time: number) => captionText(CARD).slice(typedCharsAt(CARD, time - 1));
const frameAt = (time: number, still = false) => renderFrame(CARD_06_ART, time, { still });
const visible = (frame: readonly string[]) => frame.slice(0, VISIBLE * FRAME_WIDTH);
const card5End = () => visible(renderFrame(CARD_05_ART, frameTime(cardDurationMs(5) - 1)));

/** The pixels inside a circle of the final shot, right of `fromX` if given. */
function disc(frame: readonly string[], cx: number, cy: number, radius: number, fromX = -Infinity): string[] {
  const pixels: string[] = [];
  for (let y = Math.max(0, cy - radius); y <= Math.min(VISIBLE - 1, cy + radius); y += 1) {
    for (let x = Math.max(cx - radius, Math.ceil(fromX)); x <= cx + radius; x += 1) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < radius) pixels.push(at(frame, x, y)!);
    }
  }
  return pixels;
}

/** A moon and a little round it. */
const moon = (frame: readonly string[], body: typeof CALLISTO) => disc(frame, body.x, body.y, body.radius + 1);
/** The lights on a moon's night side, away from the Sun on the left: Io's own ground is yellow by day. */
const towns = (frame: readonly string[], body: typeof CALLISTO) =>
  count(disc(frame, body.x, body.y, body.radius, body.x + body.radius * 0.3), "Y", "a");
const JUPITER = ["d", "m", "o", "a", "y", "w"];
const SPOT = ["r"];

describe("card 6: Jupiter and its moons", () => {
  it("opens on card 5's last frame, the Corridor, where the dive starts", () => {
    expect(visible(frameAt(0))).toEqual(card5End());
  });

  it("dives into the Great Red Spot until the storm fills the screen", () => {
    const storm = visible(frameAt((DIVE_MS + PULL_FROM_MS) / 2));

    expect(count(storm, ...SPOT, "o", "m")).toBeGreaterThan(storm.length * 0.85);
    expect(count(storm, ...SPOT)).toBeGreaterThan(storm.length * 0.3);
    expect(frameAt(DIVE_MS + 100)).not.toEqual(frameAt(DIVE_MS + 100 + 3 * FRAME_MS));
  });

  it("pulls back out to Jupiter, a giant behind the moons, and only then starts the caption", () => {
    const shot = visible(frameAt(REVEALED_MS));

    expect(count(shot, ...JUPITER)).toBeGreaterThan(shot.length * 0.45);
    expect(JUPITER_RADIUS).toBeGreaterThan(VISIBLE * 0.9);
    expect(JUPITER_X + JUPITER_RADIUS).toBeGreaterThan(FRAME_WIDTH);
    expect(JUPITER_Y - JUPITER_RADIUS).toBeLessThan(0);
    expect(typedCharsAt(CARD, REVEALED_MS)).toBe(0);
    expect(CALLISTO_MS).toBeGreaterThan(REVEALED_MS);
  });

  it("keeps the spot in plain sight, redder than the cloud round it, and turning", () => {
    const spot = (time: number) => count(visible(frameAt(time)), ...SPOT);

    for (const time of [REVEALED_MS, IO_LIT_MS, END_MS]) expect(spot(time)).toBeGreaterThan(300);
    expect(frameAt(END_MS - 400)).not.toEqual(frameAt(END_MS - 400 + 4 * FRAME_MS));
  });

  it("shows the four moons dark at first", () => {
    for (const body of [CALLISTO, EUROPA, IO, GANYMEDE]) {
      expect(moon(frameAt(REVEALED_MS), body).filter((pixel) => pixel !== ".").length).toBeGreaterThan(body.radius * body.radius);
      expect(towns(frameAt(REVEALED_MS), body)).toBeLessThan(body.radius);
    }
  });

  it.each([
    { body: CALLISTO, cue: CALLISTO_MS, lit: CALLISTO_LIT_MS },
    { body: EUROPA, cue: EUROPA_MS, lit: EUROPA_LIT_MS },
    { body: IO, cue: IO_MS, lit: IO_LIT_MS },
  ])("lights $body.name on its name: the line reaches it, and its towns come on", ({ body, cue, lit }) => {
    expect(upcoming(cue)).toMatch(new RegExp(`^${body.name}`));
    expect(towns(frameAt(lit), body)).toBeGreaterThan(towns(frameAt(cue - 1), body) + 6);
    // Lit in turn: not before its own name.
    expect(towns(frameAt(cue - 1), body)).toBe(towns(frameAt(REVEALED_MS), body));
  });

  it("runs the line of light from moon to moon, dark until each name", () => {
    const dots = (time: number) =>
      LEGS.map((leg) => leg.dots.map(([x, y]) => at(frameAt(time), Math.round(x), Math.round(y))).join(""));

    expect(LEGS.map((leg) => leg.to)).toEqual([CALLISTO, EUROPA, IO]);
    expect(dots(REVEALED_MS).join("")).toMatch(/^b+$/);
    expect(dots(IO_LIT_MS).join("")).toMatch(/^[yw]+$/);
  });

  it("never lights Ganymede, and keeps it there, dark, through the glitch to the end", () => {
    expect(upcoming(GANYMEDE_MS)).toMatch(/^Ganymede/);
    expect(captionText(CARD).slice(0, CARD.glitchAtChar)).toMatch(/Ganymede was found unsuitable\.$/);

    const ganymede = (time: number) => moon(frameAt(time), GANYMEDE);
    for (const time of [REVEALED_MS, IO_LIT_MS, GANYMEDE_MS, GLITCH_MS, END_MS]) {
      expect(count(ganymede(time), "g", "p")).toBeGreaterThan(100);
      expect(count(ganymede(time), "Y")).toBe(0);
    }
  });

  it("under reduced motion, holds a still for each beat: the map, the moons dark, each lit, Ganymede dark", () => {
    expect(visible(frameAt(REVEALED_MS - 1, true))).toEqual(card5End());
    expect(towns(frameAt(REVEALED_MS, true), CALLISTO)).toBeLessThan(CALLISTO.radius);
    expect(towns(frameAt(CALLISTO_LIT_MS, true), CALLISTO)).toBeGreaterThan(6);
    expect(towns(frameAt(EUROPA_LIT_MS, true), EUROPA)).toBeGreaterThan(6);
    expect(towns(frameAt(IO_LIT_MS, true), IO)).toBeGreaterThan(6);
    expect(count(moon(frameAt(END_MS, true), GANYMEDE), "g", "p")).toBeGreaterThan(100);
    expect(towns(frameAt(END_MS, true), GANYMEDE)).toBe(0);
  });
});
