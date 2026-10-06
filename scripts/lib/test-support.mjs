// Scaffolding for tests that run a script the way a developer or CI does: from
// a copy of the tree in a temporary directory, optionally a git repository,
// optionally reached through a link.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const scriptsDir = join(import.meta.dirname, "..");

/** Keeps the developer's system and global git config out of throwaway repositories. */
export function isolateGitConfig() {
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.GIT_CONFIG_GLOBAL = join(tmpdir(), "spacehero-test-no-such-gitconfig");
}

/**
 * Copies `files` (paths relative to `scripts/`) into `<root>/tree/scripts/`,
 * runs `body(root)`, and removes the directory afterwards.
 * @param {{ prefix: string, files: string[], repository?: boolean }} options
 * @param {(root: string) => void} body
 */
export function withCopyOfScripts({ prefix, files, repository = false }, body) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  try {
    const tree = join(root, "tree");
    for (const file of files) {
      const to = join(tree, "scripts", file);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(join(scriptsDir, file), to);
    }
    if (repository) assert.equal(spawnSync("git", ["init", "-q"], { cwd: tree }).status, 0);
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * A link at `<root>/link` to `<root>/tree`: a junction on Windows (no privilege
 * needed), a directory symlink elsewhere. Returns the link's path.
 */
export function linkToTree(root) {
  const link = join(root, "link");
  symlinkSync(join(root, "tree"), link, "junction");
  return link;
}
