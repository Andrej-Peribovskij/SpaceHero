/**
 * Reads the pixel font's text form: blocks separated by a blank line, each a `[label]` line and
 * then the glyph's rows, `#` for ink and `.` for none. The label is the character itself, or
 * `space`. Rows may be indented; whitespace around them is trimmed.
 */

export const GLYPH_ROWS = 11;
export const GLYPH_COLUMNS = 7;

/** A glyph's ink, row-major, `GLYPH_COLUMNS × GLYPH_ROWS`. */
export type Glyph = readonly boolean[];

export function parseFont(text: string): ReadonlyMap<string, Glyph> {
  const font = new Map<string, Glyph>();
  const blocks = text
    .split(/\r?\n[ \t]*\r?\n/)
    .map((block) => block.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== ""))
    .filter((lines) => lines.length > 0);

  for (const [header, ...rows] of blocks) {
    const label = /^\[(.+)\]$/.exec(header!)?.[1];
    if (label === undefined) throw new Error(`font: expected a [label] line, found "${header}"`);

    const char = label === "space" ? " " : label;
    if ([...char].length !== 1) throw new Error(`font: "${label}" is not one character or "space"`);
    if (font.has(char)) throw new Error(`font [${label}]: drawn twice`);
    if (rows.length !== GLYPH_ROWS) throw new Error(`font [${label}]: expected ${GLYPH_ROWS} rows, found ${rows.length}`);

    const ink = rows.flatMap((row, y) => {
      if (!/^[#.]+$/.test(row) || row.length !== GLYPH_COLUMNS) {
        throw new Error(`font [${label}], row ${y + 1}: expected ${GLYPH_COLUMNS} of "#" or ".", found "${row}"`);
      }
      return [...row].map((pixel) => pixel === "#");
    });

    font.set(char, ink);
  }

  return font;
}
