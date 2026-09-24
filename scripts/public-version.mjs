// Which version real users see, and the one command that moves it.
//
// `PUBLIC_UI_VERSION` is read fresh per request by `GET /api/v1/public-config`, so moving it is
// an environment change and an API restart — never a frontend rebuild. That property is the
// architecture and this script does not touch it.
//
// What it removes is the hand-editing. This repository declares the value in two committed
// places, in two different syntaxes:
//
//   services/api/src/Host/appsettings.Development.json   "Public": { "UiVersion": … }
//   infra/compose/compose.yml                            PUBLIC_UI_VERSION: ${PUBLIC_UI_VERSION:-…}
//
// The first is what `pnpm run dev` serves, what `pnpm run test:e2e` serves (its API runs with
// ASPNETCORE_ENVIRONMENT=Development), and what `pnpm run design:preview` reads to answer a
// designer. The second is the default the container path falls back to when the environment does
// not override it. Before this script, promoting a version meant finding both by hand, and prompt
// 06 did not even name them — so the usual outcome was one of them moving and the other not,
// which shows up as `pnpm run dev` and `pnpm run stack:up` serving different applications.
//
// WHAT THIS SCRIPT CANNOT DO, deliberately: it cannot change a deployment. A real environment's
// `PUBLIC_UI_VERSION` lives outside this repository, and the flat variable outranks both lines
// above wherever it is set. `set` prints the line to apply there; applying it is somebody's
// decision, on purpose.
//
// It is also not the promotion. Prompt 06 is: eligibility, a change report naming the links that
// break, a human confirming after reading it, and a browser check as a non-administrator. This
// script is that prompt's §4 and nothing else.
//
// Usage:
//   node scripts/public-version.mjs              what every declaration says now
//   node scripts/public-version.mjs set v2.0.0   write them all
//   node scripts/public-version.mjs check        fail if they disagree
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the registry lives, for the sanity check in `set`. */
const REGISTRY = "apps/web/src/versions/registry.tsx";

/**
 * A version id, as `VERSION_PREFIX` in `apps/web/src/versions/registry-core.ts` spells it.
 * A third copy of that shape would be a liability; this one is deliberately the *same* pattern,
 * and `set`'s registry check is what stops a well-shaped id that names nothing.
 */
const VERSION_ID = /^v\d+(?:\.\d+)*(?:-[A-Za-z0-9.]+)?$/;

/**
 * The two declarations, each with the surgical pattern that finds its value.
 *
 * Patterns rather than parsers, and that is a choice: `JSON.parse` plus `JSON.stringify` would
 * reformat the settings file, and a YAML round-trip would drop every comment in `compose.yml` —
 * including the four lines above `PUBLIC_UI_VERSION` that explain why it is runtime. A promotion
 * should change one value and leave the file otherwise byte-identical.
 *
 * Each pattern captures (prefix)(value)(suffix) so a replacement is mechanical. Each must match
 * exactly once: a pattern that silently matches nothing is how one of these two drifts.
 */
export const DECLARATIONS = [
  {
    file: "services/api/src/Host/appsettings.Development.json",
    names: "Public:UiVersion",
    serves: "pnpm run dev, pnpm run test:e2e, pnpm run design:preview",
    pattern: /("Public"\s*:\s*\{[^{}]*?"UiVersion"\s*:\s*")([^"]*)(")/,
  },
  {
    file: "infra/compose/compose.yml",
    names: "PUBLIC_UI_VERSION default",
    serves: "pnpm run stack:up",
    pattern: /(PUBLIC_UI_VERSION:\s*\$\{PUBLIC_UI_VERSION:-)([^}]*)(\})/,
  },
];

/** Whether a string is shaped like a version id at all. */
export function isVersionShaped(id) {
  return VERSION_ID.test(id);
}

/**
 * Whether an id is a `-tech` revision.
 *
 * Prompt 03 creates these with `kind: "design"`, and rule 1 of prompt 06 is that a design version
 * is never eligible to be public. The suffix is not proof of the kind — the registry is — but it
 * is the one case cheap enough to refuse here rather than three steps later.
 */
export function isTechRevision(id) {
  return /-tech(?:\.|$)/.test(id);
}

/** Reads the declared value out of one file's text, or null when the pattern does not match. */
export function readDeclared(text, pattern) {
  const match = pattern.exec(text);

  return match ? match[2] : null;
}

/**
 * Returns the text with the declared value replaced.
 *
 * Throws when the pattern matches no times or more than once. Both are the same failure from the
 * caller's side — the file is not shaped the way this script believes — and writing a file after
 * changing nothing in it is worse than stopping.
 */
export function replaceDeclared(text, pattern, version) {
  const global = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
  const count = [...text.matchAll(global)].length;

  if (count !== 1) {
    throw new Error(`expected exactly one declaration to replace, found ${count}`);
  }

  return text.replace(pattern, (_whole, prefix, _old, suffix) => `${prefix}${version}${suffix}`);
}

/** Whether `registry.tsx` contains an entry with this id. */
export function registryMentions(registryText, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`id\\s*:\\s*"${escaped}"`).test(registryText);
}

/** Reads every declaration. Pure over an injected reader, so the tests need no real files. */
export function collect(read) {
  return DECLARATIONS.map((declaration) => ({
    ...declaration,
    value: readDeclared(read(declaration.file), declaration.pattern),
  }));
}

