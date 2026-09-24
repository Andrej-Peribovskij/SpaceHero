// Set a new project up: ask what it has to decide, then do it.
//
// This replaces `pnpm run rename <PascalName>` as the front door. Rename was
// manual, name-only, and something a newcomer had to know existed; this runs
// itself from `prepare` on the first install and asks for everything a new
// project actually has to decide.
//
// Usage:
//   node scripts/init.mjs                      interactive
//   node scripts/init.mjs --auto               the `prepare` path: see BAILING OUT
//   node scripts/init.mjs --name AcmeShop --design-system uds --engine podman \
//                         --remotes detach --yes            headless
//
// Every answer has a flag, so an agent can drive it without a terminal.
//
// BAILING OUT, which is the part most worth scrutiny. A silent block on standard
// input is the worst failure available in a repository whose audience is agents,
// and `prepare` runs on every install — including in CI, where `pr-checks.yml`
// installs *without* `--ignore-scripts` and this genuinely executes. So `--auto`
// returns immediately, printing one line, whenever any of four things is true:
// already initialised, CI is set, standard input is not a terminal, or
// SCAFFOLD_SKIP_INIT=1. `apps/web/Dockerfile` already installs with
// `--ignore-scripts`, so image builds were never exposed; the CI guard is the
// load-bearing one.
//
// Zero dependencies, like every other script here: prompts are Node's own
// `readline/promises`.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { checkRegistryCredential, failureMessage, userNpmrcPath } from "./lib/registry-token.mjs";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The template's own origin. A clone of it is somebody improving the template. */
const TEMPLATE_REMOTE = /[:/]PTV-Mobility\/scaffolding(\.git)?$/i;

/** The name the template ships with. Rename replaces it, so it is the "not yet run" marker. */
const TEMPLATE_PACKAGE_NAME = "my-app";

/**
 * The design systems this organisation publishes, and the floor each one pins at.
 *
 * A floor, not a pin: `^` is what lets `pnpm outdated` answer "is there a newer
 * one" rather than "is this file stale". Bump these when a new major lands.
 */
export const DESIGN_SYSTEMS = {
  uds: { package: "@ptv-mobility/design-system-uds", range: "^0.6.1", label: "UDS — the Umovity design system" },
  base: { package: "@ptv-mobility/design-system-base", range: "^0.1.1", label: "base — minimal primitives, no visual language" },
};

/**
 * Said out loud when the answer is not the default.
 *
 * The two design systems export the same component names and do not agree on
 * their props — uds’ Button takes primary/secondary/tertiary, base’s takes
 * default/outline/ghost/destructive. Switching is one line here and a rewrite
 * of every call site later, so the one moment to say so is before there are any
 * call sites. docs/tech-debt/design-systems-share-no-component-api.md.
 */
const SWITCH_WARNING = [
  "",
  "  Note: the design systems share component names and not their props.",
  "  Choosing one now is free; changing your mind after you have screens is a",
  "  rewrite of every call site. docs/tech-debt/design-systems-share-no-component-api.md",
  "",
].join("\n");

// ── pure helpers (this is what scripts/init.test.mjs covers) ────────────────

/**
 * Parses argv into flags.
 *
 * Filters a literal `"--"` out first: pnpm forwards the separator rather than
 * consuming it, so `pnpm run init -- --name X` reaches us as `["--", "--name",
 * "X"]`. That is the same behaviour that made `db:refresh` lose its `-v`.
 */
export function parseArgs(argv) {
  const args = argv.filter((a) => a !== "--");
  const out = { auto: false, yes: false, force: false };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    switch (a) {
      case "--auto": out.auto = true; break;
      case "--yes": case "-y": out.yes = true; break;
      case "--force": out.force = true; break;
      case "--name": out.name = next(); break;
      case "--design-system": out.designSystem = next(); break;
      case "--engine": out.engine = next(); break;
      case "--remotes": out.remotes = next(); break;
      case "--help": case "-h": out.help = true; break;
      default:
        if (a.startsWith("--")) out.unknown = a;
        else if (!out.name) out.name = a;
    }
  }
  return out;
}

