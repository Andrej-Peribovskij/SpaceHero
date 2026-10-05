// The /opsx commands are edited in this repository, but `pnpm run spec:update`
// rewrites .claude/commands/opsx/*.md from OpenSpec's templates and drops those
// edits without a word. These tests make the loss show up as a failure. See
// openspec/README.md, "The /opsx commands are ours".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const archive = readFileSync(
  join(import.meta.dirname, "..", ".claude", "commands", "opsx", "archive.md"),
  "utf8",
);

test("archive runs through spec:archive, which syncs the baseline specs", () => {
  assert.match(archive, /pnpm run spec:archive <name>/);
});

test("archive never moves the change folder by hand", () => {
  assert.doesNotMatch(archive, /^\s*(mkdir -p|mv) openspec\/changes/m);
});

test("archive stops when validation refuses, rather than going round it", () => {
  assert.match(archive, /If it refuses, stop\./);
});

test("archive gets onto a feature branch before it writes anything", () => {
  assert.match(archive, /Get onto a feature branch/);
});

test("archive stages only what it touched", () => {
  assert.match(archive, /Never `git add -A openspec`/);
});

test("archive offers verification of the ticked tasks", () => {
  assert.match(archive, /Offer verification/);
});
