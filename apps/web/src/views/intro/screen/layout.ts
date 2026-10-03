import type { CaptionSegment } from "../script";

/** One character placed on a caption line, with its position in the caption as typed. */
export interface PlacedChar {
  readonly char: string;
  /** Its index in the whole caption: the character appears once this many have been typed. */
  readonly index: number;
  readonly emphasis: boolean;
}

export type CaptionLine = readonly PlacedChar[];

/**
 * Break a caption into lines of at most `columns` characters.
 *
 * The whole caption is laid out before a character of it is typed, so the lines are the same at
 * every moment of typing: a word never starts on one line and jumps to the next as it grows. A
 * `\n` in the caption forces a break, as the idents' two-line titles do. Words wrap whole; a word
 * longer than a line, which no caption has, is split rather than overflowing the screen.
 */
export function layoutCaption(caption: readonly CaptionSegment[], columns: number): CaptionLine[] {
  const chars: PlacedChar[] = [];
  for (const segment of caption) {
    for (const char of segment.text) chars.push({ char, index: chars.length, emphasis: segment.emphasis ?? false });
  }

  const lines: PlacedChar[][] = [[]];
  let word: PlacedChar[] = [];
  // The space before the word being collected, kept so it appears when typing reaches it.
  let space: PlacedChar = { char: " ", index: -1, emphasis: false };

  const place = () => {
    let line = lines.at(-1)!;
    const needed = line.length === 0 ? word.length : line.length + 1 + word.length;

    if (needed > columns && line.length > 0) lines.push((line = []));
    else if (line.length > 0) line.push(space);

    for (const placed of word) {
      if (line.length === columns) lines.push((line = []));
      line.push(placed);
    }
    word = [];
  };

  for (const placed of chars) {
    if (placed.char === "\n") {
      if (word.length > 0) place();
      lines.push([]);
    } else if (placed.char === " ") {
      if (word.length > 0) place();
      space = placed;
    } else {
      word.push(placed);
    }
  }
  if (word.length > 0) place();

  return lines.filter((line, index) => line.length > 0 || index < lines.length - 1);
}
