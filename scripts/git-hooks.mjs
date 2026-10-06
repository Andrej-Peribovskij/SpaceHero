// Points git at the committed hooks in `.githooks/`. Run by the root `prepare`
// script, so a clone picks up the pre-push hook without a manual step. Never
// fails an install, so it never sets an exit code; the reasons are in
// lib/git-hooks.mjs.
//
// Usage:  node scripts/git-hooks.mjs
import { installHooks } from "./lib/git-hooks.mjs";

installHooks();
