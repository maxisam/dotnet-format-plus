# dotnet format plus

Yet another dotnet format. It combines dotnet format with jscpd to provide a single action to run both. The main goal is to provide a way to handle dotnet format in a mono repo. You can have an action before this and create a matrix of projects to run this action on. And each project can have its own dotnet format config file.

## Features

-   Dotnet format
-   Mono repo support by using `.dotnet-format.json (yml)` config file to configure dotnet format
-   Problem Matcher for dotnet format (only works when verbosity is set to detailed)
-   JSCPD, can be configured with `.jscpd.json (yml)` file
-   Generate reports as GitHub Action artifact
-   Generate reports as comment on PR
-   Generate reports as workflow summary
-   (optional) commit changes
-   (optional) update existing PR comment

## Requirements

This is a **composite action** — it orchestrates shell steps and
[`actions/github-script`](https://github.com/actions/github-script), so there is no
bundled JavaScript to build or ship.

-   **.NET SDK** must be available on the runner (e.g. via `actions/setup-dotnet`). The
    included example fixtures target **.NET 10**.
-   **GitHub-hosted runners** provide everything else it needs (`bash`, `jq`, `git`,
    Node/`npx`). On self-hosted runners make sure those are present.
-   **jscpd 5** — when `jscpdCheck` is enabled, the action uses a `jscpd`/`cpd` binary found
    on `PATH`, otherwise it fetches it on demand with `npx --yes jscpd@5` (a one-time download).
    To avoid the download, install jscpd on the runner (`npm i -g jscpd`).
-   **YAML config** (`.dotnet-format.yml` / `.jscpd.yml`) is converted on demand using
    `yq` if it is on `PATH` (GitHub-hosted runners ship it), otherwise a one-off pinned
    `npx -y js-yaml@4.1.0`; JSON config needs nothing extra.

> Note on config keys: the granular `options`/`styleOptions`/`analyzersOptions`/`whitespaceOptions`
> blocks are toggled with `isEnabled`. The legacy misspelled `isEabled` key from older
> versions is **no longer supported** (breaking change) — use `isEnabled`.

## Demo

-   generate report as comment

    <img width="712" alt="image" src="https://github.com/maxisam/dotnet-format-plus/assets/456807/085a4e5f-61e0-4561-a00a-bf5e26c8a2da">

-   Workflow summary

    <img width="1108" alt="image" src="https://github.com/maxisam/dotnet-format-plus/assets/456807/1ae6b0c3-fd22-4ecd-9330-78ccf18aa9ef">

-   Annotation

    <img width="567" alt="image" src="https://github.com/maxisam/dotnet-format-plus/assets/456807/87de99ae-a860-46f3-9987-d692df0aaf37">

## Usage

Currently this action is focused on running on PRs.
example:

-   [example workflow](.github/workflows/test-dotnet-format.yml)
-   [example dotnet-format config](./__tests__/dotnet/ConfigConsoleApp/.dotnet-format.json)
-   [example jscpd config](./__tests__/dotnet/ConfigConsoleApp/.jscpd.json)
-   [Action input](./action.yml)

## Development

This is a **composite action**: [`action.yml`](./action.yml) wires together shell steps
(which run `dotnet format`, `jscpd`, and `git`) and
[`actions/github-script`](https://github.com/actions/github-script) steps (which call the
GitHub API and `@actions/core`). The error-prone pure logic — config merge, `dotnet format`
argument building, and report→markdown — lives in small, dependency-free ES modules under
`scripts/` that the github-script steps load with a dynamic `import()`. **There is no build
step and nothing is bundled or committed to `dist/`.**

Toolchain:

-   **[pnpm](https://pnpm.io/)** as the package manager (`packageManager` field; CI uses `pnpm/action-setup`)
-   **[Biome](https://biomejs.dev/)** for linting + formatting (`biome.json`)
-   **`node:test`** (Node's built-in runner) for the helper unit tests — no Jest, no transpile

```bash
pnpm install
pnpm lint           # biome lint
pnpm format-check   # biome check (lint + format + import order)
pnpm test           # node --test (unit tests for scripts/)
pnpm all            # everything CI runs (biome check + node --test)
```

Layout:

-   `scripts/*.mjs` — pure, dependency-free helpers (merge, config read, format-args, report markdown), unit-tested
-   `scripts/steps/*.mjs` — thin github-script wrappers (resolve-config, format-report, jscpd-report, comment)
-   `__tests__/*.test.mjs` — `node:test` coverage for the pure helpers
-   `__tests__/dotnet/**` — `.NET 10` fixtures for the end-to-end workflow
-   `problem-matcher.json` — referenced by `action.yml` via `${{ github.action_path }}`

End-to-end behavior is exercised by `.github/workflows/test-dotnet-format.yml` against the
`net10.0` fixtures. See [WALKTHROUGH.md](./WALKTHROUGH.md) for the design rationale and
[MIGRATION.md](./MIGRATION.md) for the migration plan.

## Acknowledgements

This project is based on / inspired by lots of other projects, including but not limited to:

-   https://github.com/xt0rted/dotnet-format

-   https://github.com/jfversluis/dotnet-format

-   https://github.com/aclemmensen/dotnet-format-problem-matcher

-   https://github.com/kucherenko/jscpd

-   https://github.com/getunlatch/jscpd-github-action

-   https://github.com/bibipkins/dotnet-test-reporter
