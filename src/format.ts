import * as core from '@actions/core';
import { context } from '@actions/github';
import { Octokit } from '@octokit/rest';
import * as Common from './common';
import { REPORT_ARTIFACT_NAME } from './common';
import * as dotnet from './dotnet';
import * as git from './git';
import { IDotnetFormatConfig, IInputs } from './modals';
import { readConfig } from './readConfig';

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

    let finalFormatResult = false;
    for (const args of formatArgs) {
        const { formatResult } = await dotnet.execFormat(args);
        core.info(`✅✅✅✅✅ DOTNET FORMAT SUCCESS: ${formatResult} ✅✅✅✅✅`);
        finalFormatResult = finalFormatResult || formatResult;
    }
    const reportFiles = dotnet.getReportFiles();
    await git.UploadReportToArtifacts(reportFiles, REPORT_ARTIFACT_NAME);
    const isDryRun = checkIsDryRun(configOptions);
    const isChanged = await git.checkIsFileChanged();
    setOutput(isDryRun, isChanged);
    if (finalFormatResult && context.eventName === 'pull_request') {
        const message = dotnet.generateReport(reportFiles);
        // means that there are changes
        if (message) {
            await git.comment(githubClient, message);
            const isRemoved = await Common.RemoveReportFiles();
            const isInit = isRemoved && (await git.init(cwd, inputs.commitUsername, inputs.commitUserEmail));
            if (!isDryRun && reportFiles.length && isChanged) {
                const currentBranch = Common.getCurrentBranch();
                const isCommit = isInit && (await git.commit(cwd, inputs.commitMessage, currentBranch));
                if (isCommit) {
                    await git.push(currentBranch);
                }
            }
        } else {
            core.notice('✅ NO CHANGES', dotnet.ANNOTATION_OPTIONS);
        }
    }
    finalFormatResult
        ? core.notice('✅ DOTNET FORMAT SUCCESS', dotnet.ANNOTATION_OPTIONS)
        : core.error('DOTNET FORMAT FAILED', dotnet.ANNOTATION_OPTIONS);
    return finalFormatResult;
}

function getOptions(inputs: IInputs): Partial<IDotnetFormatConfig> {
    const defaultOptions: Partial<IDotnetFormatConfig> = {
        nugetConfigPath: inputs.nugetConfigPath,
        projectFileName: inputs.projectFileName,
        onlyChangedFiles: inputs.onlyChangedFiles,
        options: {
            isEabled: true,
            verifyNoChanges: inputs.action === 'check',
            severity: inputs.severityLevel,
            verbosity: inputs.logLevel,
            noRestore: !!inputs.nugetConfigPath
        },
        whitespaceOptions: {
            isEabled: false,
            verifyNoChanges: inputs.action === 'check',
            folder: true,
            severity: inputs.severityLevel,
            verbosity: inputs.logLevel,
            noRestore: !!inputs.nugetConfigPath
        },
        analyzersOptions: {
            isEabled: false,
            verifyNoChanges: inputs.action === 'check',
            severity: inputs.severityLevel,
            verbosity: inputs.logLevel,
            noRestore: !!inputs.nugetConfigPath
        },
        styleOptions: {
            isEabled: false,
            verifyNoChanges: inputs.action === 'check',
            severity: inputs.severityLevel,
            verbosity: inputs.logLevel,
            noRestore: !!inputs.dotnetFormatConfigPath
        }
    };
    const configOptions = readConfig<IDotnetFormatConfig>(defaultOptions, inputs.dotnetFormatConfigPath, inputs.workspace, '.dotnet-format.json');
    return configOptions;
}

export function setOutput(isDryRun: boolean, isFileChanged: boolean): void {
    if (isDryRun) {
        core.setOutput('hasChanges', 'false');
        core.notice('Dry run mode. No changes will be committed.', dotnet.ANNOTATION_OPTIONS);
    } else {
        core.warning(`Dotnet Format File Changed: ${isFileChanged}`, dotnet.ANNOTATION_OPTIONS);
        core.setOutput('hasChanges', isFileChanged.toString());
    }
}
export function checkIsDryRun(config: Partial<IDotnetFormatConfig>): boolean {
    if (config.options?.isEabled) {
        return config.options?.verifyNoChanges;
    } else {
        const w = (config.whitespaceOptions?.isEabled && config.whitespaceOptions?.verifyNoChanges) || !config.whitespaceOptions?.isEabled;
        const a = (config.analyzersOptions?.isEabled && config.analyzersOptions?.verifyNoChanges) || !config.analyzersOptions?.isEabled;
        const s = (config.styleOptions?.isEabled && config.styleOptions?.verifyNoChanges) || !config.styleOptions?.isEabled;
        return w && a && s;
    }
}
