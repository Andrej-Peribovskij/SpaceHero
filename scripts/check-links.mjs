// Every relative link in every committed Markdown file resolves to a file.
//
// The gate for a documentation change, which is otherwise ungated. This
// repository's docs cross-reference heavily — the agent guide, the docs index,
// the design process and its conventions all point at each other — and a
// renamed file breaks those links silently. Nothing else notices.
//
// Deliberately relative links only: an HTTP checker needs the network, turns a
// third party's outage into a red build, and is the kind of check people learn
// to ignore.
//
// Usage:  node scripts/check-links.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function markdownFiles() {
  const r = spawnSync("git", ["ls-files", "*.md"], { cwd: repoRoot, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git ls-files failed");
  return r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}

const broken = [];
const files = markdownFiles();

for (const file of files) {
  const absolute = join(repoRoot, file);
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

if (broken.length > 0) {
  console.error(`${broken.length} broken relative link(s):\n`);
  for (const b of broken) console.error(`  ${b}`);
  process.exit(1);
}

console.log(`Checked ${files.length} Markdown files; every relative link resolves.`);
