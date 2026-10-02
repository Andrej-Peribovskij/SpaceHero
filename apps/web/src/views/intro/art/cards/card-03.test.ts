import { cardDurationMs, typedCharsAt } from "../../intro-timeline";
import { INTRO_CARDS, captionText } from "../../script";
import { FRAME_WIDTH } from "../grid";
import { FRAME_MS, renderFrame } from "../render";
import { CARD_03_ART, CUT_MS, HORIZON, LOGO_MS, ORDER_MS, RING_X, RING_Y, RISEN_MS, SKY_RADIUS } from "./card-03";

const at = (frame: readonly string[], x: number, y: number) => frame[y * FRAME_WIDTH + x];
const END_MS = cardDurationMs(3) - 1;

function region(frame: readonly string[], left: number, top: number, right: number, bottom: number): string[] {
  const pixels: string[] = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) pixels.push(at(frame, x, y)!);
  return pixels;
}

const count = (pixels: readonly string[], ...colours: string[]) => pixels.filter((pixel) => colours.includes(pixel)).length;

/** The pixels between two distances from the middle of the ring. */
function ring(frame: readonly string[], inner: number, outer: number): string[] {
  const pixels: string[] = [];
  for (let y = 0; y < 166; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const r = Math.hypot(x + 0.5 - RING_X, y + 0.5 - RING_Y);
      if (r >= inner && r < outer) pixels.push(at(frame, x, y)!);
    }
  }
  return pixels;
}

/** The towers of the first shot: their dark faces, rims and windows, above the ruins. */
const towers = (frame: readonly string[]) => count(region(frame, 0, 0, FRAME_WIDTH, HORIZON - 20), "n", "b", "p", "t");

/** The people on the ground, lit; in a tower's shadow they turn dark. */
const litPeople = (frame: readonly string[]) => count(region(frame, 0, HORIZON + 2, FRAME_WIDTH, 166), "g");

/** The topmost thing at the left edge, clear of every tower and its dust: the ruins, which shake with the ground. */
function groundAt(frame: readonly string[]): number {
  let y = 0;
  while (at(frame, 3, y) === "w") y += 1;
  return y;
}

/**
 * The square's yellow corner, round the sky: nothing else in the ring shot is that yellow, so it
 * finds the square among the towers.
 */
const yellow = (frame: readonly string[], inner = 0, outer = 80) => ring(frame, inner, outer).filter((pixel) => pixel === "Y").length;

/** The angle of the square's yellow corner about the middle of the sky. */
function yellowAngle(frame: readonly string[]): number {
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < 166; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      if (at(frame, x, y) === "Y") {
        sx += x + 0.5 - RING_X;
        sy += y + 0.5 - RING_Y;
      }
    }
  }
  return Math.atan2(sy, sx);
}

