import { cardDurationMs, typedCharsAt } from "../../intro-timeline";
import { INTRO_CARDS, captionText } from "../../script";
import { FRAME_WIDTH } from "../grid";
import { VISIBLE } from "../paint";
import { FRAME_MS, frameTime, renderFrame } from "../render";
import { CARD_08_ART } from "./card-08";
import {
  CARD_09_ART,
  CLOSE_DEIMOS,
  CLOSE_MS,
  CONTRACTORS_MS,
  CORRIDOR_MS,
  DOME,
  EXTERNA_MS,
  LANDED_MS,
  LIT_X,
  NIGHT_MS,
  WINDOW,
} from "./card-09";

const CARD = INTRO_CARDS[9]!;
const END_MS = cardDurationMs(9) - 1;
const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];
const count = (pixels: readonly string[], ...colours: string[]) => pixels.filter((pixel) => colours.includes(pixel)).length;
/** What is still to type the moment a cue fires: its words, if the cue is on them. */
const upcoming = (time: number) => captionText(CARD).slice(typedCharsAt(CARD, time - 1));
const frameAt = (time: number, still = false) => renderFrame(CARD_09_ART, time, { still });
const visible = (frame: readonly string[]) => frame.slice(0, VISIBLE * FRAME_WIDTH);
const card8End = () => visible(renderFrame(CARD_08_ART, frameTime(cardDurationMs(8) - 1)));

function region(frame: readonly string[], left: number, top: number, right: number, bottom: number): string[] {
  const pixels: string[] = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) pixels.push(at(frame, x, y)!);
  return pixels;
}

/** The room, close, through the window. */
const room = (frame: readonly string[]) =>
  region(frame, WINDOW.x - WINDOW.halfW, WINDOW.y - WINDOW.halfH, WINDOW.x + WINDOW.halfW, WINDOW.y + WINDOW.halfH);
/** How much of the room the video lights: anything brighter than the dark. */
const lit = (frame: readonly string[]) => room(frame).filter((pixel) => ![".", "n", "d"].includes(pixel)).length / room(frame).length;
/** The brightest colour the room shows: the colour of the shot the video is on. */
const shotColour = (frame: readonly string[]) => ["t", "s", "p", "a", "r"].find((colour) => room(frame).includes(colour));

describe("card 9: Mars, 158 A.D.", () => {
  it("opens on card 8's last frame, and the light goes out of it, before the caption starts", () => {
    expect(visible(frameAt(0))).toEqual(card8End());
    expect(visible(frameAt(NIGHT_MS - 1)).every((pixel) => pixel === ".")).toBe(true);
    expect(typedCharsAt(CARD, NIGHT_MS)).toBe(0);
  });

  it("tilts down from the stars to Mars at dusk, a dome on the plain with one window lit", () => {
    const sky = visible(frameAt(NIGHT_MS + 800));
    // High in the sky: stars, no ground yet.
    expect(count(sky, "d", "m", "r")).toBe(0);
    expect(count(sky, "1", "2", "3", "4", "5", "6", "b", "s", "p", "w")).toBeGreaterThan(30);

    const landed = frameAt(LANDED_MS);
    expect(count(region(landed, 0, 150, FRAME_WIDTH, VISIBLE), "d", "m", "r")).toBeGreaterThan(FRAME_WIDTH * 4);
    // One window lit, the rest dark.
    expect(at(landed, LIT_X, DOME.base - 4)).not.toBe(".");
    for (const dark of [LIT_X + 8, LIT_X + 16, LIT_X + 24]) expect(at(landed, dark, DOME.base - 4)).toBe(".");
    expect(upcoming(CORRIDOR_MS)).toMatch(/^the Corridor carries us all/);
    expect(CORRIDOR_MS).toBeGreaterThan(LANDED_MS);
  });

  it("closes in on the lit window on \"contractors like you\", a room lit only by the video, flickering", () => {
    expect(upcoming(CONTRACTORS_MS)).toMatch(/^contractors like you/);
    expect(CLOSE_MS).toBeLessThan(EXTERNA_MS);

    // The video's light on the walls changes colour at its cuts.
    const shots = new Set(Array.from({ length: 12 }, (_, step) => shotColour(frameAt(CLOSE_MS + step * 250))));
    expect(shots.size).toBeGreaterThanOrEqual(3);
    expect(lit(frameAt(CLOSE_MS))).toBeGreaterThan(0.3);
  });

  it("on \"Externa Prima\", blinks Externa's beacon in Absolute Connections teal, and not before", () => {
    expect(upcoming(EXTERNA_MS)).toMatch(/^Externa Prima/);
    const beacon = (time: number) => region(frameAt(time), CLOSE_DEIMOS.x - 3, CLOSE_DEIMOS.y - 4, CLOSE_DEIMOS.x + 4, CLOSE_DEIMOS.y + 3);
    const blinks = (from: number) => Array.from({ length: 12 }, (_, step) => count(beacon(from + step * FRAME_MS), "t")).some(Boolean);
    expect(blinks(CLOSE_MS)).toBe(false);
    expect(blinks(EXTERNA_MS)).toBe(true);
  });

  it("keeps every shot moving", () => {
    for (const time of [LANDED_MS + 200, CLOSE_MS + 300, END_MS - 1600]) {
      expect(frameAt(time)).not.toEqual(frameAt(time + 4 * FRAME_MS));
    }
  });

  it("under reduced motion, holds a still for each beat: card 8's figure, the dome, the window", () => {
    expect(visible(frameAt(0, true))).toEqual(card8End());
    expect(at(frameAt(LANDED_MS + 500, true), LIT_X, DOME.base - 4)).not.toBe(".");
    expect(lit(frameAt(END_MS, true))).toBeGreaterThan(0.3);
  });
});
