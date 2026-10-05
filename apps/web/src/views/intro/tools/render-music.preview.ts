/**
 * Writes the intro's sound to a WAV, for listening to it without playing the video: the whole
 * video from the key press, timed as it plays. Module 1's loop runs from the gate, drops out at
 * the Ganymede glitch and comes back, and someone snores over it on card 9. Module 2's ident cuts
 * the loop back to its top, Joe wakes to it, and his punch kills it; the silence the video ends on
 * closes the file. Started by `pnpm run intro:render-music`; the file lands in
 * `.cache/intro-previews/`, which git ignores.
 *
 * These are the very samples the browser plays: the synth computes the music and the punch, the
 * snore and the snort are read from their recordings (`music/sounds/`), and Web Audio only plays
 * the buffers. The glitch's drop-out, a gain on the browser's side, is a plain silence here.
 *
 * A `.preview.ts`, not a test, like `render-card.preview.ts`: only `vitest.preview.config.ts`
 * collects it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { it } from "vitest";

import { GLITCH_SILENCE_MS, cardDurationMs, glitchMs, snoreMs } from "../intro-timeline";
import { renderPunch } from "../music/punch";
import { decodeWav } from "../music/sounds";
import { SAMPLE_RATE, renderTune } from "../music/synth";
import { ORIENTATION_TUNE } from "../music/tune";
import { END_CARD, INTRO_CARDS } from "../script";
import { encodeWav } from "./wav";

const HERE = dirname(fileURLToPath(import.meta.url));

/** From `apps/web/src/views/intro/tools/` up to the repository root, then into the cache. */
const OUT = resolve(HERE, "../../../../../../.cache/intro-previews/music.wav");

/** The silence kept after the punch: the video ends on it. */
const AFTER_MS = 1500;

/** A recording from `music/sounds/`, as samples. */
function recording(name: string): Float32Array<ArrayBuffer> {
  const bytes = readFileSync(resolve(HERE, "../music/sounds", name));
  return decodeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

/** When card `index` starts, counted from the key press. */
const cardStartMs = (index: number) => INTRO_CARDS.slice(0, index).reduce((sum, _card, before) => sum + cardDurationMs(before), 0);

it("renders the music", () => {
  const loop = renderTune(ORIENTATION_TUNE);
  const samples = (ms: number) => Math.round((ms * SAMPLE_RATE) / 1000);
  const { wakeAtMs, punchAtMs } = INTRO_CARDS[END_CARD]!;

  const module2 = samples(cardStartMs(END_CARD));
  const struck = module2 + samples(punchAtMs!);
  const out = new Float32Array(struck + samples(AFTER_MS));

  // Module 1's loop, from the key press to Module 2, then Module 2's from its top to the punch.
  for (let i = 0; i < module2; i += 1) out[i] = loop[i % loop.length]!;
  for (let i = module2; i < struck; i += 1) out[i] = loop[(i - module2) % loop.length]!;

  // The glitch: the loop runs on, unheard.
  const glitchCard = INTRO_CARDS.findIndex((card) => card.glitchAtChar !== undefined);
  const silentFrom = samples(cardStartMs(glitchCard) + glitchMs(glitchCard)!);
  out.fill(0, silentFrom, silentFrom + samples(GLITCH_SILENCE_MS));

  // The snore and the snort play over the music, so they are mixed in rather than set.
  const mix = (sound: Float32Array, at: number) => sound.forEach((value, i) => void (out[at + i]! += value));
  const snoreCard = INTRO_CARDS.findIndex((card) => card.snoreAfterMs !== undefined);
  mix(recording("snore.wav"), samples(cardStartMs(snoreCard) + snoreMs(snoreCard)!));
  mix(recording("wake.wav"), module2 + samples(wakeAtMs!));

  out.set(renderPunch(), struck);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, encodeWav(out, SAMPLE_RATE));
  console.log(`music: ${OUT} (${(out.length / SAMPLE_RATE).toFixed(1)} s)`);
});