describe("card 3: the corporations", () => {
  it("opens on the ruins, the people among them, and no tower yet", () => {
    const frame = renderFrame(CARD_03_ART, 0);

    expect(towers(frame)).toBe(0);
    expect(litPeople(frame)).toBeGreaterThan(100);
    expect(at(frame, 192, 5)).toBe("w");
  });

  it("raises every tower before the cut", () => {
    expect(RISEN_MS).toBeLessThan(CUT_MS);
  });

  it("raises the towers, and the tallest out of the top of the frame", () => {
    let before = 0;
    for (let time = 0; time <= RISEN_MS; time += FRAME_MS) {
      const now = towers(renderFrame(CARD_03_ART, time));
      expect(now).toBeGreaterThanOrEqual(before);
      before = now;
    }
    expect(["n", "b", "t"]).toContain(at(renderFrame(CARD_03_ART, RISEN_MS), 198, 0));
  });

  it("lights the tallest in Absolute Connections teal", () => {
    expect(renderFrame(CARD_03_ART, RISEN_MS)).toContain("t");
  });

  it("shakes the ground while they rise, and holds it still once they stand", () => {
    const rising = new Set<number>();
    for (let time = 600; time < 1600; time += FRAME_MS) rising.add(groundAt(renderFrame(CARD_03_ART, time)));
    const standing = new Set<number>();
    for (let time = RISEN_MS; time < CUT_MS; time += FRAME_MS) standing.add(groundAt(renderFrame(CARD_03_ART, time)));

    expect(rising.size).toBe(2);
    expect(standing.size).toBe(1);
  });

  it("runs the towers' shadows out across the ground, swallowing the people", () => {
    expect(litPeople(renderFrame(CARD_03_ART, RISEN_MS))).toBeLessThan(litPeople(renderFrame(CARD_03_ART, 0)) / 2);
  });

  it("cuts to the ring of towers, looking up at the one sky between their tops", () => {
    const frame = renderFrame(CARD_03_ART, CUT_MS);

    expect(new Set(ring(frame, 0, SKY_RADIUS - 1))).toEqual(new Set(["w"]));
    expect(count(ring(frame, 80, 90), "n", "b")).toBeGreaterThan(100);
  });

  it("turns on the lights floor by floor, from the street up towards the sky", () => {
    const early = renderFrame(CARD_03_ART, CUT_MS + 300);
    const lit = renderFrame(CARD_03_ART, ORDER_MS - FRAME_MS);

    expect(count(ring(early, 150, 400), "p", "t")).toBeGreaterThan(0);
    expect(count(ring(early, 45, 70), "p", "t")).toBe(0);
    expect(count(ring(lit, 45, 70), "p", "t")).toBeGreaterThan(0);
  });

  it("flashes every light at once on \"Order returned\", then blinks every beacon together", () => {
    const card = INTRO_CARDS[3]!;
    const flashing = renderFrame(CARD_03_ART, ORDER_MS);
    const after = renderFrame(CARD_03_ART, ORDER_MS + 300);

    expect(captionText(card).slice(typedCharsAt(card, ORDER_MS))).toMatch(/^Order returned\./);
    expect(count(flashing, "p", "t")).toBe(0);
    expect(count(after, "p", "t")).toBeGreaterThan(1000);

    expect(count(renderFrame(CARD_03_ART, ORDER_MS - FRAME_MS), "r")).toBe(0);
    const beacons = [ORDER_MS + 300, ORDER_MS + 800].map((time) => count(renderFrame(CARD_03_ART, time), "r"));
    expect(beacons).toContain(0);
    expect(Math.max(...beacons)).toBeGreaterThan(0);
  });

  it("turns the ring", () => {
    expect(renderFrame(CARD_03_ART, ORDER_MS + 300)).not.toEqual(renderFrame(CARD_03_ART, ORDER_MS + 1300));
  });

  it("brings Absolute Connections' square round the sky as \"One world. Many partners.\" starts typing", () => {
    const card = INTRO_CARDS[3]!;

    expect(captionText(card).slice(typedCharsAt(card, LOGO_MS))).toBe("One world. Many partners.");
    expect(yellow(renderFrame(CARD_03_ART, LOGO_MS - 1))).toBe(0);
    expect(yellow(renderFrame(CARD_03_ART, LOGO_MS))).toBeGreaterThan(100);
  });

  it("sets the square round the white circle, over the towers, and leaves the circle clear", () => {
    for (const time of [LOGO_MS, LOGO_MS + 600, LOGO_MS + 1100]) {
      const frame = renderFrame(CARD_03_ART, time);

      expect(new Set(ring(frame, 0, SKY_RADIUS - 1))).toEqual(new Set(["w"]));
      expect(yellow(frame, SKY_RADIUS, 80)).toBeGreaterThan(100);
    }
  });

  it("turns the square anticlockwise, against the ring", () => {
    const turned = yellowAngle(renderFrame(CARD_03_ART, LOGO_MS + 500)) - yellowAngle(renderFrame(CARD_03_ART, LOGO_MS));

    expect(Math.atan2(Math.sin(turned), Math.cos(turned))).toBeLessThan(0);
  });

  it("under reduced motion, holds a still for each beat: the ruins, the towers, the ring lit, the square", () => {
    const still = { still: true };

    expect(towers(renderFrame(CARD_03_ART, 1000, still))).toBe(0);
    expect(renderFrame(CARD_03_ART, CUT_MS - 1, still)).toEqual(renderFrame(CARD_03_ART, RISEN_MS, still));
    expect(towers(renderFrame(CARD_03_ART, RISEN_MS, still))).toBeGreaterThan(5000);
    expect(count(renderFrame(CARD_03_ART, ORDER_MS + 400, still), "p", "t")).toBeGreaterThan(1000);
    expect(yellow(renderFrame(CARD_03_ART, ORDER_MS + 400, still))).toBe(0);

    const square = renderFrame(CARD_03_ART, END_MS, still);
    expect(yellow(square)).toBeGreaterThan(100);
    expect(renderFrame(CARD_03_ART, LOGO_MS, still)).toEqual(square);
  });
});
