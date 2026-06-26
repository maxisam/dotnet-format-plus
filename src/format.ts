import * as core from '@actions/core';
import { context } from '@actions/github';
import type { Octokit } from '@octokit/rest';
import * as Common from './common.ts';
import * as dotnet from './dotnet.ts';
import * as git from './git.ts';
import type { IDotnetFormatArgs, IDotnetFormatConfig, IInputs } from './modals.ts';
import { readConfig } from './readConfig.ts';

export async function format(inputs: IInputs, githubClient: InstanceType<typeof Octokit>): Promise<boolean> {
    const configOptions = getOptions(inputs);
    const cwd = process.cwd();
    core.info(`🔍 cwd: ${cwd}`);
    dotnet.setDotnetEnvironmentVariables();
    configOptions.nugetConfigPath && (await dotnet.nugetRestore(inputs.nugetConfigPath, inputs.workspace));

    let changedFiles: string[] = [];

    if (Common.formatOnlyChangedFiles(configOptions.onlyChangedFiles || false)) {
        changedFiles = await git.getPullRequestFiles(githubClient);
        if (!changedFiles.length) {
            core.warning('No files found for formatting', dotnet.ANNOTATION_OPTIONS);
            return true;
        }
    }

    const formatArgs = dotnet.generateFormatCommandArgs(configOptions, inputs.workspace, changedFiles);
    const finalFormatResult = await execFormat(formatArgs);
    const reportFiles = dotnet.getReportFiles();
    await git.UploadReportToArtifacts(reportFiles, inputs.dotnetFormatReportArtifactName);
    const isDryRun = checkIsDryRun(configOptions);
    const isReportPosted = await postReport(reportFiles, githubClient, inputs.workspace, inputs.postNewComment);
    const isReportRemoved = isReportPosted && (await Common.RemoveReportFiles());
    const isChanged = isReportRemoved && (await git.checkIsFileChanged());
    setOutput(isDryRun, isChanged);
    if (!isDryRun && isChanged && isReportRemoved && !inputs.skipCommit && context.eventName === 'pull_request') {
        await commitChanges(cwd, inputs);
    }

    finalFormatResult
        ? core.notice('✅ DOTNET FORMAT SUCCESS', dotnet.ANNOTATION_OPTIONS)
        : core.error('DOTNET FORMAT FAILED', dotnet.ANNOTATION_OPTIONS);
    return finalFormatResult;
}

async function postReport(
    reportFiles: string[],
    githubClient: InstanceType<typeof Octokit>,
    workspace: string,
    postNewComment: boolean
): Promise<boolean> {
    if (reportFiles.length) {
        const header = dotnet.getReportHeader(workspace);
        const message = dotnet.generateReport(reportFiles, header);
        await git.setSummary(message);
        if (context.eventName === 'pull_request') {
            const existingCommentId = await git.getExistingCommentId(githubClient, header);
            if (!postNewComment && existingCommentId) {
                return await git.updateComment(githubClient, existingCommentId, message);
            } else {
                return await git.comment(githubClient, message);
            }
        }
    }
    return true;
}

async function commitChanges(cwd: string, inputs: IInputs): Promise<boolean> {
    const isInit = await git.init(cwd, inputs.commitUsername, inputs.commitUserEmail);
    const currentBranch = Common.getCurrentBranch();
    const isCommit = isInit && (await git.commit(cwd, inputs.commitMessage, currentBranch));
    return isCommit && (await git.push(currentBranch));
}

async function execFormat(formatArgs: string[][]): Promise<boolean> {
    let finalFormatResult = true;
    for (const args of formatArgs) {
        const { stdout, formatResult } = await dotnet.execFormat(args);
        core.info(`✅✅✅✅✅ DOTNET FORMAT SUCCESS: ${formatResult} ✅✅✅✅✅`);
        if (stdout.join('').includes('Unable to fix')) {
            core.error('Unable to fix all formatting issues', dotnet.ANNOTATION_OPTIONS);
            finalFormatResult = false;
        }
        finalFormatResult = finalFormatResult && formatResult;
    }
    return finalFormatResult;
}

function getOptions(inputs: IInputs): Partial<IDotnetFormatConfig> {
    // The enabled flag is intentionally omitted from the defaults so the legacy
    // `isEabled` key from user configs is not masked; it is resolved afterwards.
    const defaultOptions: Partial<IDotnetFormatConfig> = {
        nugetConfigPath: inputs.nugetConfigPath,
        projectFileName: inputs.projectFileName,
        onlyChangedFiles: inputs.onlyChangedFiles,
        options: {
            verifyNoChanges: inputs.action === 'check',
            severity: inputs.severityLevel,
            verbosity: inputs.logLevel,
            noRestore: !!inputs.nugetConfigPath
        },
        whitespaceOptions: {
            verifyNoChanges: inputs.action === 'check',
            folder: true,
            severity: inputs.severityLevel,
            verbosity: inputs.logLevel,
            noRestore: !!inputs.nugetConfigPath
        },
        analyzersOptions: {
            verifyNoChanges: inputs.action === 'check',
            severity: inputs.severityLevel,
            verbosity: inputs.logLevel,
            noRestore: !!inputs.nugetConfigPath
        },
        styleOptions: {
            verifyNoChanges: inputs.action === 'check',
            severity: inputs.severityLevel,
            verbosity: inputs.logLevel,
            noRestore: !!inputs.dotnetFormatConfigPath
        }
    };
    const configOptions = readConfig<IDotnetFormatConfig>(defaultOptions, inputs.dotnetFormatConfigPath, inputs.workspace, '.dotnet-format.json');
    // Simple mode (`options`) is on by default; the granular blocks are off.
    resolveEnabled(configOptions.options, true);
    resolveEnabled(configOptions.whitespaceOptions, false);
    resolveEnabled(configOptions.analyzersOptions, false);
    resolveEnabled(configOptions.styleOptions, false);
    return configOptions;
}

function resolveEnabled(block: IDotnetFormatArgs | undefined, defaultValue: boolean): void {
    if (block) {
        block.isEnabled = block.isEnabled ?? block.isEabled ?? defaultValue;
    }
}

function setOutput(isDryRun: boolean, isFileChanged: boolean): void {
    if (isDryRun) {
        core.setOutput('hasChanges', 'false');
        core.notice('Dry run mode. No changes will be committed.', dotnet.ANNOTATION_OPTIONS);
    } else {
        core.warning(`Dotnet Format File Changed: ${isFileChanged}`, dotnet.ANNOTATION_OPTIONS);
        core.setOutput('hasChanges', isFileChanged.toString());
    }
}

function checkIsDryRun(config: Partial<IDotnetFormatConfig>): boolean {
    if (dotnet.isEnabledBlock(config.options, false)) {
        return config.options?.verifyNoChanges ?? false;
    }
    const wEnabled = dotnet.isEnabledBlock(config.whitespaceOptions, false);
    const aEnabled = dotnet.isEnabledBlock(config.analyzersOptions, false);
    const sEnabled = dotnet.isEnabledBlock(config.styleOptions, false);
    const w = (wEnabled && !!config.whitespaceOptions?.verifyNoChanges) || !wEnabled;
    const a = (aEnabled && !!config.analyzersOptions?.verifyNoChanges) || !aEnabled;
    const s = (sEnabled && !!config.styleOptions?.verifyNoChanges) || !sEnabled;
    return w && a && s;
}
