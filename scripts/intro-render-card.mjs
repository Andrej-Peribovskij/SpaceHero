// Renders a Chapter 1 intro card to images, for reviewing its art without running the game.
//
// For each card it writes a contact sheet of eight evenly spaced moments, an animated PNG of the
// whole card at 12 frames a second, and a still for every time given — all as the screen shows
// them, caption band included. PNG and animated PNG open in any browser or image viewer.
//
// The rendering itself is apps/web/src/views/intro/tools/render-card.preview.ts, run by Vitest
// because the card art is TypeScript. This script checks what was typed and hands it over in the
// environment, never on pnpm's command line: on Windows pnpm runs through cmd.exe, which cannot
// carry arbitrary arguments safely (see scripts/lib/run.mjs).
//
// Usage:
//   pnpm run intro:render-card 1              card 1: contact sheet and animated PNG
//   pnpm run intro:render-card 1 1500 4100    …and stills at 1.5 s and 4.1 s into the card
//
// Output goes to .cache/intro-previews/, which git ignores.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isMainModule } from "./lib/main-module.mjs";
import { runPnpm } from "./lib/run.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the images land. Ignored by git through `.cache/`. */
export const OUTPUT_DIR = join(repoRoot, ".cache", "intro-previews");

/**
 * Cards 0 to 10, as `apps/web/src/views/intro/script.ts` numbers them. Repeated here because this
 * script cannot import TypeScript; the renderer checks the card against the script itself, so a
 * drifted bound fails there rather than rendering the wrong thing.
 */
export const LAST_CARD = 10;

const USAGE = "usage: pnpm run intro:render-card <card 0–10> [still times in ms…]";

/** The card and the still times, checked. Throws with the usage line on anything else. */
export function parseArgs(args) {
  const [cardArg, ...timeArgs] = args;
  const wholeNumber = (text) => /^\d+$/.test(text ?? "");

  if (!wholeNumber(cardArg) || Number(cardArg) > LAST_CARD) {
    throw new Error(`"${cardArg ?? ""}" is not a card.\n${USAGE}`);
  }

  const bad = timeArgs.find((time) => !wholeNumber(time));
  if (bad !== undefined) throw new Error(`"${bad}" is not a time in whole milliseconds.\n${USAGE}`);

  return { card: Number(cardArg), stillsMs: timeArgs.map(Number) };
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Named, because the preview config collects every `.preview.ts`, and this runs only the renderer.
  return runPnpm(["--filter", "./apps/web", "exec", "vitest", "run", "--config", "vitest.preview.config.ts", "render-card"], {
    cwd: repoRoot,
    env: {
      INTRO_CARD: String(parsed.card),
      INTRO_STILLS: parsed.stillsMs.join(","),
      INTRO_OUT: OUTPUT_DIR,
    },
  });
}

if (isMainModule(import.meta.url)) process.exit(main());
