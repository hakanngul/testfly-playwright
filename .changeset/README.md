# Changesets

Run `pnpm changeset` to describe a change. All `@testfly/*` packages share one version (fixed mode).

## Pre-release mode

The repo is in changesets pre mode (`.changeset/pre.json`, tag `next`): `pnpm version-packages` produces `X.Y.Z-next.N` versions and `changeset publish` publishes them under the `next` dist-tag. Run `pnpm changeset pre exit` before the first stable release.

Releases are cut by `.github/workflows/release.yml` on `main` only; `pnpm release` gates on build + typecheck + test.
