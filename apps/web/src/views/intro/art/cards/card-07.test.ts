import { cardDurationMs, typedCharsAt } from "../../intro-timeline";
import { INTRO_CARDS, captionText } from "../../script";
import { FRAME_WIDTH } from "../grid";
import { FRAME_MS, renderFrame } from "../render";
import { VISIBLE } from "./card-05";
import {
  CARD_07_ART,
  EARTH_RADIUS,
  EARTH_X,
  EARTH_Y,
  FIELD,
  HORIZON,
  LAUNCH_MS,
  MARS,
  ORBIT_MS,
  PULLED_MS,
  RIVERS,
  SKY_FULL_MS,
  TILT_FROM_MS,
  WHITE_FROM_MS,
  YEAR_ZERO_MS,
} from "./card-07";

const CARD = INTRO_CARDS[7]!;
const END_MS = cardDurationMs(7) - 1;
const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];
const count = (pixels: readonly string[], ...colours: string[]) => pixels.filter((pixel) => colours.includes(pixel)).length;
/** What is still to type the moment a cue fires: its words, if the cue is on them. */
const upcoming = (time: number) => captionText(CARD).slice(typedCharsAt(CARD, time - 1));
const frameAt = (time: number, still = false) => renderFrame(CARD_07_ART, time, { still });
const visible = (frame: readonly string[]) => frame.slice(0, VISIBLE * FRAME_WIDTH);

function region(frame: readonly string[], left: number, top: number, right: number, bottom: number): string[] {
  const pixels: string[] = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) pixels.push(at(frame, x, y)!);
  return pixels;
}

/** The sky over the launch field, above the horizon's mesas. */
const sky = (frame: readonly string[]) => region(frame, 0, 0, FRAME_WIDTH, HORIZON - 30);
const FLAMES = ["Y", "o", "r"];
/** Where Mars sits once the camera has pulled back: part of the way out. */
const MARS_X = Math.round(EARTH_X + MARS.x * EARTH_RADIUS);
const MARS_Y = Math.round(EARTH_Y + MARS.y * EARTH_RADIUS);
const SHIPS = ["w", "y", "Y", "o"];

describe("card 7: the Diaspora", () => {
  it("opens on white, cutting from card 6, and the launch field comes out of it", () => {
    expect(visible(frameAt(0)).every((pixel) => pixel === "w")).toBe(true);
    const field = visible(frameAt(LAUNCH_MS - 1));
    expect(count(field, "n")).toBeGreaterThan(400);
    expect(count(field, ...FLAMES)).toBe(0);
  });

  it("lights the nearest ship on \"Diaspora\"", () => {
    const [first] = FIELD;
    const below = (time: number) => region(frameAt(time), first!.x - 5, HORIZON + first!.pad - 6, first!.x + 6, HORIZON + first!.pad + 12);

    expect(upcoming(LAUNCH_MS)).toMatch(/^Diaspora/);
    expect(count(below(LAUNCH_MS - 1), ...FLAMES)).toBe(0);
    expect(count(below(LAUNCH_MS + 2 * FRAME_MS), ...FLAMES)).toBeGreaterThan(5);
  });

  it("fills the sky with ships rising on columns of smoke", () => {
    const before = sky(frameAt(LAUNCH_MS - 1));
    const full = sky(frameAt(SKY_FULL_MS));

    expect(count(full, "g")).toBeGreaterThan(count(before, "g") + 1500);
    expect(count(region(frameAt(SKY_FULL_MS), 0, 0, FRAME_WIDTH, HORIZON), "Y")).toBeGreaterThan(30);
  });

  it("tilts up with them into the black on \"and the calendar\", and only then goes to orbit", () => {
    expect(upcoming(TILT_FROM_MS)).toMatch(/^and the calendar/);
    expect(count(visible(frameAt(TILT_FROM_MS - 1)), "w", "y", "p")).toBeGreaterThan(VISIBLE * FRAME_WIDTH * 0.6);
    const top = visible(frameAt(ORBIT_MS - 500));
    expect(count(top, ".", "n")).toBeGreaterThan(top.length * 0.6);
  });

  it("pulls back from orbit to a white Earth, its ships streaming away in rivers", () => {
    const shot = frameAt(PULLED_MS);
    const earth = region(shot, EARTH_X - 20, EARTH_Y - 20, EARTH_X + 20, EARTH_Y + 20);

    expect(count(earth, "w", "p", "y")).toBeGreaterThan(earth.length * 0.5);
    expect(count(region(shot, MARS_X - 2, MARS_Y - 2, MARS_X + 2, MARS_Y + 2), "r", "o")).toBeGreaterThan(8);
    // Between the Earth and Mars: the rivers, lit.
    expect(count(region(shot, EARTH_X + EARTH_RADIUS + 10, 10, MARS_X - 10, EARTH_Y), ...SHIPS)).toBeGreaterThan(300);
  });

  it("sends the most of them on past Mars, out of the frame, and the rest to Mars and Deimos", () => {
    const share = (arrives: boolean) => RIVERS.filter((river) => river.arrives === arrives).reduce((sum, river) => sum + river.share, 0);
    const shot = frameAt(PULLED_MS);

    expect(share(false)).toBeGreaterThan(0.6);
    expect(share(true) + share(false)).toBeCloseTo(1);
    // Past Mars, at the frame's right edge: the rivers bound for the stations beyond.
    expect(count(region(shot, FRAME_WIDTH - 30, 0, FRAME_WIDTH, VISIBLE), ...SHIPS)).toBeGreaterThan(30);
    // And ships closing in on Mars itself.
    expect(count(region(shot, MARS_X - 14, MARS_Y - 4, MARS_X - 4, MARS_Y + 14), ...SHIPS)).toBeGreaterThan(2);
  });

  it("holds on \"Year Zero\", then bleeds to white before the card ends, for card 8", () => {
    expect(upcoming(YEAR_ZERO_MS)).toMatch(/^Year Zero/);
    expect(WHITE_FROM_MS - YEAR_ZERO_MS).toBeGreaterThan(1500);
    expect(visible(frameAt(WHITE_FROM_MS - 1)).every((pixel) => pixel === "w")).toBe(false);
    expect(visible(frameAt(END_MS)).every((pixel) => pixel === "w")).toBe(true);
  });

  it("keeps every shot moving", () => {
    for (const time of [LAUNCH_MS - 300, SKY_FULL_MS, TILT_FROM_MS + 600, PULLED_MS + 300]) {
      expect(frameAt(time)).not.toEqual(frameAt(time + 4 * FRAME_MS));
    }
  });

  it("under reduced motion, holds a still for each beat: the field, the sky full, the rivers", () => {
    expect(count(visible(frameAt(LAUNCH_MS + 300, true)), ...FLAMES)).toBe(0);
    expect(count(sky(frameAt(SKY_FULL_MS + 300, true)), "g")).toBeGreaterThan(1500);
    expect(count(region(frameAt(PULLED_MS + 300, true), EARTH_X + EARTH_RADIUS + 10, 10, MARS_X - 10, EARTH_Y), ...SHIPS)).toBeGreaterThan(300);
    expect(visible(frameAt(END_MS, true)).every((pixel) => pixel === "w")).toBe(true);
  });
});
