# Migration Plan — Bundled JS Action → Hybrid Composite Action

## Goal

Replace the bundled TypeScript GitHub Action (compiled with `ncc` into a committed
`dist/index.js`) with a **hybrid composite action**. The win we're after is killing
the build step and the committed bundle, shrinking the dependency surface, and making
what runs match what you read in `action.yml`.

## Why hybrid (not pure shell)

Most of the action is orchestration around two CLIs (`dotnet format`, `jscpd`) plus
GitHub plumbing — all of which is *simpler* as composite steps. But two parts are
error-prone in bash:

1. **Config merging** — a 3-way deep merge (code defaults → root config → workspace
   config) over JSON **and** YAML, with array de-duplication and the
   `isEnabled ?? isEabled ?? default` fallback plus simple-vs-granular precedence.
2. **`--include`/`--exclude` list building** — space-joined argument lists are a
   classic bash quoting hazard.

Those two stay in small, unit-tested JavaScript helpers. Everything else becomes
shell or [`actions/github-script`](https://github.com/actions/github-script).

## Three kinds of steps

| Kind | Used for |
|---|---|
| **shell** | run the CLIs: `dotnet format`, `jscpd`, `git`, nuget restore |
| **`actions/github-script`** | anything touching the GitHub API or `@actions/core`: changed-files lookup, PR comments, job summary, outputs, annotations, problem matcher |
| **tested `scripts/*.mjs` helpers** | the two error-prone pure-logic bits (config merge, report→markdown), `require()`d from a github-script step so they stay unit-testable |

`actions/github-script` hands you a pre-authenticated `github` (octokit), `context`,
`core`, `glob`, `io`, and `exec` with **no build and no committed bundle** — removing
almost the entire reason `dist/` exists today.

## Architecture / step sequence

`action.yml` becomes `runs.using: "composite"`, same `inputs` and `outputs`. Data flows
between steps via a normalized JSON file in `$RUNNER_TEMP` (resolved config + ready-to-run
arg arrays) and small step outputs for scalars.

> **Gotcha baked in everywhere:** composite steps don't auto-expose `inputs` to the
> step body. Every shell/github-script step receives what it needs via `env:`, and
> github-script auth uses `github-token: ${{ inputs.authToken }}`.

1. setup env + `::add-matcher::` (shell)
2. resolve config → `$RUNNER_TEMP/df-config.json` (github-script → `read-config.mjs` + `format-args.mjs`)
3. changed files, if `onlyChangedFiles` + PR event (github-script)
4. `dotnet format` per enabled block (shell, consumes config json)
5. format report → markdown → summary + PR comment (github-script → `dotnet-report.mjs`)
6. `actions/upload-artifact@v4` (dotnet report)
7. commit & push with rebase-retry + `hasChanges` output (shell)
8. `::remove-matcher::` (shell)
9. jscpd run (shell, PATH-or-`npx jscpd@5`)
10. jscpd report → threshold → annotations → comment → summary + `hasDuplicates` (github-script → `jscpd-report.mjs`)
11. `actions/upload-artifact@v4` (jscpd report)
12. `failFast` gate (shell)

Note: artifact upload is the one thing github-script can't do (no `@actions/artifact`
bundled), so it uses the standard `upload-artifact` action — simpler than the current
`DefaultArtifactClient` code anyway.

## Task list (commit after each)

### Phase 0 — scaffold
- **T0**: Worktree `../dotnet-format-plus-composite` on branch `feat/composite-action`. ✅

### Phase 1 — tested helpers (port logic 1:1) ✅
- **T1** ✅: `scripts/merge.mjs` (deep-merge + dedupe, replaces `deepmerge`) +
  `scripts/read-config.mjs` — port `readConfig` 3-way merge (defaults → root → workspace),
  JSON+YAML (parser injected), array-dedup. `isEnabled ?? isEabled ?? default` +
  simple-vs-granular precedence live in `format-args.mjs`.
- **T2** ✅: `scripts/format-args.mjs` — port `buildArgs` (esp. `--include`/`--exclude`
  list joining) so the shell step never does bash quoting, plus `buildDefaultOptions`,
  `finalizeEnabled`, `checkIsDryRun`, and a `planFormat` convenience emitting ready-to-run
  `dotnet` argv arrays + `isDryRun`.
- **T3** ✅: `scripts/report-common.mjs` (shared footer) + `scripts/dotnet-report.mjs` +
  `scripts/jscpd-report.mjs` — port JSON→markdown with the GitHub blob links (context
  injected, not read from `@actions/github`).
- **T4** ✅: Ported the existing `node:test` suite onto these helpers (33 tests; config-merge
  / arg / report coverage). YAML via inline `js-yaml` parse or `npx -y js-yaml` conversion —
  no repo `node_modules` needed at action runtime.

### Phase 2 — composite skeleton
- **T5**: Rewrite `action.yml` → composite, same inputs/outputs; ship `problem-matcher.json`
  at action root; matcher add/remove via workflow commands.

### Phase 3 — dotnet format path
- **T6**: config-resolve step → temp JSON.
- **T7**: changed-files github-script step.
- **T8**: format runner (shell loop over blocks).
- **T9**: report→summary→comment github-script step (reuse existing-comment-by-header +
  bot-user matching).
- **T10**: `upload-artifact` (dotnet).
- **T11**: commit/push shell step + `hasChanges`.

### Phase 4 — jscpd path
- **T12**: jscpd runner (shell).
- **T13**: jscpd report github-script step (threshold, annotations, comment, summary,
  `hasDuplicates`).
- **T14**: `upload-artifact` (jscpd).

### Phase 5 — failFast + teardown of the build pipeline
- **T15**: `failFast` gate.
- **T16**: Delete `dist/`, drop `package`/`ncc`/`finalize-dist`, remove `@actions/*`,
  `@octokit/rest`, `deepmerge` from deps (keep only what helpers/tests need).
  `package.json` shrinks to lint + test.
- **T17**: Update CI: drop the dist-sync check; run biome + helper tests only.

### Phase 6 — docs & end-to-end
- **T18**: Rewrite README (no build step) + WALKTHROUGH for the composite migration.
- **T19**: Run `test-dotnet-format.yml` (both matrix jobs) and diff behavior vs. current:
  PR comment, summary, `hasChanges`/`hasDuplicates`, annotations.

## Parity-risk checklist (things that can silently diverge)

- 3-way deep merge + array dedup + `isEabled` fallback (T1) — highest risk; the tests in
  T4 exist to pin it.
- `--include` with changed-files list quoting — handled by keeping it in JS (T2).
- Existing-comment matching: header `startsWith` + `user.type === 'Bot'` / login (T9/T13).
- Non-PR events (push): comments skipped, summary still written.
- Outputs are exactly the strings `"true"` / `"false"`.

## Net result

No bundler, no committed `dist/`, dependency surface drops from 8 runtime deps to ~1,
and the only "real code" left is ~4 small tested helpers.
