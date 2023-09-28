# dotnet format plus

Yet another dotnet format. It combines dotnet format with jscpd to provide a single action to run both.

## Features

-   Dotnet format
-   JSCPD
-   Generate reports as GitHub Action artifact
-   Generate reports as comment on PR

## Usage

Currently this action is focused on running on PRs.
example:

[test workflow](.github/workflows/test.yml)

## TODO

-   Create a configuation file for dotnet format, so different workspace can have different settings.

## Aknowledgements

This project is based on / inspired by lots of other projects, including but not limited to:

-   https://github.com/xt0rted/dotnet-format

-   https://github.com/jfversluis/dotnet-format

-   https://github.com/kucherenko/jscpd

-   https://github.com/getunlatch/jscpd-github-action
