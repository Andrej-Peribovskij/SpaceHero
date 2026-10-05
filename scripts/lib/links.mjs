// The link check behind `scripts/check-links.mjs`, kept here so a test can
// import it. The entry point runs it unconditionally: an "am I the main
// module" guard compares paths, and through a junction, a symlink or an 8.3
// short name the comparison fails and a gate passes having checked nothing.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** `[text](target)`, excluding images' leading `!` only incidentally — they are checked too. */
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

/** Targets that are not paths into this repository. */
export function isExternal(target) {
  return /^(https?:|mailto:|tel:|#|<)/.test(target);
}

/**
 * The path part of a link target, or null when there is nothing to resolve.
 * A `%` that is not an escape (`50%-off.md`) is taken literally rather than
 * thrown on.
 */
export function pathPart(target) {
  if (isExternal(target)) return null;
  const path = target.split("#")[0].trim();
  if (path === "") return null;
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/**
 * Repo-relative Markdown paths in the working tree of `root`: tracked and
 * untracked-but-not-ignored, minus any deleted, moved away or turned into a
 * directory and not yet staged. `-z` keeps a non-ASCII name from coming back
 * quoted; `--deduplicate` lists a conflicted path once, not once per stage.
 */
export function markdownFiles(root) {
  const r = spawnSync(
    "git",
    ["ls-files", "-z", "--deduplicate", "--cached", "--others", "--exclude-standard", "--", "*.md"],
    { cwd: root, encoding: "utf8" },
  );
  if (r.error || r.status !== 0) {
    throw new Error(`git ls-files failed: ${(r.stderr || String(r.error)).trim()}`);
  }
  return r.stdout
    .split("\0")
    .filter(Boolean)
    .filter((file) => statSync(join(root, file), { throwIfNoEntry: false })?.isFile());
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

/**
 * The whole check: prints the result and returns the exit code. A failure to
 * list files is reported in one line, not as a stack trace.
 */
export function checkLinks(root, { log = console.log, error = console.error } = {}) {
  let files;
  try {
    files = markdownFiles(root);
  } catch (e) {
    error(`check:links: ${e.message}`);
    return 1;
  }

  const broken = brokenLinks(root, files);
  if (broken.length > 0) {
    error(`${broken.length} broken relative link(s):\n`);
    for (const b of broken) error(`  ${b}`);
    return 1;
  }

  log(`Checked ${files.length} Markdown files; every relative link resolves.`);
  return 0;
}
