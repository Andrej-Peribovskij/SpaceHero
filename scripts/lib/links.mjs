// The link check behind `scripts/check-links.mjs`, kept here so a test can
// import it. The entry point runs it unconditionally: an "am I the main
// module" guard compares paths, and through a junction, a symlink or an 8.3
// short name the comparison fails and a gate passes having checked nothing.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** `[text](target)`, excluding images' leading `!` only incidentally — they are checked too. */
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

/** An opening or closing code fence: up to three spaces, then three or more ` or ~. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** An inline code span: a backtick run, anything on the line, the same run again. */
const CODE_SPAN = /(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)/g;

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
 * The source with fenced code blocks and inline code spans blanked out, so a
 * Markdown example inside one — often with a placeholder path — is not
 * mistaken for a link. Line breaks survive, so nothing else moves.
 * Indented (four-space) code blocks are not recognised; use a fence.
 */
export function withoutCode(source) {
  let fence = null;
  return source
    .split("\n")
    .map((line) => {
      const f = FENCE.exec(line);
      if (fence) {
        // A closing fence: the same character, at least as long, nothing after.
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length && f[2].trim() === "") fence = null;
        return "";
      }
      // A backtick fence's info string may not contain a backtick.
      if (f && !(f[1][0] === "`" && f[2].includes("`"))) {
        fence = f[1];
        return "";
      }
      return line.replace(CODE_SPAN, "");
    })
    .join("\n");
}

/**
 * Repo-relative Markdown paths in the working tree of `root`: tracked and
 * untracked-but-not-ignored, minus any deleted, moved away or turned into a
 * directory and not yet staged. `-z` keeps a non-ASCII name from coming back
 * quoted.
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
  // A path with a merge conflict is listed once per stage. `--deduplicate`
  // would do this, but only from git 2.31; older distributions ship older.
  const paths = new Set(r.stdout.split("\0").filter(Boolean));
  return [...paths].filter((file) => statSync(join(root, file), { throwIfNoEntry: false })?.isFile());
}

/**
 * Whether every segment of `target` below `root` exists with exactly this
 * case. Windows and macOS file systems ignore case, Linux CI and GitHub do
 * not, so `existsSync` alone passes a link locally that fails everywhere
 * else. Outside `root` only existence is checked. `listings` caches
 * directory reads across calls.
 */
function existsWithCase(root, target, listings) {
  if (!existsSync(target)) return false;
  const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return true;

  let dir = root;
  for (const segment of rel.split(sep)) {
    if (!listings.has(dir)) listings.set(dir, new Set(readdirSync(dir)));
    if (!listings.get(dir).has(segment)) return false;
    dir = join(dir, segment);
  }
  return true;
}

/**
 * `file -> target` for every relative link in `files` that does not resolve,
 * and `file (unreadable: CODE)` for a file that cannot be read.
 */
export function brokenLinks(root, files) {
  const broken = [];
  const listings = new Map();
  for (const file of files) {
    const absolute = join(root, file);
    let source;
    try {
      source = readFileSync(absolute, "utf8");
    } catch (e) {
      broken.push(`${file} (unreadable: ${e.code ?? e.message})`);
      continue;
    }

    for (const match of withoutCode(source).matchAll(LINK)) {
      const path = pathPart(match[1]);
      if (path === null) continue;

      // GitHub resolves `/docs/x.md` from the repository root, not the disk's.
      const target = path.startsWith("/") ? join(root, path) : resolve(dirname(absolute), path);
      if (!existsSync(target)) {
        broken.push(`${file} -> ${match[1]}`);
      } else if (!existsWithCase(root, target, listings)) {
        broken.push(`${file} -> ${match[1]} (case differs from the file on disk)`);
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
