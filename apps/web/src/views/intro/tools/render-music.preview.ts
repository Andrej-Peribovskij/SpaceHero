/**
 * Writes the intro's sound to a WAV, for listening to it without playing the video: the loop
 * twice, then card 10 as it sounds — the stop, the pause, the snore and the silence after — and
 * card 11: Module 2's ident starting the loop again from the top, Joe waking to it, and his punch
 * cutting it dead, then the silence the video ends on. Started by `pnpm run intro:render-music`;
 * the file lands in `.cache/intro-previews/`, which git ignores.
 *
 * These are the very samples the browser plays: the synth computes the music and the punch, the
 * snore and the snort are read from their recordings (`music/sounds/`), and Web Audio only plays
 * the buffers.
 * What this file cannot reproduce is the glitch's drop-out, which is a gain on the browser's side.
 *
 * A `.preview.ts`, not a test, like `render-card.preview.ts`: only `vitest.preview.config.ts`
 * collects it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { it } from "vitest";

import { cardDurationMs } from "../intro-timeline";
import { renderPunch } from "../music/punch";
import { decodeWav } from "../music/sounds";
import { SAMPLE_RATE, renderTune } from "../music/synth";
import { ORIENTATION_TUNE } from "../music/tune";
import { SNORE_PAUSE_S } from "../music/web-audio";
import { END_CARD, INTRO_CARDS, SNORE_CARD } from "../script";
import { encodeWav } from "./wav";

const HERE = dirname(fileURLToPath(import.meta.url));

/** From `apps/web/src/views/intro/tools/` up to the repository root, then into the cache. */
const OUT = resolve(HERE, "../../../../../../.cache/intro-previews/music.wav");

const LOOPS = 2;

/** The silence kept after the punch: the video ends on it. */
const AFTER_MS = 1500;

/** A recording from `music/sounds/`, as samples. */
function recording(name: string): Float32Array<ArrayBuffer> {
  const bytes = readFileSync(resolve(HERE, "../music/sounds", name));
  return decodeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

it("renders the music", () => {
  const loop = renderTune(ORIENTATION_TUNE);
  const snore = recording("snore.wav");
  const wake = recording("wake.wav");
  const punch = renderPunch();
  const { wakeAtMs, punchAtMs } = INTRO_CARDS[END_CARD]!;
  const samples = (ms: number) => Math.round((ms * SAMPLE_RATE) / 1000);
  const snoreCard = samples(cardDurationMs(SNORE_CARD));
  const restart = loop.length * LOOPS + snoreCard;
  const struck = restart + samples(punchAtMs!);
  const out = new Float32Array(struck + samples(AFTER_MS));

  for (let i = 0; i < LOOPS; i += 1) out.set(loop, i * loop.length);
  out.set(snore, loop.length * LOOPS + samples(SNORE_PAUSE_S * 1000));
  // Module 2's music, until the punch cuts it dead.
  out.set(loop.subarray(0, struck - restart), restart);
  // The snort plays over the music, so it is mixed in rather than set.
  const wakeAt = restart + samples(wakeAtMs!);
  wake.forEach((value, i) => {
    if (wakeAt + i < struck) out[wakeAt + i]! += value;
  });
  out.set(punch, struck);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, encodeWav(out, SAMPLE_RATE));
  console.log(`music: ${OUT} (${(out.length / SAMPLE_RATE).toFixed(1)} s)`);
});
