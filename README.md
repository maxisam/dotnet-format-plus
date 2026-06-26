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

-   **Node 24** runtime — the action runs on `node24` (handled automatically by GitHub).
-   **.NET SDK** must be available on the runner (e.g. via `actions/setup-dotnet`). The
    bundled example/tests target **.NET 10**.
-   **jscpd 5** — when `jscpdCheck` is enabled, the action uses a `jscpd`/`cpd` binary found
    on `PATH`, otherwise it fetches it on demand with `npx --yes jscpd@5` (a one-time download).
    To avoid the download, install jscpd on the runner (`npm i -g jscpd`).

> Note on config keys: the granular `options`/`styleOptions`/`analyzersOptions`/`whitespaceOptions`
> blocks are toggled with `isEnabled`. The historical misspelling `isEabled` is still accepted for
> backward compatibility.

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

This is a TypeScript GitHub Action bundled with [`ncc`](https://github.com/vercel/ncc) into
`dist/`. The toolchain is modern and dependency-light:

-   **Node 24** (ESM, `"type": "module"`)
-   **[pnpm](https://pnpm.io/)** as the package manager (`packageManager` field; CI uses `pnpm/action-setup`)
-   **[Biome](https://biomejs.dev/)** for linting + formatting (`biome.json`)
-   **`node:test`** (Node's built-in runner) for tests — no Jest

```bash
pnpm install
pnpm build         # tsc --noEmit typecheck
pnpm lint          # biome lint
pnpm test          # node --test
pnpm package       # ncc build -> dist/index.js
pnpm all           # everything CI runs (build, format-check, package, test, finalize dist)
```

The committed `dist/` must stay in sync with the source — run `pnpm all` and commit `dist/`
before pushing. See [WALKTHROUGH.md](./WALKTHROUGH.md) for the design rationale and migration notes.

## Acknowledgements

This project is based on / inspired by lots of other projects, including but not limited to:

-   https://github.com/xt0rted/dotnet-format

-   https://github.com/jfversluis/dotnet-format

-   https://github.com/aclemmensen/dotnet-format-problem-matcher

-   https://github.com/kucherenko/jscpd

-   https://github.com/getunlatch/jscpd-github-action

-   https://github.com/bibipkins/dotnet-test-reporter