/**
 * What is wrong with the declarations as they stand: an array of sentences, empty when they agree
 * on one well-shaped version.
 */
export function problems(declared) {
  const missing = declared.filter((entry) => entry.value === null);
  if (missing.length > 0) {
    return missing.map((entry) => `${entry.file} has no ${entry.names} this script can find.`);
  }

  const values = [...new Set(declared.map((entry) => entry.value))];
  if (values.length > 1) {
    return [
      `The declarations disagree: ${declared.map((e) => `${e.file} says "${e.value}"`).join(", ")}.`,
      "That means `pnpm run dev` and `pnpm run stack:up` serve different applications.",
      "Run `pnpm run public-version:set <version>` to settle it.",
    ];
  }

  if (!isVersionShaped(values[0])) {
    return [`"${values[0]}" is not shaped like a version id.`];
  }

  return [];
}

const readFile = (relative) => readFileSync(join(repoRoot, relative), "utf8");

function show() {
  const declared = collect(readFile);

  console.log("");
  console.log("  What this repository declares as the public UI version:");
  console.log("");
  for (const entry of declared) {
    console.log(`    ${(entry.value ?? "(not found)").padEnd(12)} ${entry.file}`);
    console.log(`    ${" ".repeat(12)} ${entry.names} — serves ${entry.serves}`);
  }
  console.log("");

  const found = problems(declared);
  if (found.length > 0) {
    for (const line of found) console.error(`  ${line}`);
    console.log("");
    return 1;
  }

  const version = declared[0].value;
  console.log(`  Agreed: ${version}.`);
  if (!registryMentions(readFile(REGISTRY), version)) {
    console.log(`  NOT in ${REGISTRY} — the app will fall back to the first prod version.`);
  }
  console.log("");
  console.log("  A deployment's own PUBLIC_UI_VERSION is not declared here and cannot be read");
  console.log("  from here. Where it is set, the flat variable outranks both lines above.");
  console.log("");

  return 0;
}

function check() {
  const found = problems(collect(readFile));
  if (found.length === 0) return 0;

  console.error("");
  console.error("  PUBLIC UI VERSION — the declarations do not agree");
  console.error("");
  for (const line of found) console.error(`  ${line}`);
  console.error("");

  return 1;
}

function set(version) {
  if (!version) {
    console.error("Usage: node scripts/public-version.mjs set <version>   e.g. set v2.0.0");
    return 2;
  }

  if (!isVersionShaped(version)) {
    console.error(`"${version}" is not shaped like a version id (v1, v2.0.0, v2.1.0-tech).`);
    return 2;
  }

  if (isTechRevision(version)) {
    console.error(
      `"${version}" is a -tech revision, which prompt 03 registers as kind: "design".\n` +
        "A design version is never public — prompt 06, rule 1. Promote the prod version it\n" +
        "became instead, or pass --force if this repository's registry says otherwise.",
    );
    if (!process.argv.includes("--force")) return 2;
  }

  if (!registryMentions(readFile(REGISTRY), version) && !process.argv.includes("--force")) {
    console.error(
      `No entry with id: "${version}" in ${REGISTRY}.\n\n` +
        "This check only looks for the id. It cannot tell a prod version from a design one, or\n" +
        "a wired version from a mocked one — that is prompt 06 §1, which is a human reading the\n" +
        "registry. What it does catch is a typo, which is the mistake that actually happens.\n\n" +
        "Pass --force if the entry exists and this check cannot see it.",
    );
    return 2;
  }

  const declared = collect(readFile);
  const changes = [];

  for (const entry of declared) {
    const text = readFile(entry.file);
    let next;

    try {
      next = replaceDeclared(text, entry.pattern, version);
    } catch (error) {
      console.error(`${entry.file}: ${error.message}`);
      console.error("Nothing was written. The file is not shaped the way this script expects.");
      return 1;
    }

    // Written only when it changes, so re-running `set` on the current version is a no-op rather
    // than a timestamp change that looks like an edit in a diff nobody asked for.
    if (next !== text) writeFileSync(join(repoRoot, entry.file), next);
    changes.push({ ...entry, from: entry.value, to: version, changed: next !== text });
  }

  const previous = [...new Set(changes.map((change) => change.from))];

  console.log("");
  for (const change of changes) {
    const arrow = change.changed ? `${change.from} -> ${change.to}` : `${change.to} (unchanged)`;
    console.log(`    ${change.file}`);
    console.log(`      ${arrow}`);
  }
  console.log("");
  console.log("  Restart the API for this to take effect. No frontend rebuild: the same bundle");
  console.log("  reads the new value from GET /api/v1/public-config at first paint.");
  console.log("");
  console.log("  Every deployment outside this repository is its own, deliberate edit:");
  console.log("");
  console.log(`      PUBLIC_UI_VERSION=${version}`);
  console.log("");
  if (previous.length === 1 && previous[0] !== version) {
    console.log("  Rollback, here and there:");
    console.log("");
    console.log(`      pnpm run public-version:set ${previous[0]}`);
    console.log(`      PUBLIC_UI_VERSION=${previous[0]}`);
    console.log("");
  }

  return 0;
}

function main(argv) {
  const [command, ...rest] = argv;

  if (command === undefined || command === "show") return show();
  if (command === "check") return check();
  if (command === "set") return set(rest.find((argument) => !argument.startsWith("--")));

  console.error(`Unknown command "${command}". Expected one of: show, set <version>, check.`);
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
