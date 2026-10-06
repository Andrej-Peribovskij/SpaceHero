// The link check behind `scripts/check-links.mjs`, kept here so a test can
// import it. The entry point runs it unconditionally: an "am I the main
// module" guard compares paths, and through a junction, a symlink or an 8.3
// short name the comparison fails and a gate passes having checked nothing.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** `[text](target)`, excluding images' leading `!` only incidentally — they are checked too. */
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

/**
 * A reference definition, `[label]: target`, at the start of a line indented
 * at most three spaces; four would make it an indented code block. A label
 * starting with `^` is a GitHub footnote, whose text is not a link. A
 * definition cannot interrupt a paragraph on GitHub; here it can, so one on a
 * paragraph's second line is checked although GitHub renders it as text.
 */
const DEFINITION = /^ {0,3}\[(?!\^)(?:[^\]\\\n]|\\.)+\]:[ \t]*(\S+)/gm;

/**
 * An opening or closing code fence: three or more ` or ~, then the info
 * string. Any indentation counts, because a fence inside a list item sits as
 * deep as the item's text — eight spaces in a nested list.
 */
const FENCE = /^[ \t]*(`{3,}|~{3,})(.*)$/;

/** Targets that are not paths into this repository; `//host/path` is a URL without its scheme. */
export function isExternal(target) {
  return /^(https?:|mailto:|tel:|#|<|\/\/)/.test(target);
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
 * mistaken for a link. Every line survives, so nothing else moves.
 *
 * Two shortcuts, both towards checking too much rather than too little:
 * indented (four-space) code blocks are not recognised, so a link-shaped line
 * in one is checked — use a fence; and a code span is looked for within one
 * line, so one that wraps onto the next is not recognised.
 */
export function withoutCode(source) {
  let fence = null;
  return source
    .split(/\r?\n/)
    .map((line) => {
      const f = FENCE.exec(line);
      if (fence) {
        // A closing fence: the same character, at least as long, nothing after.
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length && f[2].trim() === "") fence = null;
        return "";
      }
      // A backtick fence's info string may not contain a backtick; ```a`b is text.
      if (f && !(f[1][0] === "`" && f[2].includes("`"))) {
        fence = f[1];
        return "";
      }
      return withoutCodeSpans(line);
    })
    .join("\n");
}

/**
 * `line` with each code span replaced by spaces of the same length, so text
 * either side of it cannot join into a link. A span opens on a run of
 * backticks and closes on the next run of exactly that length; a run with no
 * partner is literal. `\`` is a literal backtick and opens nothing, but inside
 * a span a backslash is just a backslash.
 */
function withoutCodeSpans(line) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] === "\\") {
      out += line.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (line[i] !== "`") {
      out += line[i++];
      continue;
    }
    let run = 1;
    while (line[i + run] === "`") run++;
    const close = closingRun(line, i + run, run);
    if (close === -1) {
      out += line.slice(i, i + run);
      i += run;
    } else {
      out += " ".repeat(close + run - i);
      i = close + run;
    }
  }
  return out;
}

/** Where the next run of exactly `length` backticks starts at or after `from`, or -1. */
function closingRun(line, from, length) {
  const runs = /`+/g;
  runs.lastIndex = from;
  for (let m = runs.exec(line); m; m = runs.exec(line)) {
    if (m[0].length === length) return m.index;
  }
  return -1;
}

/** Every link target in `source` outside code, inline and reference-style, in order. */
function linkTargets(source) {
  const text = withoutCode(source);
  return [...text.matchAll(LINK), ...text.matchAll(DEFINITION)]
    .sort((a, b) => a.index - b.index)
    .map((m) => m[1]);
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
 * A function from a directory to the set of its entries' names, NFC
 * normalised, or to the error that listing it threw. Each directory is
 * listed once.
 */
function lister(readdir) {
  const listings = new Map();
  return (dir) => {
    if (!listings.has(dir)) {
      try {
        listings.set(dir, new Set(readdir(dir).map((name) => name.normalize("NFC"))));
      } catch (e) {
        listings.set(dir, e);
      }
    }
    return listings.get(dir);
  };
}

/**
 * Why `target`, which exists, would still be broken on GitHub, or null.
 * Windows and macOS file systems ignore case and Linux CI and GitHub do not,
 * so `existsSync` alone passes `Docs/Guide.md` locally that fails everywhere
 * else. Each segment below `root` is therefore looked up in its directory's
 * listing. Both sides are NFC normalised: macOS may hand back a decomposed
 * `é` for a composed one, which is not a case error. Outside `root` only
 * existence is checked.
 */
function caseProblem(root, target, list) {
  const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;

  let dir = root;
  for (const segment of rel.split(sep).filter(Boolean)) {
    const names = list(dir);
    if (names instanceof Error) return `unreadable: ${names.code ?? names.message}`;
    if (!names.has(segment.normalize("NFC"))) return "case differs from the file on disk";
    dir = join(dir, segment);
  }
  return null;
}

/**
 * `file -> target` for every relative link in `files` that does not resolve,
 * and `file (unreadable: CODE)` for a file that cannot be read. `readdir` is
 * there for a test to stand in for a file system it cannot build.
 */
export function brokenLinks(root, files, { readdir = readdirSync } = {}) {
  const broken = [];
  const list = lister(readdir);
  for (const file of files) {
    const absolute = join(root, file);
    let source;
    try {
      source = readFileSync(absolute, "utf8");
    } catch (e) {
      broken.push(`${file} (unreadable: ${e.code ?? e.message})`);
      continue;
    }

    for (const link of linkTargets(source)) {
      const path = pathPart(link);
      if (path === null) continue;

      // GitHub resolves `/docs/x.md` from the repository root, not the disk's.
      const target = path.startsWith("/") ? join(root, path) : resolve(dirname(absolute), path);
      if (!existsSync(target)) {
        broken.push(`${file} -> ${link}`);
        continue;
      }
      const problem = caseProblem(root, target, list);
      if (problem) {
        broken.push(`${file} -> ${link} (${problem})`);
      } else if (path.endsWith("/") && !statSync(target).isDirectory()) {
        broken.push(`${file} -> ${link} (not a directory)`);
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
