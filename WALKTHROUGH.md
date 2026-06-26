# Composite Action Walkthrough

This document explains the current `dotnet-format-plus` architecture, the migration
away from the bundled TypeScript action, and the checks used to keep behavior aligned.

## Why this changed

The old action shipped a compiled `dist/index.js` bundle produced by `ncc`. That made
the repository carry both source and generated JavaScript, plus a runtime dependency
set for the GitHub Actions toolkit, artifact client, Octokit, config merge, and YAML.

Most of this action is orchestration around existing command-line tools:

- `dotnet format`
- `jscpd`
- `git`
- GitHub PR comments, annotations, summaries, and outputs

GitHub composite actions are a better fit for that shape. The current action puts the
workflow in `action.yml`, uses shell for CLI calls, and uses
`actions/github-script` for GitHub API and `@actions/core` operations. The remaining
logic that would be risky in shell stays in small ES modules under `scripts/`.

## Runtime Shape

`action.yml` is the product. There is no build step, no `src/` tree, and no committed
`dist/` bundle.

The action has three kinds of code:

- Shell steps run `dotnet restore`, `dotnet format`, `jscpd`, cleanup, and git commit/push.
- `actions/github-script` steps resolve config, list changed PR files, post reports, set summaries, emit annotations, and set outputs.
- `scripts/*.mjs` helpers hold pure logic: deep merge, config path resolution, `dotnet format` argv planning, report markdown, and annotation payloads.

The github-script wrappers in `scripts/steps/*.mjs` are intentionally thin. They adapt
GitHub-provided objects (`github`, `context`, `core`, `exec`) and environment inputs
into calls to the pure helpers.

## Dotnet Format Flow

The dotnet path is split into a planning step and shell execution.

1. `scripts/steps/resolve-config.mjs` reads action inputs from environment variables.
2. It merges defaults, root config, and workspace config through `scripts/read-config.mjs`.
3. It optionally lists changed PR files through the GitHub API.
4. `scripts/format-args.mjs` turns the merged config into ready-to-run `dotnet` argv arrays.
5. The plan is written to `$RUNNER_TEMP/df-config.json`.
6. The shell step runs each planned `dotnet format` command and writes format status to outputs.
7. `scripts/steps/format-report.mjs` converts non-empty report JSON files into markdown, writes the job summary, and creates or updates a PR comment.
8. The commit step removes report files, sets `hasChanges`, and optionally commits and pushes fixes for pull requests.

The shell step treats formatter findings separately from runner failures. Formatting
findings are gated by `failFast`; missing SDKs, invalid workspaces, restore failures,
or crashes fail the action directly.

## JSCPD Flow

The jscpd path stays close to the previous behavior but runs through the CLI.

1. The shell step resolves the scan path from `workspace`.
2. It chooses an existing `jscpd` or `cpd` binary from `PATH`, otherwise falls back to `npx --yes jscpd@5`.
3. It runs `jscpd` with `json,markdown,console-full` reporters into the configured artifact directory.
4. `scripts/steps/jscpd-report.mjs` reads `jscpd-report.json`, merges threshold config, writes the markdown summary/comment, emits annotations, sets `hasDuplicates`, and fails when `jscpdCheckAsError` and the threshold is exceeded.
5. The artifact is uploaded and the report directory is removed so later workflow steps see a clean workspace.

The action still ignores the jscpd CLI's threshold exit code and evaluates the JSON
report itself. That preserves the previous contract.

## Config Behavior

Config precedence is:

1. action-derived defaults
2. config path from the repository root
3. same config filename inside `workspace`

Arrays are concatenated and de-duplicated while preserving first occurrence order.
JSON config is parsed directly. YAML config is loaded on demand by calling
`npx -y js-yaml`, which keeps the action runtime dependency-free.

The documented `isEnabled` key and historical misspelling `isEabled` are both
accepted. `isEnabled` wins when both are present.

## Repository Layout

- `action.yml` is the composite action entrypoint.
- `problem-matcher.json` is referenced directly from `action.yml`.
- `scripts/*.mjs` contains pure helper logic.
- `scripts/steps/*.mjs` contains github-script wrappers.
- `__tests__/*.test.mjs` covers helper behavior with Node's built-in test runner.
- `__tests__/dotnet/**` contains .NET 10 fixtures for the end-to-end workflow.
- `.github/workflows/test-dotnet-format.yml` exercises the action against those fixtures.

## Local Checks

Run the same checks as CI:

```bash
pnpm install --frozen-lockfile
pnpm run format-check
pnpm test
pnpm all
```

Useful extra checks:

```bash
git diff --check origin/main...HEAD
node -e "import('js-yaml').then(y=>{const fs=require('fs'); const doc=y.load(fs.readFileSync('action.yml','utf8')); console.log(doc.runs.using, doc.runs.steps.length, Object.keys(doc.outputs));})"
```

End-to-end behavior requires GitHub Actions because the composite action uses
`actions/github-script`, artifact upload, workflow commands, PR context, and
`GITHUB_OUTPUT`/`GITHUB_ENV`. The workflow `.github/workflows/test-dotnet-format.yml`
runs both fixture jobs with `actions/setup-dotnet@v4` and `.NET 10`.

## Release Checklist

- `pnpm install --frozen-lockfile`
- `pnpm run format-check`
- `pnpm test`
- `pnpm all`
- `git diff --check origin/main...HEAD`
- Run `.github/workflows/test-dotnet-format.yml` in GitHub Actions for both fixture jobs.
- Confirm PR comments, summaries, annotations, `hasChanges`, and `hasDuplicates` match the expected behavior.
