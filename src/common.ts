import * as core from '@actions/core';
import { context } from '@actions/github';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';
import { inspect } from 'util';
import { execute } from './execute';
import { FixLevelType, FormatOptions, IInputs, INPUTS } from './modals';

export const REPORT_PATH = `${process.cwd()}/.dotnet-format`;
export const REPORT_ARTIFACT_NAME = 'dotnet-format-report';
export function getInputs(): IInputs {
  const inputs: IInputs = {
    authToken: core.getInput(INPUTS.authToken),
    action: core.getInput(INPUTS.action),
    onlyChangedFiles: core.getInput(INPUTS.onlyChangedFiles) === 'true',
    failFast: core.getInput(INPUTS.failFast) === 'true',
    workspace: core.getInput(INPUTS.workspace),
    include: core.getInput(INPUTS.include),
    exclude: core.getInput(INPUTS.exclude),
    skipFixWhitespace: core.getInput(INPUTS.skipFixWhitespace) === 'true',
    skipFixAnalyzers: core.getInput(INPUTS.skipFixAnalyzers) === 'true',
    skipFixStyle: core.getInput(INPUTS.skipFixStyle) === 'true',
    styleSeverityLevel: core.getInput(INPUTS.styleSeverityLevel) as FixLevelType,
    analyzersSeverityLevel: core.getInput(INPUTS.analyzersSeverityLevel) as FixLevelType,
    logLevel: core.getInput(INPUTS.logLevel),
    commitUsername: core.getInput(INPUTS.commitUsername),
    commitUserEmail: core.getInput(INPUTS.commitUserEmail),
    commitMessage: core.getInput(INPUTS.commitMessage),
    nugetConfigPath: core.getInput(INPUTS.nugetConfigPath)
  };
  core.debug(`Inputs: ${inspect(inputs)}`);
  return inputs;
}

export function getFormatOptions(inputs: IInputs): FormatOptions {
  const {
    action,
    exclude,
    skipFixAnalyzers,
    skipFixStyle,
    skipFixWhitespace,
    styleSeverityLevel,
    analyzersSeverityLevel,
    include,
    logLevel,
    onlyChangedFiles,
    workspace
  } = inputs;

  const formatOptions: FormatOptions = {
    onlyChangedFiles,
    skipFixWhitespace,
    skipFixAnalyzers,
    skipFixStyle,
    styleSeverityLevel,
    analyzersSeverityLevel,
    logLevel,
    dryRun: action === 'check'
  };

  if (include) {
    formatOptions.include = include;
  }

  if (workspace) {
    formatOptions.workspace = workspace;
  }

  if (exclude) {
    formatOptions.exclude = exclude;
  }
  return formatOptions;
}

export function getOctokitRest(authToken: string, userAgent = 'github-action'): Octokit {
  try {
    const octokit = new Octokit({
      auth: authToken,
      userAgent,
      baseUrl: 'https://api.github.com',
      log: {
        debug: () => {},
        info: () => {},
        warn: console.warn,
        error: console.error
      },
      request: {
        fetch
      }
    });
    return octokit;
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(` Error creating octokit:\n${error.message}`);
    }
    throw error;
  }
}

export function getCurrentBranch(): string {
  const branch = context.payload?.pull_request?.head?.ref || context.ref;
  const current = branch.replace('refs/heads/', '');
  core.info(`Current branch: ${current}`);
  return current;
}

export async function RemoveReportFiles(): Promise<boolean> {
  const { result } = await execute(`rm -rf ${REPORT_PATH}/`);
  return result;
}
