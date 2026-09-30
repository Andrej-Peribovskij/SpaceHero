import { FRAME_HEIGHT, FRAME_WIDTH, type Background, type Sprite } from "./grid";
import { PALETTE, colourAt, type PaletteChar } from "./palette";

/**
 * Card art to pixels: a pure function of the art and the time, so every frame can be checked in
 * a test without a browser or a canvas (design.md §3).
 */

/** The cards repaint at 12 frames a second: the cadence of old hardware, not of the display. */
export const FRAME_MS = 1000 / 12;

/** Something that turns about a point of the frame. */
interface Turning {
  /** The point it turns about, in frame pixels. Whole numbers put it on a pixel corner. */
  readonly centreX: number;
  readonly centreY: number;
  /** Positive turns clockwise, as the screen is seen; negative turns anticlockwise. */
  readonly turnsPerSecond: number;
  /** The angle is rounded to this many positions per turn. Fewer steps, chunkier spin. */
  readonly stepsPerTurn: number;
}

/** One sprite, rotated pixel by pixel. Suits chunky shapes, which keep their look at any angle. */
export interface RotatedSprite extends Turning {
  readonly kind: "rotated";
  readonly sprite: Sprite;
}

/**
 * Pre-drawn frames, one per angle step, shown in turn — a flipbook. Suits thin shapes, which
 * pixel-by-pixel rotation breaks up. Frame `k` is the shape turned `k` steps clockwise; a shape
 * that repeats every quarter turn needs only a quarter turn's frames.
 */
export interface Flipbook extends Turning {
  readonly kind: "flipbook";
  readonly frames: readonly Sprite[];
}

export type Layer = RotatedSprite | Flipbook;

export interface CardArt {
  readonly background: Background;
  /** Painted in order, over the background and over each other. */
  readonly layers: readonly Layer[];
}

/** The time of the 12-fps frame that `timeMs` falls in. */
export function frameTime(timeMs: number): number {
  return Math.floor(timeMs / FRAME_MS) * FRAME_MS;
}

/** How many angle steps the layer has turned by `timeMs`: negative when turning anticlockwise. */
function stepAt(layer: Turning, timeMs: number): number {
  return Math.round(layer.turnsPerSecond * (timeMs / 1000) * layer.stepsPerTurn);
}

function paint(frame: PaletteChar[], x: number, y: number, pixel: Sprite["pixels"][number], timeMs: number): void {
  if (pixel && x >= 0 && y >= 0 && x < FRAME_WIDTH && y < FRAME_HEIGHT) {
    frame[y * FRAME_WIDTH + x] = colourAt(pixel, timeMs);
  }
}

/**
 * Nearest-neighbour rotation: every frame pixel the turned sprite could cover looks up the sprite
 * pixel that lands on it. Pixels keep their hard edges at every angle, which is what makes a
 * rotation read as 8-bit rather than as a smoothed image.
 */
function paintRotated(frame: PaletteChar[], layer: RotatedSprite, timeMs: number): void {
  const { sprite, centreX, centreY } = layer;
  const angle = (stepAt(layer, timeMs) * 2 * Math.PI) / layer.stepsPerTurn;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const half = sprite.size / 2;
  const reach = Math.ceil(half * Math.SQRT2) + 1;

  for (let y = Math.floor(centreY - reach); y < centreY + reach; y += 1) {
    for (let x = Math.floor(centreX - reach); x < centreX + reach; x += 1) {
      // From the pixel's centre, turned back by the layer's angle, into sprite coordinates.
      const dx = x + 0.5 - centreX;
      const dy = y + 0.5 - centreY;
      const u = Math.floor(dx * cos + dy * sin + half);
      const v = Math.floor(-dx * sin + dy * cos + half);

      if (u >= 0 && v >= 0 && u < sprite.size && v < sprite.size) {
        paint(frame, x, y, sprite.pixels[v * sprite.size + u], timeMs);
      }
    }
  }
}

/** Show the frame for the current step, centred on the layer's point, pixel for pixel. */
function paintFlipbook(frame: PaletteChar[], layer: Flipbook, timeMs: number): void {
  const count = layer.frames.length;
  const sprite = layer.frames[((stepAt(layer, timeMs) % count) + count) % count]!;
  const left = Math.floor(layer.centreX - sprite.size / 2);
  const top = Math.floor(layer.centreY - sprite.size / 2);

  sprite.pixels.forEach((pixel, index) => {
    paint(frame, left + (index % sprite.size), top + Math.floor(index / sprite.size), pixel, timeMs);
  });
}

/** The frame at `timeMs`, as palette colours in row-major order. */
export function renderFrame(art: CardArt, timeMs: number): PaletteChar[] {
  const frame = art.background.pixels.map((pixel) => colourAt(pixel, timeMs));

  for (const layer of art.layers) {
    if (layer.kind === "rotated") paintRotated(frame, layer, timeMs);
    else paintFlipbook(frame, layer, timeMs);
  }

  return frame;
}

type Rgb = readonly [number, number, number];

function rgbOf(hex: string): Rgb {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

/** Each palette colour as bytes, worked out once rather than for every pixel of every frame. */
const RGB = {} as Record<PaletteChar, Rgb>;
for (const char of Object.keys(PALETTE) as PaletteChar[]) RGB[char] = rgbOf(PALETTE[char]);

/** Write a frame into canvas image data: RGBA, four bytes a pixel, fully opaque. */
export function writeRgba(frame: readonly PaletteChar[], target: Uint8ClampedArray): void {
  frame.forEach((char, index) => {
    const [red, green, blue] = RGB[char];

    target[index * 4] = red;
    target[index * 4 + 1] = green;
    target[index * 4 + 2] = blue;
    target[index * 4 + 3] = 255;
  });
}
