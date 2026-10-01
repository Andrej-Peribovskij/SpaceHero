import { TRANSPARENT, isCycleChar, isPaletteChar, type CycleChar, type PaletteChar } from "./palette";

/**
 * Card art as text: rows of single characters, one per pixel (design.md §3).
 *
 * A background is the whole frame. A sprite is a small square that the renderer turns
 * about a centre, where `_` leaves the pixel behind it showing. Both are validated when their
 * module loads, so a mistyped pixel fails the first test that imports the card, with the art's
 * name, the row and the column in the message.
 *
 * Rows may be indented inside their template literal: whitespace is trimmed from both ends of
 * every row, and blank lines before and after the grid are ignored. Neither can be a pixel.
 */

/**
 * The screen's resolution: 384×216, exactly four times the first build's 96×54, so a picture
 * drawn at that size scales up by whole pixels. Shown 768 wide, each pixel is 2×2 screen pixels.
 */
export const FRAME_WIDTH = 384;
export const FRAME_HEIGHT = 216;

export type Pixel = PaletteChar | CycleChar;

/** Row-major, `FRAME_WIDTH × FRAME_HEIGHT` pixels. */
export interface Background {
  readonly pixels: readonly Pixel[];
}

/** Row-major, `size × size` pixels; `null` is transparent. */
export interface Sprite {
  readonly size: number;
  readonly pixels: readonly (Pixel | null)[];
}

function rowsOf(text: string): string[] {
  const rows = text.split(/\r?\n/).map((row) => row.trim());

  while (rows.length > 0 && rows[0] === "") rows.shift();
  while (rows.length > 0 && rows.at(-1) === "") rows.pop();

  return rows;
}

function pixelOf(name: string, row: number, column: number, char: string, transparent: boolean): Pixel | null {
  if (isPaletteChar(char) || isCycleChar(char)) return char;
  if (transparent && char === TRANSPARENT) return null;

  const allowed = transparent ? `a palette colour, a cycle or "${TRANSPARENT}"` : "a palette colour or a cycle";
  throw new Error(`${name}, row ${row + 1}, column ${column + 1}: "${char}" is not ${allowed}`);
}

function parse(name: string, text: string, width: number, height: number, transparent: boolean): (Pixel | null)[] {
  const rows = rowsOf(text);

  if (rows.length !== height) throw new Error(`${name}: expected ${height} rows, found ${rows.length}`);

  return rows.flatMap((row, y) => {
    const chars = [...row];

    if (chars.length !== width) {
      throw new Error(`${name}, row ${y + 1}: expected ${width} pixels, found ${chars.length}`);
    }

    return chars.map((char, x) => pixelOf(name, y, x, char, transparent));
  });
}

/** A full frame. Every pixel must be a palette colour or a cycle: a background has no "nothing". */
export function parseBackground(name: string, text: string): Background {
  return { pixels: parse(name, text, FRAME_WIDTH, FRAME_HEIGHT, false) as Pixel[] };
}

/** A square sprite, as wide as it is tall, so that it can turn about its centre. */
export function parseSprite(name: string, text: string): Sprite {
  const size = rowsOf(text).length;

  return { size, pixels: parse(name, text, size, size, true) };
}

/**
 * A flipbook: square frames of one size, separated by a blank line, in the order they are shown.
 * Errors name the frame, counted from 1, as well as its row and column.
 */
export function parseFrames(name: string, text: string): Sprite[] {
  const blocks = text
    .split(/\r?\n[ \t]*\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "");

  const frames = blocks.map((block, index) => parseSprite(`${name}, frame ${index + 1}`, block));
  const size = frames[0]?.size;

  frames.forEach((frame, index) => {
    if (frame.size !== size) {
      throw new Error(`${name}, frame ${index + 1}: expected ${size}×${size} like frame 1, found ${frame.size}×${frame.size}`);
    }
  });

  return frames;
}
