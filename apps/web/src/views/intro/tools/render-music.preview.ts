/**
 * Writes the intro's music to a WAV, for listening to the tune without playing the video: the
 * loop twice, then card 10 as it sounds — the stop, the pause, the snore and the silence after —
 * and Module 2's ident starting the loop again from the top — and the snore again on its own.
 * Started by `pnpm run intro:render-music`; the files land in `.cache/intro-previews/`, which git
 * ignores.
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

import { cardDurationMs } from "../intro-timeline";
import { renderSnore } from "../music/snore";
import { SAMPLE_RATE, renderTune } from "../music/synth";
import { ORIENTATION_TUNE } from "../music/tune";
import { SNORE_PAUSE_S } from "../music/web-audio";
import { SNORE_CARD } from "../script";
import { encodeWav } from "./wav";

/** From `apps/web/src/views/intro/tools/` up to the repository root, then into the cache. */
const OUT = fileURLToPath(new URL("../../../../../../.cache/intro-previews/music.wav", import.meta.url));

/** The snore on its own, for tuning it without the music around it. */
const SNORE_OUT = fileURLToPath(new URL("../../../../../../.cache/intro-previews/snore.wav", import.meta.url));

/** Silence either side of the snore alone: room to hear it start and end. */
const SNORE_MARGIN_MS = 500;

const LOOPS = 2;

/** How much of Module 2's restart to keep: enough to hear it come back. */
const RESTART_MS = 8000;

it("renders the music", () => {
  const loop = renderTune(ORIENTATION_TUNE);
  const snore = renderSnore();
  const samples = (ms: number) => Math.round((ms * SAMPLE_RATE) / 1000);
  const snoreCard = samples(cardDurationMs(SNORE_CARD));
  const out = new Float32Array(loop.length * LOOPS + snoreCard + samples(RESTART_MS));

  for (let i = 0; i < LOOPS; i += 1) out.set(loop, i * loop.length);
  out.set(snore, loop.length * LOOPS + samples(SNORE_PAUSE_S * 1000));
  out.set(loop.subarray(0, samples(RESTART_MS)), loop.length * LOOPS + snoreCard);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, encodeWav(out, SAMPLE_RATE));
  console.log(`music: ${OUT} (${(out.length / SAMPLE_RATE).toFixed(1)} s)`);

  const alone = new Float32Array(snore.length + 2 * samples(SNORE_MARGIN_MS));
  alone.set(snore, samples(SNORE_MARGIN_MS));
  writeFileSync(SNORE_OUT, encodeWav(alone, SAMPLE_RATE));
  console.log(`snore: ${SNORE_OUT} (${(alone.length / SAMPLE_RATE).toFixed(1)} s)`);
});
