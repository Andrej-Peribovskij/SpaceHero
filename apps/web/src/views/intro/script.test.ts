import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { INTRO_CARDS, captionText } from "./script";

/**
 * `script.ts` against the story's own script, `docs/story/chapter-01-intro.md`.
 *
 * The captions are canon and live in the doc; `script.ts` is a copy the game can type out. A
 * test that compared the view with `script.ts` could only prove the copy agrees with itself, so
 * this one reads the doc's Script table and holds every card to it — a caption edited in one
 * place and not the other fails here, whichever place it was.
 */
// Resolved by hand: Vite rewrites `new URL("…", import.meta.url)` into a served-asset URL,
// which is not a path readFileSync can open.
const SCRIPT_DOC = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../docs/story/chapter-01-intro.md");

interface ScriptRow {
  readonly index: number;
  readonly image: string;
  readonly caption: string;
}

/**
 * The rows of the doc's `| # | Image | Caption |` table, as plain text.
 *
 * Markdown the game renders differently is removed: `*…*` becomes plain words (the game sets
 * them in italics from `emphasis`), and card 6's cross-reference to the glitch section is a note
 * to the reader, not part of the caption.
 */
function scriptRows(): ScriptRow[] {
  const markdown = readFileSync(SCRIPT_DOC, "utf8");
  const section = markdown.split(/^## Script$/m)[1]?.split(/^## /m)[0] ?? "";

  return section
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const [index, image, caption] = line.split("|").slice(1, 4).map((cell) => cell.trim());

      return {
        index: Number(index),
        image: image!,
        caption: caption!
          .replace(/\s+—\s+\*see \[[^\]]*\]\([^)]*\)\*$/, "")
          .replace(/\*([^*]+)\*/g, "$1"),
      };
    });
}

const ROWS = scriptRows();

test("the doc's Script table is found and has one row per card", () => {
  expect(ROWS.map((row) => row.index)).toEqual(INTRO_CARDS.map((_card, index) => index));
});

test.each(ROWS)("card $index: caption and image match the script word for word", (row) => {
  const card = INTRO_CARDS[row.index]!;

  expect(captionText(card)).toBe(row.caption);
  expect(card.image).toBe(row.image);
});
