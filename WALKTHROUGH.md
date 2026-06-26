# Modernization Walkthrough — Node 24 · jscpd 5 · .NET 10

This document explains the design decisions behind the 2026 modernization of
`dotnet-format-plus`, the migration flow, and how to test it.

## Why this was needed

The action was effectively broken: `action.yml` declared `runs.using: "node16"`,
a runtime GitHub Actions has removed, so it would not start on current runners.
While fixing that we also modernized the whole stack: Node 24, jscpd 5, .NET 10,
and a leaner toolchain (Biome, `node:test`), plus several latent-bug fixes.

## Decisions

### Language: stay TypeScript

The action orchestrates the GitHub API (octokit), generates markdown reports, and
drives external CLIs (`dotnet format`, `jscpd`). A Docker action in Go/Rust/C#
would add cold-start cost, force Linux-only runners, and abandon the mature
`@actions/*` toolkit — with no real upside here. We kept it a Node JS action and
bumped the runtime to `node24`.

### Module system: full ESM

Running tests natively with `node --test` requires real ES modules with explicit
file extensions, while `ncc` bundles the entrypoint. To keep tsc and Node
consistent we made the package ESM (`"type": "module"`) and:

- Added `.ts` extensions to every relative import (required by `nodenext`
  resolution and native execution).
- Enabled `rewriteRelativeImportExtensions` (TS 5.7+) instead of
  `allowImportingTsExtensions`, because `ncc` emits during bundling and
  `allowImportingTsExtensions` requires `noEmit`.
- Enabled `verbatimModuleSyntax`, which forces explicit `import type` for
  type-only imports. This is mandatory: Node's type-stripping cannot tell a type
  from a value in a mixed import (e.g. the `INPUTS` enum is a value but
  `IInputs` is a type), so unmarked type imports become runtime errors.
- Replaced `__dirname` in `problem-matcher.ts` with
  `dirname(fileURLToPath(import.meta.url))` (no `__dirname` in ESM).

`ncc` detects `"type": "module"` and emits an **ESM** bundle (plus its own
`dist/package.json` with `{"type":"module"}`), so no CommonJS shim is needed.
`scripts/finalize-dist.mjs` copies `problem-matcher.json` next to the bundle.

### Tests: `node:test`

Jest + ts-jest + babel were removed in favor of Node 24's built-in runner.

- The test script uses `--experimental-transform-types` because the source uses
  `enum`s (type-stripping alone cannot transform enums). The legacy
  `const enum FileStatus` was changed to a regular `enum`.
- Module mocking was avoided entirely: `readConfig.test.ts` writes real temp
  files instead of mocking `fs`, and `dotnet.test.ts` captures `process.stdout`
  to assert the `::error::` emitted by `core.setFailed` — so no
  `--experimental-test-module-mocks` flag is needed.
- JSON is imported with an import attribute: `... with { type: 'json' }`.

### Lint/format: Biome

ESLint 8 (legacy config) + Prettier were replaced by a single `biome.json`
mirroring the old Prettier settings (150 width, 4-space, single quotes, no
trailing commas, arrow parens avoided). Biome also organizes imports.

### Package manager: pnpm

Main migrated from yarn to pnpm (`packageManager: pnpm@11.9.0`) while this branch
was in flight. That change was merged in: the lockfile is `pnpm-lock.yaml`, the
`all` script and CI use pnpm (`pnpm/action-setup` + `cache: pnpm`), and main's
`js-yaml` named-import (`load as yamlLoad`) was adopted.

### jscpd 5: shell out to the CLI

This was the biggest surprise. jscpd 5 is a **Rust rewrite**: the `jscpd@5` npm
package ships only a CLI wrapper around a platform-specific binary and exposes
**no Node API**. Its building-block libraries (`@jscpd/core`/`finder`) stop at
v4 and v4's `@jscpd/finder` also dropped the old high-level `detectClones`
function.

Per the maintainer's choice, the action now **shells out to the jscpd 5 CLI**:

- `src/duplicated.ts` prefers a `jscpd` or `cpd` binary already on `PATH`
  (`io.which`) and otherwise falls back to `npx --yes jscpd@5`.
- It runs `--reporters json,markdown,console-full --output <dir>` and consumes
  the JSON report. The Rust engine's JSON schema (`duplicates[].firstFile`,
  `statistics.total.percentage`) matches the old shape, so the existing report
  parsing and threshold logic were preserved; the `@jscpd/core` type imports
  were replaced with small local interfaces in `modals.ts`.
- All `@jscpd/*` dependencies were removed from `package.json`.

Trade-off: the npx fallback downloads the binary on first run. Installing
`jscpd`/`cpd` on the runner avoids that.

### .NET 10

Test projects target `net10.0`, a root `global.json` pins the SDK to `10.0.x`,
and `test-dotnet-format.yml` adds `actions/setup-dotnet@v4` (runners do not ship
.NET 10 yet). The `dotnet format` flags the action emits are unchanged (stable
since .NET 6).

## Bug fixes folded in

- **`isEabled` → `isEnabled` (both accepted).** The code read the misspelled
  `isEabled`, so enabling sub-options via the documented `isEnabled` silently did
  nothing. `getOptions` now omits the enabled flag from defaults (so it cannot
  mask a user value) and resolves `isEnabled ?? isEabled ?? <default>`.
- **`--include` builder** no longer emits a literal `undefined` and passes a
  clean space-joined list.
- **Duplicate `git status -s`** call removed.
- **Test workflow** reads the real `hasChanges` / `hasDuplicates` outputs.
- Dropped `node-fetch` (native `fetch`); `rm -rf` replaced by `io.rmRF`.

## How to test

```bash
pnpm install
pnpm build          # tsc --noEmit typecheck
pnpm lint           # biome lint
pnpm format-check   # biome check (lint + format)
pnpm test           # node --test (16 tests)
pnpm package        # ncc -> dist/index.js (ESM)
pnpm all            # the full pipeline CI runs
```

Smoke-test the bundle loads as ESM (expect a "missing input" failure, not a
module error):

```bash
GITHUB_ACTIONS=true node dist/index.js
```

End-to-end is covered by `.github/workflows/test-dotnet-format.yml`, which runs
the action against the `net10.0` fixtures with `setup-dotnet 10.0.x` and
exercises both `dotnet format` and the jscpd 5 CLI path.
