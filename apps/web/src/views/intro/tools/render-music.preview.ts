/**
 * Writes the intro's music to a WAV, for listening to the tune without playing the video: the
 * loop twice, then the stop, the pause and the snore, as card 10 has them. Started by
 * `pnpm run intro:render-music`; the file lands in `.cache/intro-previews/`, which git ignores.
 *
 * These are the very samples the browser plays: the synth computes them, and Web Audio only
 * loops the buffer. What this file cannot reproduce is the glitch's drop-out, which is a gain
 * on the browser's side.
 *
 * A `.preview.ts`, not a test, like `render-card.preview.ts`: only `vitest.preview.config.ts`
 * collects it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { it } from "vitest";

import { renderSnore } from "../music/snore";
import { SAMPLE_RATE, renderTune } from "../music/synth";
import { ORIENTATION_TUNE } from "../music/tune";
import { SNORE_PAUSE_S } from "../music/web-audio";
import { encodeWav } from "./wav";

/** From `apps/web/src/views/intro/tools/` up to the repository root, then into the cache. */
const OUT = fileURLToPath(new URL("../../../../../../.cache/intro-previews/music.wav", import.meta.url));

const LOOPS = 2;

it("renders the music", () => {
  const loop = renderTune(ORIENTATION_TUNE);
  const snore = renderSnore();
  const pause = Math.round(SNORE_PAUSE_S * SAMPLE_RATE);
  const out = new Float32Array(loop.length * LOOPS + pause + snore.length);

  for (let i = 0; i < LOOPS; i += 1) out.set(loop, i * loop.length);
  out.set(snore, loop.length * LOOPS + pause);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, encodeWav(out, SAMPLE_RATE));
  console.log(`music: ${OUT} (${(out.length / SAMPLE_RATE).toFixed(1)} s)`);
});
