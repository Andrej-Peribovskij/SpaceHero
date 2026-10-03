/**
 * Writes card 2's fighters as `tools/fighters.ts` draws them, each ready to paste between the
 * backticks of its picture in `cards/card-02.ts`. Started by `pnpm run intro:draw-fighters`; the
 * file lands in `.cache/intro-previews/`, which git ignores, beside the card renders.
 *
 * A `.preview.ts`, not a test, like `render-card.preview.ts`: only `vitest.preview.config.ts`
 * collects it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { it } from "vitest";

import { FIGHTER_POSES, drawFighter, type FighterPose } from "./fighters";

/** From `apps/web/src/views/intro/tools/` up to the repository root, then into the cache. */
const OUT = fileURLToPath(new URL("../../../../../../.cache/intro-previews/fighters.txt", import.meta.url));

it("draws the fighters", () => {
  const blocks = (Object.keys(FIGHTER_POSES) as FighterPose[]).map(
    (pose) => `${pose}\n${drawFighter(FIGHTER_POSES[pose]).map((row) => `  ${row}`).join("\n")}`,
  );

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${blocks.join("\n\n")}\n`);
  console.log(`fighters: ${OUT}`);
});
