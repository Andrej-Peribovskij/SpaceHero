// Every relative link in every Markdown file git would commit resolves to a
// file.
//
// The gate for a documentation change, which is otherwise ungated. This
// repository's docs cross-reference heavily — the agent guide, the docs index,
// the design process and its conventions all point at each other — and a
// renamed file breaks those links silently. Nothing else notices.
//
// "Would commit" means the working tree, not the index: tracked files that
// still exist, plus untracked files that are not ignored. A move that is not
// staged yet — archiving an OpenSpec change is one — leaves the old path in
// the index and the new one untracked. Reading the index alone crashed on the
// old path and never looked at the new one, whose relative links are exactly
// the ones a move breaks. On CI's clean checkout the two readings agree.
//
// Deliberately relative links only: an HTTP checker needs the network, turns a
// third party's outage into a red build, and is the kind of check people learn
// to ignore.
//
// Usage:  node scripts/check-links.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** `[text](target)`, excluding images' leading `!` only incidentally — they are checked too. */
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

/** Targets that are not paths into this repository. */
export function isExternal(target) {
  return /^(https?:|mailto:|tel:|#|<)/.test(target);
}

/** The path part of a link target, or null when there is nothing to resolve. */
export function pathPart(target) {
  if (isExternal(target)) return null;
  const path = target.split("#")[0].trim();
  return path === "" ? null : decodeURI(path);
}

/**
 * Repo-relative Markdown paths in the working tree of `root`: tracked and
 * untracked-but-not-ignored, minus any deleted or moved away and not yet
 * staged. `-z` keeps a non-ASCII name from coming back quoted.
 */
export function markdownFiles(root) {
  const r = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.md"],
    { cwd: root, encoding: "utf8" },
  );
  if (r.error || r.status !== 0) {
    throw new Error(`git ls-files failed: ${(r.stderr || String(r.error)).trim()}`);
  }
  // A path with a merge conflict is listed once per stage.
  const paths = new Set(r.stdout.split("\0").filter(Boolean));
  return [...paths].filter((file) => existsSync(join(root, file)));
}

/** `file -> target` for every relative link in `files` that does not resolve. */
export function brokenLinks(root, files) {
  const broken = [];
  for (const file of files) {
    const absolute = join(root, file);
    const source = readFileSync(absolute, "utf8");

    for (const match of source.matchAll(LINK)) {
      const path = pathPart(match[1]);
      if (path === null) continue;

      const target = resolve(dirname(absolute), path);
      if (!existsSync(target)) {
        broken.push(`${file} -> ${match[1]}`);
      } else if (path.endsWith("/") && !statSync(target).isDirectory()) {
        broken.push(`${file} -> ${match[1]} (not a directory)`);
      }
    }
  }
  return broken;
}

function main() {
  const files = markdownFiles(repoRoot);
  const broken = brokenLinks(repoRoot, files);

  if (broken.length > 0) {
    console.error(`${broken.length} broken relative link(s):\n`);
    for (const b of broken) console.error(`  ${b}`);
    return 1;
  }

  console.log(`Checked ${files.length} Markdown files; every relative link resolves.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main());
