/**
 * Tests for scripts/init.mjs — the guards, not the prompts.
 *
 * Run with:  pnpm run test:scripts
 *
 * The conversation is `readline/promises` and a person; there is nothing to
 * assert about it that is not a restatement of the source. What is worth
 * testing is every way the script decides *not* to talk: the four bail-out
 * conditions, the template-checkout detection, and the argument parsing that
 * pnpm's separator would otherwise break. Each of those is a way this script
 * could hang an install or corrupt a repository. The registry precondition it
 * checks is scripts/lib/registry-token.mjs, tested beside it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DESIGN_SYSTEMS,
  designSystemSpec,
  isInitialised,
  isTemplateCheckout,
  isValidPascalName,
  kebabFromPascal,
  parseArgs,
  skipReason,
} from "./init.mjs";

describe("parseArgs", () => {
  it("drops a literal -- that pnpm forwarded rather than consumed", () => {
    // `pnpm run init -- --name AcmeShop` arrives with the separator intact.
    // The same behaviour cost db:refresh its -v.
    assert.deepEqual(parseArgs(["--", "--name", "AcmeShop"]).name, "AcmeShop");
  });

  it("takes a bare argument as the name, so the old rename call still reads", () => {
    assert.equal(parseArgs(["AcmeShop"]).name, "AcmeShop");
  });

  it("reads every answer as a flag, so an agent needs no terminal", () => {
    const f = parseArgs(["--name", "AcmeShop", "--design-system", "base", "--engine", "docker", "--remotes", "keep", "--yes"]);
    assert.deepEqual(
      { name: f.name, designSystem: f.designSystem, engine: f.engine, remotes: f.remotes, yes: f.yes },
      { name: "AcmeShop", designSystem: "base", engine: "docker", remotes: "keep", yes: true },
    );
  });

  it("reports an unknown flag instead of ignoring it", () => {
    assert.equal(parseArgs(["--nmae", "AcmeShop"]).unknown, "--nmae");
  });

  it("defaults every boolean to false", () => {
    const f = parseArgs([]);
    assert.deepEqual({ auto: f.auto, yes: f.yes, force: f.force }, { auto: false, yes: false, force: false });
  });
});

describe("skipReason — the four ways --auto returns without asking", () => {
  const live = { initialised: false, env: {}, isTTY: true };

  it("carries on when a human is present and nothing has been set up", () => {
    assert.equal(skipReason(live), null);
  });

  it("stops when the project is already initialised", () => {
    assert.equal(skipReason({ ...live, initialised: true }), "already-initialised");
  });

  it("stops in CI, where prepare genuinely runs", () => {
    // pr-checks.yml installs without --ignore-scripts, so this guard is
    // load-bearing rather than defensive.
    assert.equal(skipReason({ ...live, env: { CI: "true" } }), "ci");
  });

  it("stops when standard input is not a terminal", () => {
    assert.equal(skipReason({ ...live, isTTY: false }), "not-a-terminal");
  });

  it("stops when SCAFFOLD_SKIP_INIT=1", () => {
    assert.equal(skipReason({ ...live, env: { SCAFFOLD_SKIP_INIT: "1" } }), "opted-out");
  });

  it("treats any other value of SCAFFOLD_SKIP_INIT as not set", () => {
    assert.equal(skipReason({ ...live, env: { SCAFFOLD_SKIP_INIT: "0" } }), null);
  });
});

describe("isInitialised", () => {
  it("is false while the manifest still carries the template's name", () => {
    assert.equal(isInitialised('{"name":"my-app"}'), false);
  });

  it("is true once the rebrand has run", () => {
    assert.equal(isInitialised('{"name":"acme-shop"}'), true);
  });

  it("is false rather than throwing on a manifest it cannot read", () => {
    assert.equal(isInitialised("not json"), false);
  });
});

describe("isTemplateCheckout — question 0, answered by origin", () => {
  for (const url of [
    "https://github.com/PTV-Mobility/scaffolding.git",
    "git@github.com:PTV-Mobility/scaffolding.git",
    "https://github.com/ptv-mobility/scaffolding",
  ]) {
    it(`asks nothing of ${url}`, () => assert.equal(isTemplateCheckout(url), true));
  }

  it("falls through to the real questions for a repository made with Use this template", () => {
    assert.equal(isTemplateCheckout("git@github.com:PTV-Mobility/acme-shop.git"), false);
  });

  it("does not match a repository that merely mentions the template", () => {
    assert.equal(isTemplateCheckout("https://github.com/PTV-Mobility/scaffolding-docs.git"), false);
  });

  it("survives no origin at all", () => {
    assert.equal(isTemplateCheckout(null), false);
  });
});

describe("designSystemSpec", () => {
  it("writes an aliased range, not a pin", () => {
    assert.equal(designSystemSpec("uds"), `npm:${DESIGN_SYSTEMS.uds.package}@${DESIGN_SYSTEMS.uds.range}`);
  });

  it("knows the second design system", () => {
    assert.match(designSystemSpec("base"), /^npm:@ptv-mobility\/design-system-base@\^/);
  });

  it("is null for anything else, including keep", () => {
    assert.equal(designSystemSpec("keep"), null);
    assert.equal(designSystemSpec("nonsense"), null);
  });

  it("names a real package for every choice", () => {
    for (const [id, ds] of Object.entries(DESIGN_SYSTEMS)) {
      assert.match(ds.package, /^@ptv-mobility\//, `${id} must be in the organisation's scope`);
      assert.match(ds.range, /^\^\d+\.\d+\.\d+$/, `${id} must pin a caret floor`);
    }
  });
});

describe("the two identity tokens", () => {
  it("derives kebab from Pascal the way rename.mjs does", () => {
    assert.equal(kebabFromPascal("AcmeShop"), "acme-shop");
    assert.equal(kebabFromPascal("Acme"), "acme");
    assert.equal(kebabFromPascal("AcmeShopV2"), "acme-shop-v2");
  });

  it("accepts a PascalCase name and nothing else", () => {
    assert.equal(isValidPascalName("AcmeShop"), true);
    assert.equal(isValidPascalName("acmeShop"), false);
    assert.equal(isValidPascalName("Acme Shop"), false);
    assert.equal(isValidPascalName("Acme-Shop"), false);
    assert.equal(isValidPascalName("A"), false);
    assert.equal(isValidPascalName(undefined), false);
  });
});
