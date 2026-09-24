# Git hooks

`pnpm run git:hooks` (called from `prepare`, so: every first install) points
`core.hooksPath` at this directory. Before this directory existed that command
succeeded and configured a path to nothing, so the repository claimed to
install hooks and installed none — git fails a missing `hooksPath` silently.

Hooks here are a local stand-in for server-side rules the current GitHub plan
does not offer on a private repository. They are a courtesy, not a control:
anyone can pass `--no-verify`, and a generated project that moves to hosting
with real branch protection should treat that as the real rule and these as
redundant.
