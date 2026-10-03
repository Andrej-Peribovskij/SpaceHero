import { cardDurationMs, msToType } from "../intro-timeline";
import { INTRO_CARDS, captionText } from "../script";
import { FRAME_WIDTH, type Picture } from "./grid";
import { colourAt, type PaletteChar } from "./palette";
import { FRAME_MS, ditherAt, frameTime, renderFrame, type Canvas, type CardArt } from "./render";

/**
 * What the painted cards share: noise, easing, shading by dither, painting a picture or a whole
 * scene off screen, and cueing a beat on the caption. One copy, so a fix reaches every card and the
 * noise is the same hash everywhere.
 */

/** The bottom of the visible picture: the caption band covers what is below. */
export const VISIBLE = 178;

/** A stable pseudo-random number for a pixel: the same every frame, so nothing shimmers by accident. */
export function noise(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Noise that varies smoothly: blotches rather than grain. With a `period`, it wraps that often across. */
export function smoothNoise(x: number, y: number, period = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const ease = (f: number) => f * f * (3 - 2 * f);
  const fx = ease(x - x0);
  const fy = ease(y - y0);
  const at = (u: number, v: number) => noise(period ? (((x0 + u) % period) + period) % period : x0 + u, y0 + v);
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * fx;
  const bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * fx;
  return top + (bottom - top) * fy;
}

/** Smoothstep: eases in and out of a move. */
export const ease = (p: number) => p * p * (3 - 2 * p);
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const fraction = (value: number) => value - Math.floor(value);
/** Which 12-fps frame a moment falls in: for things that change a frame at a time. */
export const frameOf = (timeMs: number) => Math.floor(timeMs / FRAME_MS);

/** A light level in [0, 1] as a colour of `ladder`, dithered between its rungs. */
export const rungOf = (ladder: readonly PaletteChar[], light: number, x: number, y: number) =>
  ladder[Math.max(0, Math.min(ladder.length - 1, Math.floor(light * (ladder.length - 1) + ditherAt(x, y))))]!;

/** A hand-drawn picture, its transparent pixels leaving what is behind it. */
export function paintPicture(canvas: Canvas, picture: Picture, left: number, top: number): void {
  picture.pixels.forEach((pixel, index) => {
    if (pixel) canvas.set(left + (index % picture.width), top + Math.floor(index / picture.width), pixel);
  });
}

/** A scene painted into a frame of its own, off screen, for a push-in or a zoom to magnify. */
export function offscreen(timeMs: number, paint: (canvas: Canvas) => void): PaletteChar[] {
  const frame = new Array<PaletteChar>(FRAME_WIDTH * VISIBLE).fill(".");
  paint({
    timeMs,
    set(x, y, pixel) {
      if (x >= 0 && y >= 0 && x < FRAME_WIDTH && y < VISIBLE) frame[Math.floor(y) * FRAME_WIDTH + Math.floor(x)] = colourAt(pixel, timeMs);
    },
    get(x, y) {
      return x >= 0 && y >= 0 && x < FRAME_WIDTH && y < VISIBLE ? frame[y * FRAME_WIDTH + x]! : ".";
    },
  });
  return frame;
}

/**
 * A card's cue: when the first letter of `words` appears, on the card's clock. The beats follow the
 * caption, so a change to its pauses moves them with it.
 */
export function cueOn(card: number): (words: string) => number {
  const script = INTRO_CARDS[card]!;
  const caption = captionText(script);
  return (words) => {
    const at = caption.indexOf(words);
    if (at < 0) throw new Error(`card ${card}: the caption has no "${words}"`);
    return msToType(script, at + 1);
  };
}

const lastFrames = new WeakMap<CardArt, readonly PaletteChar[]>();

/** A card's last frame, worked out once: the picture the next card opens on. */
export function lastFrameOf(card: number, art: CardArt): readonly PaletteChar[] {
  let frame = lastFrames.get(art);
  if (!frame) lastFrames.set(art, (frame = renderFrame(art, frameTime(cardDurationMs(card) - 1))));
  return frame;
}
