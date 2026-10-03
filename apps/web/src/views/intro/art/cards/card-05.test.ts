import { cardDurationMs, typedCharsAt } from "../../intro-timeline";
import { INTRO_CARDS, captionText } from "../../script";
import { FRAME_WIDTH } from "../grid";
import { VISIBLE } from "../paint";
import { FRAME_MS, frameTime, renderFrame } from "../render";
import { CARD_04_ART } from "./card-04";
import {
  CARD_05_ART,
  CLOSE_MS,
  CORRIDOR_FROM_MS,
  CORRIDOR_LIT_MS,
  CORRIDOR_MS,
  DEIMOS_X,
  DEIMOS_Y,
  EXTERNA_LIT_MS,
  EXTERNA_MS,
  FOOT_X,
  FOOT_Y,
  HAND_X,
  HAND_Y,
  JUMP_TO_FOOT_MS,
  JUMP_TO_HAND_MS,
  MAP_STATIONS,
  MAP_STEADY_FOOT,
  MAP_STEADY_HAND,
  MARS_RADIUS,
  MARS_X,
  MARS_Y,
  MAP_JUPITER,
  PULL_FROM_MS,
  pullingJupiter,
  STEADY_FOOT_LIT_MS,
  STEADY_FOOT_MS,
  STEADY_HAND_LIT_MS,
  STEADY_HAND_MS,
  ZOOM_MS,
} from "./card-05";

const CARD = INTRO_CARDS[5]!;
const END_MS = cardDurationMs(5) - 1;
const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];
const count = (pixels: readonly string[], ...colours: string[]) => pixels.filter((pixel) => colours.includes(pixel)).length;
/** What is still to type the moment a cue fires: its words, if the cue is on them. */
const upcoming = (time: number) => captionText(CARD).slice(typedCharsAt(CARD, time - 1));
const frameAt = (time: number, still = false) => renderFrame(CARD_05_ART, time, { still });
const card4End = () => renderFrame(CARD_04_ART, frameTime(cardDurationMs(4) - 1)).slice(0, VISIBLE * FRAME_WIDTH);

function region(frame: readonly string[], left: number, top: number, right: number, bottom: number): string[] {
  const pixels: string[] = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) pixels.push(at(frame, x, y)!);
  return pixels;
}

/** Deimos and the city on it, in the wide shot: Mars ends well to its left. */
const deimos = (frame: readonly string[]) => region(frame, DEIMOS_X - 32, DEIMOS_Y - 34, DEIMOS_X + 25, DEIMOS_Y + 34);
/** A station's middle: its hub, where its windows are. */
const hub = (frame: readonly string[], x: number, y: number) => region(frame, x - 9, y - 10, x + 10, y + 10);
const lit = (pixels: readonly string[]) => count(pixels, "a", "Y");
const mapStation = (frame: readonly string[], index: number) => at(frame, Math.round(MAP_STATIONS[index]![0]), Math.round(MAP_STATIONS[index]![1]));

