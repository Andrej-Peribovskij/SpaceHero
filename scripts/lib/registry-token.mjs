// IS THERE A CREDENTIAL FOR GITHUB PACKAGES, AND IF NOT, WHAT EXACTLY IS WRONG.
//
// The design system is published to GitHub Packages, which authenticates READS as well as
// writes. Without a token `pnpm install` fails with ERR_PNPM_FETCH_401 against a package whose
// name gives no hint that a credential is the problem. Two callers ask:
//
//   - scripts/check-registry-token.mjs, run by .pnpmfile.cjs's `preResolution` hook, so an
//     install stops before fetching and says which line is missing or wrong;
//   - scripts/init.mjs, which checks before it rebrands anything, because a run that rewrites
//     the repository and then cannot install has left a mess behind.
//
// It is a FILE check, not an environment-variable check. pnpm 11 ignores an auth setting that
// comes from a committed project .npmrc and expands no variable in one, so NODE_AUTH_TOKEN alone
// buys nothing — the line has to be in a user-level file, and if that line defers to a
// variable, the variable has to be set as well.
//
// Beyond "no line", it names the failures that look fixed to the person who made them:
//
//   - a GLUED line. A ~/.npmrc that does not end in a newline, appended to with `>>` or
//     `Add-Content`, puts the token on the END of the last line — usually a comment — where
//     npm reads it as part of that comment. The file visibly contains the token and the
//     install still 401s.
//   - a COMMENTED-OUT line, an EMPTY value, and a `${VAR}` whose variable is not set.
//   - a UTF-16 file, which is what `>>` writes in Windows PowerShell 5.1 and which npm cannot
//     read at all.
//
// PURE: every function takes the file content and the environment as arguments, so the tests
// reach every state without touching the real ~/.npmrc. NOTHING HERE RETURNS OR FORMATS A
// TOKEN VALUE — only states, paths, line numbers and variable names. That is tested.
import { homedir } from "node:os";
import { join } from "node:path";

export const REGISTRY_HOST = "npm.pkg.github.com";
export const AUTH_KEY = `//${REGISTRY_HOST}/:_authToken=`;
export const SKIP_ENV = "SCAFFOLD_SKIP_TOKEN_CHECK";

const HOST_AUTH_FRAGMENT = `${REGISTRY_HOST}/:_authToken`;
const COMMENTED = /^[#;]\s*\/\/npm\.pkg\.github\.com\/:_authToken/;
// A literal credential some tool wrote into the checkout's own .npmrc: a token, basic auth, or a
// combined `_auth`. Never a `${VAR}` — that is exactly the shape pnpm refuses there.
const INJECTED = /^\/\/npm\.pkg\.github\.com\/:(_authToken|_auth|_password)\s*=\s*(?!\$\{)\S/;

/**
 * Decode a .npmrc read as bytes. UTF-16 is reported rather than decoded: npm reads the file as
 * UTF-8, so a UTF-16 file is one npm cannot use, however right it looks in an editor.
 *
 * @param {Buffer | string | null | undefined} raw
 * @returns {{text: string | null, utf16: boolean}}
 */
export function decodeNpmrc(raw) {
  if (raw === null || raw === undefined) return { text: null, utf16: false };
  if (typeof raw === "string") return { text: raw, utf16: false };
  const bom16 = raw.length >= 2 && ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff));
  const nulHeavy = raw.length >= 4 && raw.subarray(0, 64).filter((b) => b === 0).length >= 2;
  if (bom16 || nulHeavy) return { text: null, utf16: true };
  return { text: raw.toString("utf8"), utf16: false };
}

/**
 * The state of the GitHub Packages credential in one .npmrc's text.
 *
 * @param {string | null} npmrcText null when the file does not exist
 * @param {Record<string, string | undefined>} env
 * @returns {{state: "ok" | "missing-file" | "missing-line" | "empty-token" | "missing-token" | "glued" | "commented", line?: number, variable?: string}}
 *   `line` is 1-based and points at the offending line; `variable` is the NAME a `${VAR}`
 *   value defers to. Neither ever carries the token.
 */
export function registryTokenState(npmrcText, env = {}) {
  if (typeof npmrcText !== "string") return { state: "missing-file" };

  const lines = npmrcText.replace(/^\uFEFF/, "").split(/\r?\n/);
  let glued = null;
  let commented = null;
  let emptyAt = null;
  let deferred = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(AUTH_KEY)) {
      const value = trimmed.slice(AUTH_KEY.length).trim();
      const variable = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value);
      if (variable) {
        if (env[variable[1]]) return { state: "ok", line: i + 1 };
        deferred ??= { line: i + 1, variable: variable[1] };
        continue;
      }
      if (value) return { state: "ok", line: i + 1 };
      emptyAt ??= i + 1;
      continue;
    }
    if (COMMENTED.test(trimmed)) {
      commented ??= i + 1;
      continue;
    }
    if (trimmed.includes(HOST_AUTH_FRAGMENT)) glued ??= i + 1;
  }

  // Most specific first: a glued line is the one failure that looks fixed to the person who
  // made it, so it outranks everything else in the file.
  if (glued !== null) return { state: "glued", line: glued };
  if (deferred !== null) return { state: "missing-token", ...deferred };
  if (emptyAt !== null) return { state: "empty-token", line: emptyAt };
  if (commented !== null) return { state: "commented", line: commented };
  return { state: "missing-line" };
}

