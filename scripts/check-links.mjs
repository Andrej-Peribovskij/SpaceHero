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
// Locally they need not: an untracked scratch note with a dead link fails the
// run, and so does a link to a file deleted but not yet committed. Ignore the
// note, or finish the change, and the verdict matches what will be pushed.
//
// The verdict is GitHub's, wherever it runs: link syntax inside code is an
// example, not a link; reference definitions (`[label]: path.md`) are links;
// and a link whose case differs from the file is broken on Windows and macOS
// too, as it is on Linux CI.
//
// Deliberately relative links only: an HTTP checker needs the network, turns a
// third party's outage into a red build, and is the kind of check people learn
// to ignore.
//
// Usage:  node scripts/check-links.mjs
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLinks } from "./lib/links.mjs";

// exitCode, not exit(): exit() can cut off output still queued for a pipe.
process.exitCode = checkLinks(join(dirname(fileURLToPath(import.meta.url)), ".."));
