/**
 * Renders one Chapter 1 intro card to images, for reviewing its art: a contact sheet of eight
 * moments, an animated PNG of the whole card, and any stills asked for. Started by
 * `pnpm run intro:render-card <card> [times…]` (scripts/intro-render-card.mjs), which checks the
 * arguments and passes them here through the environment.
 *
 * A `.preview.ts`, not a test: the normal run never collects it, only `vitest.preview.config.ts`
 * does. It runs under Vitest because the card art is TypeScript and this is the shortest road to
 * importing it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { it } from "vitest";

import { artFor } from "../art";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../art/grid";
import { FRAME_MS } from "../art/render";
import { cardDurationMs, glitchMs, typedCharsAt } from "../intro-timeline";
import { END_CARD, IDENT_CARD, INTRO_CARDS, captionText } from "../script";
import { composeScreen, isLit } from "../screen/compose";
import { encodeApng, encodePng, type Frame } from "./png";

const card = Number(process.env.INTRO_CARD);
const out = process.env.INTRO_OUT ?? "";
const stillsMs = (process.env.INTRO_STILLS ?? "").split(",").filter(Boolean).map(Number);

/** The idents wait at a prompt, so a preview shows a few seconds of them rather than none. */
const MIN_PREVIEW_MS = 3000;

const PROMPTS = new Map([
  [IDENT_CARD, "PRESS ANY KEY TO BEGIN ORIENTATION"],
  [END_CARD, "PRESS ANY KEY TO CONTINUE ORIENTATION"],
]);

function screenAt(timeMs: number): Frame {
  const script = INTRO_CARDS[card]!;
  const whole = card === IDENT_CARD || card === END_CARD;

  return {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    pixels: composeScreen({
      art: artFor(card),
      caption: script.caption,
      shownChars: whole ? captionText(script).length : typedCharsAt(script, timeMs),
      prompt: PROMPTS.get(card),
      promptLit: isLit(timeMs),
      timeMs,
      glitchAtMs: glitchMs(card),
    }),
  };
}

it(`renders card ${card}`, () => {
  if (!Number.isInteger(card) || INTRO_CARDS[card] === undefined) {
    throw new Error(`INTRO_CARD must be a card of the script, 0 to ${INTRO_CARDS.length - 1}; got "${process.env.INTRO_CARD}"`);
  }
  if (!out) throw new Error("INTRO_OUT must name the folder to write the images to");

  mkdirSync(out, { recursive: true });
  const name = `card-${String(card).padStart(2, "0")}`;
  const duration = Math.max(cardDurationMs(card), MIN_PREVIEW_MS);
  const written: string[] = [];
  const write = (file: string, png: Buffer) => {
    writeFileSync(join(out, file), png);
    written.push(file);
  };

  const sheetTimes = Array.from({ length: 8 }, (_, index) => Math.round((index * duration) / 8));
  write(`${name}-sheet.png`, encodePng(sheetTimes.map(screenAt), { columns: 4 }));

  const frames = Array.from({ length: Math.ceil(duration / FRAME_MS) }, (_, index) => screenAt(index * FRAME_MS));
  write(`${name}.apng.png`, encodeApng(frames, { fps: 12, scale: 2 }));

  for (const timeMs of stillsMs) write(`${name}-at-${timeMs}ms.png`, encodePng([screenAt(timeMs)], { scale: 2 }));

  console.log(
    `card ${card}: ${duration} ms; sheet at ${sheetTimes.join(", ")} ms\n` + written.map((file) => `  ${join(out, file)}`).join("\n"),
  );
});
