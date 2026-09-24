// Which parts of the repository a pull request touched.
//
// `pr-checks.yml` is one long job: .NET, pnpm, a PostgreSQL service, two
// compose-backed suites and a browser. All of it is the right gate for a code
// change and none of it is the right gate for a paragraph. This classifies the
// changed paths so the workflow can decide, and it errs towards running
// everything: an unrecognised path counts as code.
//
// Usage:
//   node scripts/ci-changed.mjs <base-ref>       # e.g. origin/main
//
// Prints the flags, and appends them to $GITHUB_OUTPUT when that is set.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Paths that cannot affect a build, a test or an image.
 *
 * Everything else is code, including `.github/` (a workflow change should run
 * the workflow it changed) and every manifest. `process/design/scripts/` is
 * deliberately absent: those files have tests, and the tests are part of the
 * gate.
 */
const DOCS_ONLY = [
  /^docs\/(?!.*\.mjs$)/,
  /^openspec\//,
  /^process\/design\/(?!scripts\/)/,
  /^design-commands\//,
  /^[^/]+\.md$/,
  /^\.github\/(ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)/,
];

/** Classifies one path. */
export function isDocsOnlyPath(path) {
  return DOCS_ONLY.some((re) => re.test(path));
}

/**
 * Flags for a set of changed paths.
 *
 * `code` is what gates the expensive job. An empty change set counts as code:
 * a run that proves nothing should look like a run, not like a pass.
 */
export function classify(paths) {
  const files = paths.filter(Boolean);
  const docs = files.filter(isDocsOnlyPath);
  return {
    code: files.length === 0 || docs.length !== files.length,
    docs: docs.length > 0,
  };
}

export function changedFiles(baseRef, run = spawnSync) {
  const merge = run("git", ["merge-base", "HEAD", baseRef], { encoding: "utf8" });
  const from = merge.status === 0 ? merge.stdout.trim() : baseRef;
  const diff = run("git", ["diff", "--name-only", `${from}...HEAD`], { encoding: "utf8" });
  if (diff.status !== 0) return null; // shallow clone, unknown ref: caller runs everything
  return diff.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}

// Only run when invoked directly, so the test file can import the classifier.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const baseRef = process.argv[2] ?? "origin/main";
  const files = changedFiles(baseRef);
  const flags = files === null ? { code: true, docs: true } : classify(files);

  if (files === null) {
    console.log(`Could not diff against ${baseRef}; running everything.`);
  } else {
    console.log(`${files.length} changed file(s) against ${baseRef}:`);
    for (const f of files.slice(0, 50)) console.log(`  ${isDocsOnlyPath(f) ? "docs" : "code"}  ${f}`);
    if (files.length > 50) console.log(`  … and ${files.length - 50} more`);
  }
  console.log(`code=${flags.code} docs=${flags.docs}`);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `code=${flags.code}\ndocs=${flags.docs}\n`);
  }
}
