import { FRAME_HEIGHT, FRAME_WIDTH } from "../art/grid";
import type { PaletteChar } from "../art/palette";
import { renderFrame, type CardArt } from "../art/render";
import type { CaptionSegment } from "../script";
import { FONT, ADVANCE } from "./font";
import { glitchFrameAt, glitchScreen } from "./glitch";
import { GLYPH_COLUMNS, GLYPH_ROWS } from "./glyphs";
import { layoutCaption, type CaptionLine } from "./layout";

/**
 * The whole orientation screen as one picture: the card's art, and over its lower edge a black
 * band holding the caption and the prompt, drawn in the pixel font. Art and text share the same
 * pixels, so the video reads as one old monitor rather than pixel art inside a modern page.
 *
 * A pure function of what is on screen and the time, like the art renderer beneath it.
 */

const MARGIN_X = 8;
const BAND_PADDING_TOP = 6;
const BAND_PADDING_BOTTOM = 5;
const LINE_HEIGHT = GLYPH_ROWS + 2;
const PROMPT_GAP = 4;

/** How many characters fit on a caption line between the margins. */
export const CAPTION_COLUMNS = Math.floor((FRAME_WIDTH - 2 * MARGIN_X + (ADVANCE - GLYPH_COLUMNS)) / ADVANCE);

const TEXT: PaletteChar = "p";
/** The pixel font has no italics: what the script sets in italics is set in yellow. */
const EMPHASIS: PaletteChar = "Y";
const PROMPT: PaletteChar = "g";

/** The prompt blinks on and off at this period. */
export const BLINK_MS = 600;

export interface ScreenContent {
  /** The card's art; a black picture until it is drawn. */
  readonly art: CardArt | undefined;
  readonly caption: readonly CaptionSegment[];
  /** How many caption characters have been typed. */
  readonly shownChars: number;
  /** The line under an ident that asks for a key, if one is showing. */
  readonly prompt: string | undefined;
  /** Whether the prompt is in the lit half of its blink. */
  readonly promptLit: boolean;
  /** Time on the card's clock. */
  readonly timeMs: number;
  /** Reduced motion: the art does not move, though its scenes and fades still change on cue. */
  readonly still?: boolean;
  /**
   * When, on the card's clock, the screen tears for two frames: the Ganymede glitch, on card 6
   * only. Never under reduced motion.
   */
  readonly glitchAtMs?: number;
}

/** Whether a blinking prompt is lit at `timeMs`: on for one period, off for the next. */
export function isLit(timeMs: number): boolean {
  return Math.floor(timeMs / BLINK_MS) % 2 === 0;
}

function drawChar(frame: PaletteChar[], char: string, left: number, top: number, colour: PaletteChar): void {
  const glyph = FONT.get(char);
  if (!glyph) throw new Error(`pixel font: no glyph for "${char}"`);

  glyph.forEach((ink, index) => {
    const x = left + (index % GLYPH_COLUMNS);
    const y = top + Math.floor(index / GLYPH_COLUMNS);
    if (ink && x >= 0 && y >= 0 && x < FRAME_WIDTH && y < FRAME_HEIGHT) frame[y * FRAME_WIDTH + x] = colour;
  });
}

/** How tall the band must be for these caption lines and, if any, a prompt. */
function bandHeight(lines: readonly CaptionLine[], prompt: string | undefined): number {
  if (lines.length === 0 && prompt === undefined) return 0;

  const promptHeight = prompt === undefined ? 0 : (lines.length > 0 ? PROMPT_GAP : 0) + LINE_HEIGHT;
  return BAND_PADDING_TOP + lines.length * LINE_HEIGHT + promptHeight + BAND_PADDING_BOTTOM;
}

/**
 * Each caption's lines, laid out once: a card's caption never changes, and the screen repaints it
 * twelve times a second.
 */
const layouts = new WeakMap<readonly CaptionSegment[], readonly CaptionLine[]>();

function linesOf(caption: readonly CaptionSegment[]): readonly CaptionLine[] {
  let lines = layouts.get(caption);
  if (!lines) layouts.set(caption, (lines = layoutCaption(caption, CAPTION_COLUMNS)));
  return lines;
}

export function composeScreen(content: ScreenContent): PaletteChar[] {
  const frame = content.art
    ? renderFrame(content.art, content.timeMs, { still: content.still })
    : new Array<PaletteChar>(FRAME_WIDTH * FRAME_HEIGHT).fill(".");

  // Laid out whole, before typing, so the band's height and every line stay put as it types.
  const lines = linesOf(content.caption);
  const top = FRAME_HEIGHT - bandHeight(lines, content.prompt);

  frame.fill(".", top * FRAME_WIDTH);

  lines.forEach((line, row) => {
    const y = top + BAND_PADDING_TOP + row * LINE_HEIGHT;
    line.forEach((placed, column) => {
      if (placed.index < content.shownChars) {
        drawChar(frame, placed.char, MARGIN_X + column * ADVANCE, y, placed.emphasis ? EMPHASIS : TEXT);
      }
    });
  });

  if (content.prompt !== undefined && content.promptLit) {
    const width = content.prompt.length * ADVANCE - (ADVANCE - GLYPH_COLUMNS);
    const left = Math.floor((FRAME_WIDTH - width) / 2);
    const y = FRAME_HEIGHT - BAND_PADDING_BOTTOM - LINE_HEIGHT;
    [...content.prompt].forEach((char, column) => drawChar(frame, char, left + column * ADVANCE, y, PROMPT));
  }

  // The glitch tears the whole screen, caption and all: the monitor fails, not the picture.
  const glitched = content.glitchAtMs === undefined || content.still ? undefined : glitchFrameAt(content.glitchAtMs, content.timeMs);
  return glitched === undefined ? frame : glitchScreen(frame, glitched);
}
