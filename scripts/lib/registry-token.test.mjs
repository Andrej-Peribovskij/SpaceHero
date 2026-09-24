/**
 * Tests for scripts/lib/registry-token.mjs, scripts/check-registry-token.mjs and the
 * .pnpmfile.cjs hook that runs it.
 *
 * Run with:  pnpm run test:scripts
 *
 * Every state is reached from text, never from the real ~/.npmrc. The subprocess tests point
 * NPM_CONFIG_USERCONFIG at a temporary file, which is the same seam CI's setup-node uses.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkRegistryCredential,
  decodeNpmrc,
  failureMessage,
  registryTokenState,
  SKIP_ENV,
  userNpmrcPath,
} from "./registry-token.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LINE = "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}";
const SECRET = "ghp_THISMUSTNEVERBEPRINTED0123456789";
const ROUTING = "@ptv-mobility:registry=https://npm.pkg.github.com\n";

describe("registryTokenState — a user-level file, not an environment variable", () => {
  it("reports no file, and a file that says nothing about the host, as missing", () => {
    assert.equal(registryTokenState(null).state, "missing-file");
    // The variable alone buys nothing: pnpm expands no variable in a committed project .npmrc,
    // and nothing reads NODE_AUTH_TOKEN without a line naming it.
    assert.equal(registryTokenState(ROUTING, { NODE_AUTH_TOKEN: "t" }).state, "missing-line");
  });

  it("is ok for a literal token, among other lines, with CRLF and a BOM", () => {
    assert.equal(registryTokenState(`//npm.pkg.github.com/:_authToken=${SECRET}\n`).state, "ok");
    assert.equal(
      registryTokenState(`\uFEFFregistry=https://registry.npmjs.org/\r\n  //npm.pkg.github.com/:_authToken=${SECRET}\r\nfoo=bar\r\n`)
        .state,
      "ok",
    );
  });

  it("is ok for a ${VAR} line only when the variable is set, and names the variable otherwise", () => {
    assert.equal(registryTokenState(`${LINE}\n`, { NODE_AUTH_TOKEN: "t" }).state, "ok");
    assert.deepEqual(registryTokenState(`${LINE}\n`, {}), { state: "missing-token", line: 1, variable: "NODE_AUTH_TOKEN" });
    assert.deepEqual(registryTokenState(`x=y\n//npm.pkg.github.com/:_authToken=\${GH_PAT}\n`, { NODE_AUTH_TOKEN: "t" }), {
      state: "missing-token",
      line: 2,
      variable: "GH_PAT",
    });
  });

  it("names an empty value and a commented-out line rather than reporting them as absent", () => {
    assert.deepEqual(registryTokenState("//npm.pkg.github.com/:_authToken=\n"), { state: "empty-token", line: 1 });
    assert.deepEqual(registryTokenState(`x=y\n# ${LINE}\n`, { NODE_AUTH_TOKEN: "t" }), { state: "commented", line: 2 });
    assert.equal(registryTokenState(`;${LINE}\n`, { NODE_AUTH_TOKEN: "t" }).state, "commented");
  });

  it("names a token glued to the end of a comment — a file with no trailing newline, then appended to", () => {
    const glued = `${ROUTING}# personal token below//npm.pkg.github.com/:_authToken=${SECRET}`;
    assert.deepEqual(registryTokenState(glued), { state: "glued", line: 2 });
    // Glued onto a setting rather than a comment is the same failure.
    assert.equal(registryTokenState(`always-auth=true//npm.pkg.github.com/:_authToken=${SECRET}\n`).state, "glued");
    // And a line missing the leading // entirely.
    assert.equal(registryTokenState(`npm.pkg.github.com/:_authToken=${SECRET}\n`).state, "glued");
  });

  it("lets a good line anywhere in the file win over a glued or commented one", () => {
    const text = `# old//npm.pkg.github.com/:_authToken=${SECRET}\n# ${LINE}\n//npm.pkg.github.com/:_authToken=${SECRET}\n`;
    assert.equal(registryTokenState(text).state, "ok");
  });
});

describe("decodeNpmrc", () => {
  it("reports a UTF-16 file — what Windows PowerShell 5.1's >> writes — instead of misreading it", () => {
    const withBom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${LINE}\n`, "utf16le")]);
    assert.equal(decodeNpmrc(withBom).utf16, true);
    assert.equal(decodeNpmrc(Buffer.from(`${LINE}\n`, "utf16le")).utf16, true);
    assert.deepEqual(decodeNpmrc(Buffer.from(`${LINE}\n`, "utf8")), { text: `${LINE}\n`, utf16: false });
    assert.deepEqual(decodeNpmrc(null), { text: null, utf16: false });
    const result = checkRegistryCredential({ env: { NODE_AUTH_TOKEN: "t" }, userPath: "u", userNpmrc: withBom });
    assert.equal(result.verdict, "fail");
    assert.equal(result.state, "utf16");
  });
});

describe("checkRegistryCredential", () => {
  const base = { userPath: "u", userNpmrc: null };

  it("skips only for exactly SCAFFOLD_SKIP_TOKEN_CHECK=1", () => {
    assert.equal(SKIP_ENV, "SCAFFOLD_SKIP_TOKEN_CHECK");
    assert.equal(checkRegistryCredential({ ...base, env: { [SKIP_ENV]: "1" } }).verdict, "skip");
    assert.equal(checkRegistryCredential({ ...base, env: { [SKIP_ENV]: "true" } }).verdict, "fail");
  });

  it("ignores the skip variable for a caller that opts out of it", () => {
    assert.equal(checkRegistryCredential({ ...base, env: { [SKIP_ENV]: "1" }, honourSkip: false }).verdict, "fail");
  });

  it("passes on a literal credential written into the checkout's .npmrc, without reading the user file", () => {
    const env = {};
    for (const line of [`//npm.pkg.github.com/:_authToken=${SECRET}`, "//npm.pkg.github.com/:_password=c2VjcmV0", "//npm.pkg.github.com/:_auth=eDp5"]) {
      assert.equal(checkRegistryCredential({ ...base, env, projectNpmrc: `${ROUTING}${line}\n` }).verdict, "ok", line);
    }
    // The committed file — routing only — and the ${VAR} shape pnpm refuses there are not credentials.
    assert.equal(checkRegistryCredential({ ...base, env, projectNpmrc: ROUTING }).verdict, "fail");
    assert.equal(checkRegistryCredential({ ...base, env: { NODE_AUTH_TOKEN: "t" }, projectNpmrc: `${ROUTING}${LINE}\n` }).verdict, "fail");
    assert.equal(checkRegistryCredential({ ...base, env, projectNpmrc: `${ROUTING}//npm.pkg.github.com/:_authToken=\n` }).verdict, "fail");
    assert.equal(checkRegistryCredential({ ...base, env, projectNpmrc: `# //npm.pkg.github.com/:_authToken=${SECRET}\n` }).verdict, "fail");
  });

  it("passes a user file with a usable line", () => {
    const result = checkRegistryCredential({ env: { NODE_AUTH_TOKEN: "t" }, userPath: "u", userNpmrc: Buffer.from(`${LINE}\n`) });
    assert.equal(result.verdict, "ok");
  });
});

describe("userNpmrcPath", () => {
  it("prefers what npm and pnpm were pointed at, then the home directory", () => {
    assert.equal(userNpmrcPath({ npm_config_userconfig: "/tmp/a" }, "/h"), "/tmp/a");
    assert.equal(userNpmrcPath({ NPM_CONFIG_USERCONFIG: "/tmp/b" }, "/h"), "/tmp/b");
    assert.match(userNpmrcPath({}, "/h"), /^[/\\]h[/\\]\.npmrc$/);
  });
});

describe("failureMessage", () => {
  it("never contains the token, whatever state produced it", () => {
    const texts = [
      `# c//npm.pkg.github.com/:_authToken=${SECRET}`,
      `# //npm.pkg.github.com/:_authToken=${SECRET}\n`,
      "//npm.pkg.github.com/:_authToken=\n",
      `${LINE}\n`,
      ROUTING,
      null,
      Buffer.from(`//npm.pkg.github.com/:_authToken=${SECRET}\n`, "utf16le"),
    ];
    for (const text of texts) {
      const result = checkRegistryCredential({ env: {}, userPath: "/h/.npmrc", userNpmrc: text });
      assert.equal(result.verdict, "fail", String(text));
      const message = failureMessage(result, { NODE_AUTH_TOKEN: SECRET });
      assert.ok(!message.includes(SECRET), `leaked for ${JSON.stringify(String(text))}`);
      assert.ok(!JSON.stringify(result).includes(SECRET), `result carries the token for ${JSON.stringify(String(text))}`);
    }
  });

  it("says what is wrong for each state, and where", () => {
    assert.match(failureMessage({ state: "glued", line: 3, userPath: "p" }), /p, line 3: the token is glued[\s\S]*does not START with \/\//);
    assert.match(failureMessage({ state: "missing-token", line: 1, variable: "GH_PAT", userPath: "p" }), /defers to \$\{GH_PAT\}, and GH_PAT is not/);
    assert.match(failureMessage({ state: "commented", line: 2, userPath: "p" }), /line 2: .* commented out/);
    assert.match(failureMessage({ state: "empty-token", line: 2, userPath: "p" }), /line 2: .* has no value/);
    assert.match(failureMessage({ state: "utf16", userPath: "p" }), /UTF-16/);
    const missing = failureMessage({ state: "missing-line", userPath: "p" });
    assert.match(missing, /ends with a newline first/);
    assert.ok(missing.includes(LINE));
    assert.match(failureMessage({ state: "missing-file", userPath: "p" }), /p does not exist/);
  });

  it("takes a heading, and drops the skip hint for a caller it does not apply to", () => {
    const message = failureMessage({ state: "missing-line", userPath: "p" }, {}, { heading: "HEAD", skipHint: false });
    assert.match(message, /^\nHEAD\n/);
    assert.ok(!message.includes(SKIP_ENV));
    assert.ok(failureMessage({ state: "missing-line", userPath: "p" }).includes(`${SKIP_ENV}=1`));
  });
});

describe("the entry point and the pnpmfile hook", () => {
  const script = join(repoRoot, "scripts", "check-registry-token.mjs");

  const withUserconfig = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), "scaffold-registry-token-"));
    try {
      fn(join(dir, "user.npmrc"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  // A clean environment: only what a child process needs to start, plus the file to read.
  const envFor = (userconfig, extra = {}) => ({
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    NPM_CONFIG_USERCONFIG: userconfig,
    ...extra,
  });
  const run = (env) => spawnSync(process.execPath, [script], { encoding: "utf8", env });

  it("exits 1 with the diagnosis and no token for a glued line, 0 when skipped or configured", () => {
    withUserconfig((userconfig) => {
      writeFileSync(userconfig, `# a comment with no newline//npm.pkg.github.com/:_authToken=${SECRET}`);
      const glued = run(envFor(userconfig));
      assert.equal(glued.status, 1);
      assert.match(glued.stderr, /line 1: the token is glued/);
      assert.ok(!glued.stderr.includes(SECRET) && !glued.stdout.includes(SECRET));

      assert.equal(run(envFor(userconfig, { [SKIP_ENV]: "1" })).status, 0);

      writeFileSync(userconfig, `//npm.pkg.github.com/:_authToken=${SECRET}\n`);
      const ok = run(envFor(userconfig));
      assert.equal(ok.status, 0);
      assert.equal(ok.stdout + ok.stderr, "");
    });
  });

  it("names the variable when a ${VAR} line's variable is unset", () => {
    withUserconfig((userconfig) => {
      writeFileSync(userconfig, `${LINE}\n`);
      const result = run(envFor(userconfig));
      assert.equal(result.status, 1);
      assert.match(result.stderr, /NODE_AUTH_TOKEN is not/);
    });
  });

  it("makes .pnpmfile.cjs's preResolution throw on a failed check and return on a passing one", () => {
    const pnpmfile = createRequire(import.meta.url)(join(repoRoot, ".pnpmfile.cjs"));
    const saved = { ...process.env };
    withUserconfig((userconfig) => {
      try {
        // The hook's child inherits this process's environment, as it inherits pnpm's.
        delete process.env[SKIP_ENV];
        delete process.env.npm_config_userconfig;
        process.env.NPM_CONFIG_USERCONFIG = userconfig;
        writeFileSync(userconfig, ROUTING);
        assert.throws(() => pnpmfile.hooks.preResolution(), /no usable GitHub Packages credential/);

        writeFileSync(userconfig, `${ROUTING}//npm.pkg.github.com/:_authToken=${SECRET}\n`);
        assert.equal(pnpmfile.hooks.preResolution(), undefined);
      } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
      }
    });
  });
});
