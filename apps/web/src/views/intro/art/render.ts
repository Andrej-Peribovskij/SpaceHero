import { FRAME_HEIGHT, FRAME_WIDTH, type Background, type Pixel, type Sprite } from "./grid";
import { PALETTE, brighter, colourAt, type PaletteChar } from "./palette";

/**
 * Card art to pixels: a pure function of the art and the time, so every frame can be checked in
 * a test without a browser or a canvas (design.md §3).
 *
 * A card is a list of scenes, each from a moment of the card on; a scene is layers painted in
 * order onto black; and a fade schedule can step the whole picture towards white. Each scene's
 * layers run on the scene's own clock, starting at 0 when the scene cuts in.
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

/** A whole frame of pixel data, such as a starfield. */
export interface GridLayer {
  readonly kind: "grid";
  readonly background: Background;
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

/** What a painted layer draws on: the frame so far, and the layer's own time. */
export interface Canvas {
  /** Time on the scene's clock: 0 when the scene cuts in, and always 0 under reduced motion. */
  readonly timeMs: number;
  /** Set a pixel. A cycle resolves to its colour at this time; off-frame pixels are ignored. */
  set(x: number, y: number, pixel: Pixel): void;
  /** The colour already painted at a pixel, or black off the frame. */
  get(x: number, y: number): PaletteChar;
}

/**
 * Scenery drawn by code (design.md §3, "hybrid"): a sky, a swelling Sun, rising light. Suits
 * pictures that are geometry and effect, whose interesting numbers — a radius, a timing — are
 * worth naming and tweaking; hand-drawn figures stay pixel data and are painted from it.
 */
export interface PaintedLayer {
  readonly kind: "painted";
  readonly paint: (canvas: Canvas) => void;
}

export type Layer = GridLayer | RotatedSprite | Flipbook | PaintedLayer;

export interface Scene {
  /** When, on the card's clock, the scene cuts in. The first scene starts at 0. */
  readonly fromMs: number;
  readonly layers: readonly Layer[];
}

/** From `atMs` on the card's clock, every colour of the art is `steps` shades brighter. */
export interface FadeKey {
  readonly atMs: number;
  readonly steps: number;
}

export interface CardArt {
  readonly scenes: readonly Scene[];
  /** Step changes, in time order. Before the first, nothing is brightened. */
  readonly fade?: readonly FadeKey[];
}

/** A fade one step every `stepMs`, from `fromSteps` to `toSteps`, starting at `atMs`. */
export function fadeRamp(atMs: number, stepMs: number, fromSteps: number, toSteps: number): FadeKey[] {
  const direction = Math.sign(toSteps - fromSteps);
  const count = Math.abs(toSteps - fromSteps) + 1;

  return Array.from({ length: count }, (_, index) => ({ atMs: atMs + index * stepMs, steps: fromSteps + index * direction }));
}

/** A card with one scene and no fade: the common case. */
export function singleScene(...layers: Layer[]): CardArt {
  return { scenes: [{ fromMs: 0, layers }] };
}

/** The time of the 12-fps frame that `timeMs` falls in. */
export function frameTime(timeMs: number): number {
  return Math.floor(timeMs / FRAME_MS) * FRAME_MS;
}

function sceneIndexAt(art: CardArt, timeMs: number): number {
  let index = 0;
  art.scenes.forEach((scene, candidate) => {
    if (scene.fromMs <= timeMs) index = candidate;
  });
  return index;
}

function fadeStepsAt(art: CardArt, timeMs: number): number {
  let steps = 0;
  for (const key of art.fade ?? []) if (key.atMs <= timeMs) steps = key.steps;
  return steps;
}

/**
 * What decides the picture under reduced motion: the scene and the fade. When neither has
 * changed, a still screen need not repaint.
 */
export function stillKey(art: CardArt, timeMs: number): string {
  return `${sceneIndexAt(art, timeMs)}:${fadeStepsAt(art, timeMs)}`;
}

/** How many angle steps the layer has turned by `timeMs`: negative when turning anticlockwise. */
function stepAt(layer: Turning, timeMs: number): number {
  return Math.round(layer.turnsPerSecond * (timeMs / 1000) * layer.stepsPerTurn);
}

function canvasOn(frame: PaletteChar[], timeMs: number): Canvas {
  return {
    timeMs,
    set(x, y, pixel) {
      if (x >= 0 && y >= 0 && x < FRAME_WIDTH && y < FRAME_HEIGHT) {
        frame[Math.floor(y) * FRAME_WIDTH + Math.floor(x)] = colourAt(pixel, timeMs);
      }
    },
    get(x, y) {
      return x >= 0 && y >= 0 && x < FRAME_WIDTH && y < FRAME_HEIGHT ? frame[y * FRAME_WIDTH + x]! : ".";
    },
  };
}

/**
 * Nearest-neighbour rotation: every frame pixel the turned sprite could cover looks up the sprite
 * pixel that lands on it. Pixels keep their hard edges at every angle, which is what makes a
 * rotation read as 8-bit rather than as a smoothed image.
 */
function paintRotated(canvas: Canvas, layer: RotatedSprite): void {
  const { sprite, centreX, centreY } = layer;
  const angle = (stepAt(layer, canvas.timeMs) * 2 * Math.PI) / layer.stepsPerTurn;
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
      const pixel = u >= 0 && v >= 0 && u < sprite.size && v < sprite.size ? sprite.pixels[v * sprite.size + u] : null;

      if (pixel) canvas.set(x, y, pixel);
    }
  }
}

/** Show the frame for the current step, centred on the layer's point, pixel for pixel. */
function paintFlipbook(canvas: Canvas, layer: Flipbook): void {
  const count = layer.frames.length;
  const sprite = layer.frames[((stepAt(layer, canvas.timeMs) % count) + count) % count]!;
  const left = Math.floor(layer.centreX - sprite.size / 2);
  const top = Math.floor(layer.centreY - sprite.size / 2);

  sprite.pixels.forEach((pixel, index) => {
    if (pixel) canvas.set(left + (index % sprite.size), top + Math.floor(index / sprite.size), pixel);
  });
}

function paintLayer(canvas: Canvas, layer: Layer): void {
  switch (layer.kind) {
    case "grid":
      layer.background.pixels.forEach((pixel, index) => canvas.set(index % FRAME_WIDTH, Math.floor(index / FRAME_WIDTH), pixel));
      return;
    case "rotated":
      return paintRotated(canvas, layer);
    case "flipbook":
      return paintFlipbook(canvas, layer);
    case "painted":
      return layer.paint(canvas);
  }
}

export interface RenderOptions {
  /**
   * Reduced motion: nothing moves — every layer is painted at time 0 of its scene — but the story
   * still advances, so scenes cut and fades step on cue.
   */
  readonly still?: boolean;
}

/** The frame at `timeMs` on the card's clock, as palette colours in row-major order. */
export function renderFrame(art: CardArt, timeMs: number, options: RenderOptions = {}): PaletteChar[] {
  const scene = art.scenes[sceneIndexAt(art, timeMs)]!;
  const frame = new Array<PaletteChar>(FRAME_WIDTH * FRAME_HEIGHT).fill(".");
  const canvas = canvasOn(frame, options.still ? 0 : timeMs - scene.fromMs);

  for (const layer of scene.layers) paintLayer(canvas, layer);

  const steps = fadeStepsAt(art, timeMs);
  return steps === 0 ? frame : frame.map((colour) => brighter(colour, steps));
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