/**
 * Whether the checkout's own .npmrc carries a literal credential for the host. The committed
 * file never does — it holds only routing — so this is true only when a tool has written one
 * into the working copy for the length of a job. Dependabot's updater is the one to expect: it
 * installs with --ignore-scripts, which kept it clear of the old `preinstall` check but does not
 * keep it clear of a pnpmfile hook, and it brings its registry credential its own way. The check
 * passes rather than second-guess that: if pnpm does not use the credential, pnpm's own 401
 * follows, which is no worse than before, whereas refusing would stop an install this cannot
 * judge.
 *
 * @param {string | null} projectNpmrcText
 * @returns {boolean}
 */
export function projectHasInjectedAuth(projectNpmrcText) {
  if (typeof projectNpmrcText !== "string") return false;
  return projectNpmrcText.split(/\r?\n/).some((line) => INJECTED.test(line.trim()));
}

/**
 * Where npm and pnpm read the user-level file from. CI's actions/setup-node points
 * NPM_CONFIG_USERCONFIG at the file it writes.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} [home]
 */
export function userNpmrcPath(env = {}, home = homedir()) {
  return env.npm_config_userconfig || env.NPM_CONFIG_USERCONFIG || join(home, ".npmrc");
}

/**
 * The whole decision, given what was read.
 *
 * @param {object} input
 * @param {Record<string, string | undefined>} input.env
 * @param {string | null} [input.projectNpmrc] text of the checkout's own .npmrc
 * @param {string} input.userPath
 * @param {Buffer | string | null} input.userNpmrc raw content of `userPath`, or null
 * @param {boolean} [input.honourSkip] false for a caller the skip variable is not about
 * @returns {{verdict: "skip" | "ok" | "fail", state?: string, line?: number, variable?: string, userPath: string}}
 */
export function checkRegistryCredential({ env, projectNpmrc = null, userPath, userNpmrc, honourSkip = true }) {
  if (honourSkip && env[SKIP_ENV] === "1") return { verdict: "skip", userPath };
  if (projectHasInjectedAuth(projectNpmrc)) return { verdict: "ok", state: "project-auth", userPath };
  const { text, utf16 } = decodeNpmrc(userNpmrc);
  if (utf16) return { verdict: "fail", state: "utf16", userPath };
  const result = registryTokenState(text, env);
  return { verdict: result.state === "ok" ? "ok" : "fail", ...result, userPath };
}

/**
 * What a failed check prints. Names the file, the line NUMBER and the variable NAME — never a
 * line's content, because the line in question is the one holding the token.
 *
 * @param {{state?: string, line?: number, variable?: string, userPath: string}} result
 * @param {Record<string, string | undefined>} env
 * @param {{heading?: string, skipHint?: boolean}} [options]
 * @returns {string}
 */
export function failureMessage(result, env = {}, options = {}) {
  const { state, line, variable, userPath } = result;
  const { heading = "This install needs a GitHub Packages credential and cannot find a usable one.", skipHint = true } =
    options;
  const out = [
    "",
    heading,
    "",
    "  apps/web depends on the design system, which is published to GitHub",
    "  Packages. GitHub Packages authenticates reads as well as writes, so every",
    "  install needs a token — yours, CI's and the image build's alike.",
    "",
  ];

  switch (state) {
    case "glued":
      out.push(
        `  ${userPath}, line ${line}: the token is glued to the end of another line.`,
        "",
        "  The line mentions npm.pkg.github.com/:_authToken but does not START with //,",
        "  so npm reads it as part of whatever came before it — usually a comment. This",
        "  is what appending to a file that did not end with a newline does. Open the",
        "  file, put the //npm.pkg.github.com/:_authToken=... line on a line of its own,",
        "  and make sure the file ends with a newline.",
      );
      break;
    case "missing-token":
      out.push(
        `  ${userPath}, line ${line}, defers to \${${variable}}, and ${variable} is not`,
        "  set in this shell. Set it to a personal access token with `read:packages`.",
      );
      break;
    case "empty-token":
      out.push(`  ${userPath}, line ${line}: the _authToken line for npm.pkg.github.com has no value.`);
      break;
    case "commented":
      out.push(`  ${userPath}, line ${line}: the _authToken line for npm.pkg.github.com is commented out.`);
      break;
    case "utf16":
      out.push(
        `  ${userPath} is saved as UTF-16, which npm cannot read. Windows PowerShell 5.1's`,
        "  `>>` writes UTF-16. Re-save the file as UTF-8 (no BOM).",
      );
      break;
    default:
      out.push(
        state === "missing-file" ? `  ${userPath} does not exist.` : `  ${userPath} has no line for npm.pkg.github.com.`,
        "",
        "  Add this line to it, on a line of its own — if the file already exists, check",
        "  it ends with a newline first, or the line lands on the end of the last one:",
        "",
        `    ${AUTH_KEY}\${NODE_AUTH_TOKEN}`,
        "",
        "  then set NODE_AUTH_TOKEN to a personal access token with `read:packages`.",
        "",
        "  It has to be that file. The repository's own .npmrc carries only the",
        "  scope-to-registry routing: pnpm ignores an auth setting in a committed",
        "  project .npmrc, because a ${VARIABLE} there could be pointed at an",
        "  attacker-controlled registry.",
      );
      if (env.NODE_AUTH_TOKEN) {
        out.push(
          "",
          "  NODE_AUTH_TOKEN is set, but nothing reads it on its own: only the line above",
          "  in a user-level file does.",
        );
      }
  }

  out.push("", "  Full detail, including CI and image builds: docs/design-system.md");
  if (skipHint) out.push(`  Working on something unrelated? ${SKIP_ENV}=1 skips this.`);
  out.push("");
  return out.join("\n");
}
