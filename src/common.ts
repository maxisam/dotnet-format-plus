import * as core from '@actions/core';
import { context } from '@actions/github';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';
import { inspect } from 'util';
import { execute } from './execute';
import { FixLevelType, IInputs, INPUTS, VerbosityType } from './modals';

export const REPORT_PATH = `${process.cwd()}/.dotnet-format`;
export const REPORT_ARTIFACT_NAME = 'dotnetformatreport';
export function getInputs(): IInputs {
    const inputs: IInputs = {
        authToken: core.getInput(INPUTS.authToken),
        action: core.getInput(INPUTS.action),
        onlyChangedFiles: core.getBooleanInput(INPUTS.onlyChangedFiles),
        failFast: core.getBooleanInput(INPUTS.failFast),
        workspace: core.getInput(INPUTS.workspace),
        projectFileName: core.getInput(INPUTS.projectFileName),
        severityLevel: core.getInput(INPUTS.severityLevel) as FixLevelType,
        logLevel: core.getInput(INPUTS.logLevel) as VerbosityType,
        problemMatcherEnabled: core.getBooleanInput(INPUTS.problemMatcherEnabled),
        skipCommit: core.getBooleanInput(INPUTS.skipCommit),
        commitUsername: core.getInput(INPUTS.commitUsername),
        commitUserEmail: core.getInput(INPUTS.commitUserEmail),
        commitMessage: core.getInput(INPUTS.commitMessage),
        nugetConfigPath: core.getInput(INPUTS.nugetConfigPath),
        dotnetFormatConfigPath: core.getInput(INPUTS.dotnetFormatConfigPath),
        jscpdConfigPath: core.getInput(INPUTS.jscpdConfigPath),
        jscpdCheck: core.getBooleanInput(INPUTS.jscpdCheck),
        jscpdCheckAsError: core.getBooleanInput(INPUTS.jscpdCheckAsError),
        postNewComment: core.getBooleanInput(INPUTS.postNewComment)
    };
    core.debug(`Inputs: ${inspect(inputs)}`);
    return inputs;
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
    core.info(`Current branch: "${current}"`);
    return current;
}

export async function RemoveReportFiles(): Promise<boolean> {
    const { result } = await execute(`rm -rf ${REPORT_PATH}/`);
    return result;
}

export function formatOnlyChangedFiles(onlyChangedFiles: boolean): boolean {
    if (onlyChangedFiles && ['issue_comment', 'pull_request'].includes(context.eventName)) {
        return true;
    }
    onlyChangedFiles && core.warning('Formatting only changed files is available on the issue_comment and pull_request events only');
    return false;
}

export function getReportFooter(): string {
    const commit = context.payload?.pull_request?.head?.sha || context.sha;
    const commitLink = `[${commit.substring(0, 7)}](https://github.com/${context.repo.owner}/${context.repo.repo}/commit/${commit})`;
    const workflowLink = `[Workflow](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;
    return commit ? `<br/>_✏️ updated for commit ${commitLink} by ${workflowLink}_ \n\n` : '';
}