/** `AcmeShop` -> `acme-shop`. The two tokens the rebrand rewrites. */
export function kebabFromPascal(pascal) {
  return pascal.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function isValidPascalName(name) {
  return typeof name === "string" && /^[A-Z][A-Za-z0-9]+$/.test(name);
}

/**
 * Why `--auto` should return without asking anything — or null to carry on.
 *
 * Four conditions, each one a way a prompt could hang something that cannot
 * answer it. Order matters only for the message.
 */
export function skipReason({ initialised, env = {}, isTTY = true }) {
  if (initialised) return "already-initialised";
  if (env.SCAFFOLD_SKIP_INIT === "1") return "opted-out";
  if (env.CI) return "ci";
  if (!isTTY) return "not-a-terminal";
  return null;
}

/** Whether the rebrand has already run, read off the root manifest. */
export function isInitialised(packageJsonText) {
  try {
    return JSON.parse(packageJsonText).name !== TEMPLATE_PACKAGE_NAME;
  } catch {
    return false;
  }
}

/** A clone of the template itself asks nothing: question 0, answered by `origin`. */
export function isTemplateCheckout(originUrl) {
  return typeof originUrl === "string" && TEMPLATE_REMOTE.test(originUrl.trim());
}

/** The dependency line question 2 writes, as `apps/web/package.json` spells it. */
export function designSystemSpec(choice) {
  const ds = DESIGN_SYSTEMS[choice];
  if (!ds) return null;
  return `npm:${ds.package}@${ds.range}`;
}

// ── the effects ─────────────────────────────────────────────────────────────

function git(args, { cwd = repoRoot } = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? (r.stdout ?? "").trim() : null;
}

function readIfExists(path, encoding = "utf8") {
  return existsSync(path) ? readFileSync(path, encoding) : null;
}

function applyRename(pascal) {
  const r = spawnSync(process.execPath, [join(repoRoot, "scripts", "rename.mjs"), pascal], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error(`rename failed with exit code ${r.status}`);
}

function applyDesignSystem(choice, pascal) {
  const spec = designSystemSpec(choice);
  if (!spec) return null;
  const manifestPath = join(repoRoot, "apps", "web", "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const alias = `@${kebabFromPascal(pascal)}/design-system`;
  const current = Object.keys(manifest.dependencies).find((k) => k.endsWith("/design-system"));
  if (!current) throw new Error("apps/web has no design-system dependency to point somewhere");
  delete manifest.dependencies[current];
  manifest.dependencies[alias] = spec;
  // Keep the dependency block in the order the file already used.
  manifest.dependencies = Object.fromEntries(
    Object.entries(manifest.dependencies).sort(([a], [b]) => (a === alias ? -1 : b === alias ? 1 : 0)),
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // pnpm-workspace.yaml is deliberately not touched. Its
  // `minimumReleaseAgeExclude` lists every design system this organisation
  // publishes, by name, so switching between them needs no edit — and, more to
  // the point, cannot leave the lockfile naming a package the policy no longer
  // excludes, which pnpm rejects before it resolves anything.
  return spec;
}

function applyEngine(engine) {
  if (!engine || engine === "podman") return null;
  const command = engine === "docker" ? "docker compose" : engine;
  const envPath = join(repoRoot, ".env");
  const existing = readIfExists(envPath) ?? "";
  if (/^COMPOSE_COMMAND=/m.test(existing)) return command;
  const text = `${existing.trimEnd()}\n\n# The container engine for the local stacks. Podman is the standard\n# (docs/adr/ADR-0002-podman-is-the-container-engine.md); this is the one\n# override, and scripts/lib/engine.mjs reads it from here or from the\n# environment, the environment winning.\nCOMPOSE_COMMAND=${command}\n`;
  writeFileSync(envPath, text.trimStart());
  return command;
}

function applyJwtSecret() {
  // Compose interpolates ${JWT_SECRET} from its own project directory, which is
  // the compose file's. A template that ships a known secret is a footgun, not
  // a choice, so there is no question here — just a random one, written where
  // Compose will actually read it.
  const envPath = join(repoRoot, "infra", "compose", ".env");
  const existing = readIfExists(envPath) ?? "";
  if (/^JWT_SECRET=/m.test(existing)) return false;
  const secret = randomBytes(48).toString("base64url");
  const text = `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}# Generated by scripts/init.mjs. Local development only; not a production secret.\nJWT_SECRET=${secret}\n`;
  writeFileSync(envPath, text);
  return true;
}

function applyRemotes(mode) {
  if (mode !== "detach") return null;
  const origin = git(["remote", "get-url", "origin"]);
  if (!origin) return null;
  if (git(["remote", "get-url", "upstream"])) return "upstream-exists";
  git(["remote", "rename", "origin", "upstream"]);
  return origin;
}

// ── the conversation ────────────────────────────────────────────────────────

const HELP = `Set a new project up.

  node scripts/init.mjs                          interactive
  node scripts/init.mjs --auto                   no-op unless a human is present
  node scripts/init.mjs --name AcmeShop --yes    headless

Flags
  --name <PascalName>       the project name, e.g. AcmeShop
  --design-system <id>      ${Object.keys(DESIGN_SYSTEMS).join(" | ")} | keep   (default: uds)
  --engine <name>           podman | docker | "<command>"        (default: podman)
  --remotes <mode>          detach | keep                        (default: detach)
  --yes                     take every default without asking
  --force                   run even though this project looks initialised
  --auto                    the prepare path: return quietly when nobody can answer
`;

async function ask(rl, question, fallback) {
  const answer = (await rl.question(`${question} `)).trim();
  return answer || fallback;
}

async function main(argv) {
  const flags = parseArgs(argv);
  if (flags.help) {
    stdout.write(HELP);
    return 0;
  }
  if (flags.unknown) {
    stdout.write(`Unknown flag ${flags.unknown}.\n\n${HELP}`);
    return 2;
  }

  const packageJsonText = readIfExists(join(repoRoot, "package.json")) ?? "";
  const initialised = isInitialised(packageJsonText) && !flags.force;

  if (flags.auto) {
    const reason = skipReason({ initialised, env: process.env, isTTY: Boolean(stdin.isTTY) });
    if (reason) {
      if (reason !== "already-initialised") {
        stdout.write("Not initialised yet — run `pnpm run init` when you are at a terminal.\n");
      }
      return 0;
    }
  } else if (initialised) {
    stdout.write(
      "This project has already been initialised (package.json is no longer named\n" +
        `"${TEMPLATE_PACKAGE_NAME}"). Re-run with --force if that is wrong.\n`,
    );
    return 0;
  }

  // Question 0, answered by the remote rather than by a person.
  const origin = git(["remote", "get-url", "origin"]);
  if (isTemplateCheckout(origin) && !flags.force) {
    stdout.write(
      "origin is PTV-Mobility/scaffolding, so this is the template itself rather than\n" +
        "a project made from it. Nothing to initialise. (--force overrides.)\n",
    );
    return 0;
  }

  // The precondition. Checked before anything is written, because a run that
  // rebrands the repository and then cannot install has left a mess behind.
  // The same check .pnpmfile.cjs runs (scripts/lib/registry-token.mjs), minus its
  // skip variable: that one lets an install through, and this is about to rebrand.
  const userPath = userNpmrcPath(process.env);
  const token = checkRegistryCredential({
    env: process.env,
    userPath,
    userNpmrc: readIfExists(userPath, null),
    honourSkip: false,
  });
  if (token.verdict !== "ok") {
    const heading = "Cannot install yet: no usable registry credential.";
    stdout.write(`${failureMessage(token, process.env, { heading, skipHint: false })}\n`);
    return 1;
  }

  const rl = flags.yes ? null : createInterface({ input: stdin, output: stdout });
  try {
    // 1. Name.
    let name = flags.name;
    while (!isValidPascalName(name)) {
      if (!rl) {
        stdout.write("--name is required with --yes, and must be PascalCase (e.g. AcmeShop).\n");
        return 2;
      }
      if (name !== undefined) stdout.write("  PascalCase, letters and digits only — e.g. AcmeShop.\n");
      name = await ask(rl, "Project name (PascalCase, e.g. AcmeShop):", undefined);
    }

    // 2. Design system — a dependency line, not a deletion.
    const dsChoices = [...Object.keys(DESIGN_SYSTEMS), "keep"];
    let designSystem = flags.designSystem ?? (rl ? null : "uds");
    while (designSystem === null || !dsChoices.includes(designSystem)) {
      if (!rl) {
        stdout.write(`--design-system must be one of ${dsChoices.join(", ")}.\n`);
        return 2;
      }
      if (designSystem !== null) stdout.write(`  One of ${dsChoices.join(", ")}.\n`);
      for (const [id, ds] of Object.entries(DESIGN_SYSTEMS)) stdout.write(`  ${id.padEnd(6)} ${ds.label}\n`);
      stdout.write("  keep   leave apps/web pointing where it already points\n");
      stdout.write(SWITCH_WARNING);
      designSystem = await ask(rl, "Design system [uds]:", "uds");
    }

    // 3. Container engine.
    let engine = flags.engine ?? (rl ? await ask(rl, "Container engine [podman]:", "podman") : "podman");

    // 4. Git remotes.
    const remoteChoices = ["detach", "keep"];
    let remotes = flags.remotes ?? (rl ? await ask(rl, "Git remotes — detach from the template, or keep? [detach]:", "detach") : "detach");
    if (!remoteChoices.includes(remotes)) {
      stdout.write(`--remotes must be one of ${remoteChoices.join(", ")}.\n`);
      return 2;
    }

    // ── apply ──
    const done = [];
    applyRename(name);
    done.push(`renamed MyApp/my-app to ${name}/${kebabFromPascal(name)}`);

    if (designSystem !== "keep") {
      const spec = applyDesignSystem(designSystem, name);
      done.push(`apps/web depends on "${spec}"`);
    }

    const command = applyEngine(engine);
    done.push(command ? `COMPOSE_COMMAND=${command} recorded in .env` : "container engine: podman (the default)");

    done.push(applyJwtSecret() ? "wrote a random JWT_SECRET to infra/compose/.env" : "infra/compose/.env already has a JWT_SECRET");

    const detached = applyRemotes(remotes);
    if (detached === "upstream-exists") done.push("remotes: upstream already existed, left alone");
    else if (detached) done.push(`remotes: origin renamed to upstream (${detached}); set your own origin`);
    else done.push("remotes: left as they are");

    stdout.write(`\n${name} is set up.\n`);
    for (const line of done) stdout.write(`  - ${line}\n`);
    stdout.write("\nNext:\n  pnpm install        # refresh the lockfile\n  pnpm run verify     # build + lint + test + the OpenAPI snapshot\n");
    if (detached && detached !== "upstream-exists") {
      stdout.write(`  git remote add origin <your repository>\n`);
    }
    return 0;
  } finally {
    rl?.close();
  }
}

// Only run when invoked directly, so the test file can import the helpers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