/** The longest run of one streak colour along any row: stars streaking past. */
function longestStreak(frame: readonly string[]): number {
  let longest = 0;
  for (let y = 0; y < VISIBLE; y += 1) {
    let run = 0;
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      run = ["b", "s"].includes(at(frame, x, y)!) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  return longest;
}

describe("card 5: Mars and Deimos, and the Corridor", () => {
  it("opens on card 4's last frame, where the zoom starts", () => {
    expect(frameAt(0).slice(0, VISIBLE * FRAME_WIDTH)).toEqual(card4End());
  });

  it("zooms into Mars, growing it from its dot on the Plan until it fills the frame's left", () => {
    // Mars's lit ground, measured where the hall has long gone: the planet, growing.
    const mars = (share: number) => count(region(frameAt(share * ZOOM_MS), 0, 0, FRAME_WIDTH, VISIBLE), "r", "o", "a");
    const sizes = [0.7, 0.8, 0.9, 1].map(mars);

    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(sizes.at(-1)).toBeGreaterThan(Math.PI * MARS_RADIUS * MARS_RADIUS * 0.25);
    expect(["r", "o", "a"]).toContain(at(frameAt(ZOOM_MS), MARS_X - 30, MARS_Y));
  });

  it("sinks card 4's hall and its light into the dark on the way", () => {
    expect(count(frameAt(0), "y", "Y")).toBeGreaterThan(50);
    expect(count(frameAt(ZOOM_MS * 0.65), "y", "Y")).toBe(0);
  });

  it("ends the zoom with Deimos magnified beside Mars, and only then starts the caption", () => {
    expect(count(deimos(frameAt(ZOOM_MS)), "g", "p")).toBeGreaterThan(400);
    expect(typedCharsAt(CARD, ZOOM_MS - 1)).toBe(0);
    expect(EXTERNA_MS).toBeGreaterThanOrEqual(ZOOM_MS);
  });

  it("lights Externa on Deimos on \"Externa\", with a teal beacon among its towers", () => {
    expect(upcoming(EXTERNA_MS)).toMatch(/^Externa/);
    expect(lit(deimos(frameAt(EXTERNA_MS - 1)))).toBe(0);
    expect(lit(deimos(frameAt(EXTERNA_LIT_MS)))).toBeGreaterThan(20);
    expect(Math.max(...[0, 450].map((offset) => count(deimos(frameAt(EXTERNA_LIT_MS + offset)), "t")))).toBeGreaterThan(0);
  });

  it("closes in on Externa Prima, and holds it until the caption moves on to the steadies", () => {
    const close = frameAt(CLOSE_MS + 300);

    // Absolute Connections' tower, its windows teal; the city's own windows; Mars's lit cities above.
    expect(count(close, "t")).toBeGreaterThan(30);
    expect(lit(region(close, 100, 40, 260, 140))).toBeGreaterThan(80);
    expect(lit(region(close, 0, 0, 180, 60))).toBeGreaterThan(5);

    expect(captionText(CARD).slice(0, typedCharsAt(CARD, JUMP_TO_FOOT_MS))).toBe("Externa, 2312. ");
    expect(JUMP_TO_FOOT_MS - CLOSE_MS).toBeGreaterThan(1500);
  });

  it("jumps on along the Corridor, the stars streaking past", () => {
    expect(longestStreak(frameAt(CLOSE_MS + 300))).toBeLessThan(25);
    expect(longestStreak(frameAt((JUMP_TO_FOOT_MS + STEADY_FOOT_MS) / 2))).toBeGreaterThan(35);
  });

  it("arrives at Steady Foot dark, and lights it on its name", () => {
    expect(upcoming(STEADY_FOOT_MS)).toMatch(/^Steady Foot/);
    expect(lit(hub(frameAt(STEADY_FOOT_MS), FOOT_X, FOOT_Y))).toBe(0);
    expect(lit(hub(frameAt(STEADY_FOOT_LIT_MS), FOOT_X, FOOT_Y))).toBeGreaterThan(10);
  });

  it("crosses the belt on the second jump, its rocks rushing past, and not on the first", () => {
    const rocks = (frame: readonly string[]) => count(frame.slice(0, VISIBLE * FRAME_WIDTH), "g");

    expect(rocks(frameAt((JUMP_TO_FOOT_MS + STEADY_FOOT_MS) / 2))).toBe(0);
    expect(rocks(frameAt((JUMP_TO_HAND_MS + STEADY_HAND_MS) / 2))).toBeGreaterThan(50);
  });

  it("arrives at Steady Hand dark, with Jupiter ahead, and lights it on its name", () => {
    expect(upcoming(STEADY_HAND_MS)).toMatch(/^Steady Hand/);
    expect(lit(hub(frameAt(STEADY_HAND_MS), HAND_X, HAND_Y))).toBe(0);
    expect(lit(hub(frameAt(STEADY_HAND_LIT_MS), HAND_X, HAND_Y))).toBeGreaterThan(10);
    expect(count(region(frameAt(STEADY_HAND_LIT_MS), 310, 20, 360, 70), "o", "a", "y")).toBeGreaterThan(50);
  });

  it("pulls out to the whole Corridor on \"A corridor\", the steadies lit and the rest dark", () => {
    const map = frameAt(CORRIDOR_FROM_MS);

    expect(upcoming(CORRIDOR_FROM_MS)).toMatch(/^A corridor/);
    expect(["w", "y"]).toContain(at(map, 1, 90));
    expect(mapStation(map, MAP_STEADY_FOOT)).toBe("w");
    expect(mapStation(map, MAP_STEADY_HAND)).toBe("w");
    expect(MAP_STATIONS.filter((_station, index) => mapStation(map, index) === "b")).toHaveLength(MAP_STATIONS.length - 2);
  });

  it("keeps Jupiter far off through the pull-out: one Jupiter, gliding to its place on the map, not shrinking away with the station", () => {
    const jupiterAt = (time: number) => {
      const { x, y, radius } = pullingJupiter(time);
      const half = Math.floor(radius / 2);
      return count(region(frameAt(time), Math.round(x) - half, Math.round(y) - half, Math.round(x) + half, Math.round(y) + half), "m", "o", "a", "y");
    };
    const moments = [0.1, 0.3, 0.5, 0.7, 0.9].map((share) => PULL_FROM_MS + share * (CORRIDOR_FROM_MS - PULL_FROM_MS));

    for (const time of moments) expect(jupiterAt(time)).toBeGreaterThan(20);
    // It ends where the map has it, a little smaller than ahead of the station, and gets there steadily.
    const end = pullingJupiter(CORRIDOR_FROM_MS - 1);
    expect([end.x, end.y, end.radius].map(Math.round)).toEqual([MAP_JUPITER.x, MAP_JUPITER.y, MAP_JUPITER.radius]);
    const radii = moments.map((time) => pullingJupiter(time).radius);
    expect(radii).toEqual([...radii].sort((a, b) => b - a));
  });

  it("puts the belt between the steadies, far from Mars", () => {
    expect(MAP_STEADY_HAND).toBeGreaterThan(MAP_STEADY_FOOT + 5);
    expect(MAP_STATIONS[MAP_STEADY_HAND]![0] - MAP_STATIONS[MAP_STEADY_FOOT]![0]).toBeGreaterThan(100);
  });

  it("lights every station on \"corridor of light\", and runs a pulse along them", () => {
    expect(upcoming(CORRIDOR_MS)).toMatch(/^corridor of light/);
    expect(MAP_STATIONS.filter((_station, index) => mapStation(frameAt(CORRIDOR_LIT_MS), index) === "b")).toHaveLength(0);

    const pulse = (time: number) => MAP_STATIONS.map((_station, index) => mapStation(frameAt(time), index)).join("");
    expect(pulse(CORRIDOR_LIT_MS + 200)).not.toBe(pulse(CORRIDOR_LIT_MS + 600));
    expect(CORRIDOR_LIT_MS).toBeLessThan(END_MS - 1000);
  });

  it("keeps every shot moving", () => {
    for (const time of [EXTERNA_LIT_MS, CLOSE_MS + 300, STEADY_FOOT_LIT_MS, STEADY_HAND_LIT_MS + 100]) {
      expect(frameAt(time)).not.toEqual(frameAt(time + 4 * FRAME_MS));
    }
  });

  it("under reduced motion, holds a still for each beat: the Plan, the planets, Externa wide and close, each steady, the Corridor", () => {
    expect(frameAt(ZOOM_MS - 1, true).slice(0, VISIBLE * FRAME_WIDTH)).toEqual(card4End());
    expect(count(deimos(frameAt(ZOOM_MS, true)), "g", "p")).toBeGreaterThan(400);
    expect(lit(deimos(frameAt(EXTERNA_LIT_MS, true)))).toBeGreaterThan(20);
    expect(count(frameAt(JUMP_TO_FOOT_MS + 100, true), "t")).toBeGreaterThan(30);
    expect(lit(hub(frameAt(STEADY_FOOT_LIT_MS, true), FOOT_X, FOOT_Y))).toBeGreaterThan(10);
    expect(lit(hub(frameAt(STEADY_HAND_LIT_MS, true), HAND_X, HAND_Y))).toBeGreaterThan(10);
    expect(MAP_STATIONS.every((_station, index) => mapStation(frameAt(END_MS, true), index) !== "b")).toBe(true);
  });
});
