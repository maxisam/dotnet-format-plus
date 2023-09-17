import { debug, info, setFailed, warning } from '@actions/core';
import { context } from '@actions/github';

import { REPORT_PATH } from './common';
import { execute } from './execute';
import { FormatOptions, FormatResult } from './modals';

function formatOnlyChangedFiles(onlyChangedFiles: boolean): boolean {
  if (onlyChangedFiles) {
    if (context.eventName === 'issue_comment' || context.eventName === 'pull_request') {
      return true;
    }
    warning('Formatting only changed files is available on the issue_comment and pull_request events only');
    return false;
  }
  return false;
}

function buildFormatCommandArgsVariants(options: FormatOptions): string[][] {
  const dotnetFormatOptions: string[][] = [];
  if (!options.skipFixWhitespace) {
    dotnetFormatOptions.push(['format', 'whitespace']);
  }
  if (!options.skipFixAnalyzers) {
    dotnetFormatOptions.push(['format', 'analyzers', '--severity', options.analyzersSeverityLevel]);
  }
  if (!options.skipFixStyle) {
    dotnetFormatOptions.push(['format', 'style', '--severity', options.styleSeverityLevel]);
  }
  return dotnetFormatOptions.length ? dotnetFormatOptions : [['format']];
}

export async function buildFormatCommandArgs(options: FormatOptions, getFilesToCheck: () => Promise<string[]>): Promise<string[][]> {
  const dotnetFormatOptions: string[] = [];

  if (options.workspace) {
    dotnetFormatOptions.push(options.workspace);
  } else {
    setFailed('Specify PROJECT | SOLUTION, .sln or .csproj');
    return [];
  }

  options.dryRun && dotnetFormatOptions.push('--verify-no-changes');

  if (formatOnlyChangedFiles(options.onlyChangedFiles) && context.eventName === 'pull_request') {
    const filesToCheck = await getFilesToCheck();
    debug(`filesToCheck: ${filesToCheck}`);

    info(`Checking ${filesToCheck.length} files`);

    if (!filesToCheck.length) {
      debug('No files found for formatting');
      warning('No files found for formatting');
    }

    dotnetFormatOptions.push('--include', filesToCheck.join(' '));
  }

  !!options.exclude && dotnetFormatOptions.push('--exclude', options.exclude);
  dotnetFormatOptions.push('--verbosity', options.logLevel);
  const dotnetFormatOptionsGroups = buildFormatCommandArgsVariants(options);
  return dotnetFormatOptionsGroups.map(option => {
    if (option.length === 1) {
      return [...option, ...dotnetFormatOptions, '--report', `${REPORT_PATH}/dotnet-format.json`];
    } else {
      return [...option, ...dotnetFormatOptions, '--report', `${REPORT_PATH}/${option[1]}-format.json`];
    }
  });
}

export async function execFormat(formatArgs: string[]): Promise<FormatResult> {
  process.env.DOTNET_CLI_TELEMETRY_OPTOUT = 'true';
  process.env.DOTNET_NOLOGO = 'true';
  const { stdout, stderr } = await execute('dotnet', process.cwd(), formatArgs, false, true);
  // dotnet format returns non-zero exit code if there are formatting issues
  // but we don't want to fail the action in this case
  // stdout will always end with Format complete ...
  // stderr will be empty if there are no formatting issues

  const result = stdout[stdout.length - 1].includes('Format complete');
  return { stdout, stderr, formatResult: result };
}
