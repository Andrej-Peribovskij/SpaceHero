/**
 * Tests for scripts/intro-render-card.mjs: its argument checks, which are the guard between what
 * a person types and what reaches Vitest's environment.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { LAST_CARD, parseArgs } from "./intro-render-card.mjs";

describe("parseArgs", () => {
  it("takes a card and any still times", () => {
    assert.deepEqual(parseArgs(["1"]), { card: 1, stillsMs: [] });
    assert.deepEqual(parseArgs(["0", "1500", "4100"]), { card: 0, stillsMs: [1500, 4100] });
  });

  it("accepts the last card and refuses one past it", () => {
    assert.deepEqual(parseArgs([String(LAST_CARD)]).card, LAST_CARD);
    assert.throws(() => parseArgs([String(LAST_CARD + 1)]), /is not a card/);
  });

  it("refuses a missing or non-numeric card, with the usage line", () => {
    assert.throws(() => parseArgs([]), /usage: pnpm run intro:render-card/);
    assert.throws(() => parseArgs(["one"]), /"one" is not a card/);
    assert.throws(() => parseArgs(["-1"]), /is not a card/);
  });

  it("refuses a time that is not whole milliseconds", () => {
    assert.throws(() => parseArgs(["1", "1.5s"]), /"1.5s" is not a time in whole milliseconds/);
    assert.throws(() => parseArgs(["1", "-200"]), /is not a time/);
  });
});
