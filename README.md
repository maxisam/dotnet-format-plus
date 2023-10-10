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

## Demo

-   generate report as comment

    <img width="712" alt="image" src="https://github.com/maxisam/dotnet-format-plus/assets/456807/085a4e5f-61e0-4561-a00a-bf5e26c8a2da">

-   Workflow summary

    <img width="1076" alt="image" src="https://github.com/maxisam/dotnet-format-plus/assets/456807/d1c3e659-b9f3-4969-a752-054739b7920b">

-   Annotation

    <img width="567" alt="image" src="https://github.com/maxisam/dotnet-format-plus/assets/456807/87de99ae-a860-46f3-9987-d692df0aaf37">

## Usage

Currently this action is focused on running on PRs.
example:

-   [example workflow](.github/workflows/test-dotnet-format.yml)
-   [example dotnet-format config](./__tests__/dotnet/ConfigConsoleApp/.dotnet-format.json)
-   [example jscpd config](./__tests__/dotnet/ConfigConsoleApp/.jscpd.json)
-   [Action input](./action.yml)

## Aknowledgements

This project is based on / inspired by lots of other projects, including but not limited to:

-   https://github.com/xt0rted/dotnet-format

-   https://github.com/jfversluis/dotnet-format

-   https://github.com/aclemmensen/dotnet-format-problem-matcher

-   https://github.com/kucherenko/jscpd

-   https://github.com/getunlatch/jscpd-github-action

-   https://github.com/bibipkins/dotnet-test-reporter
