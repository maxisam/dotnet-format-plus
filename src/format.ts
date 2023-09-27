import * as core from '@actions/core';
import { context } from '@actions/github';
import { Octokit } from '@octokit/rest';
import { inspect } from 'util';
import * as Common from './common';
import { REPORT_ARTIFACT_NAME } from './common';
import * as dotnet from './dotnet';
import * as git from './git';
import { IDotnetFormatConfig, IInputs } from './modals';
import { readConfig } from './readConfig';

export async function format(inputs: IInputs, githubClient: InstanceType<typeof Octokit>): Promise<boolean> {
    const configOptions = getOptions(inputs.dotnetFormatConfigPath, inputs.workspace);
    dotnet.setDotnetEnvironmentVariables();
    configOptions.nugetConfigPath && (await dotnet.nugetRestore(inputs.nugetConfigPath, inputs.workspace));

    const options = Common.getFormatOptions(inputs);
    let changedFiles: string[] = [];

    if (Common.formatOnlyChangedFiles(options.onlyChangedFiles)) {
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
    if (finalFormatResult && context.eventName === 'pull_request') {
        const message = dotnet.generateReport(reportFiles);
        // means that there are changes
        if (message) {
            await git.comment(githubClient, message);
            const isRemoved = await Common.RemoveReportFiles();
            const isInit = isRemoved && (await git.init(process.cwd(), inputs.commitUsername, inputs.commitUserEmail));
            const currentBranch = Common.getCurrentBranch();
            const isCommit = isInit && (await git.commit(process.cwd(), inputs.commitMessage, currentBranch));
            if (isCommit) {
                await git.push(currentBranch);
            }
        } else {
            core.notice('✅ NO CHANGES', dotnet.ANNOTATION_OPTIONS);
        }
    }
    await setOutput(configOptions);
    finalFormatResult
        ? core.notice('✅ DOTNET FORMAT SUCCESS', dotnet.ANNOTATION_OPTIONS)
        : core.error('DOTNET FORMAT FAILED', dotnet.ANNOTATION_OPTIONS);
    return finalFormatResult;
}

function getOptions(configPath: string, workspace: string): Partial<IDotnetFormatConfig> {
    const configOptions = readConfig<IDotnetFormatConfig>(configPath, workspace, '.dotnet-format.json');
    core.info(`loaded options: ${inspect(configOptions)}`);
    return configOptions;
}

export async function setOutput(config: Partial<IDotnetFormatConfig>): Promise<void> {
    let isDryRun = false;
    isDryRun = !!config.options?.isEabled && config.options?.verifyNoChanges;
    if (!config.options?.isEabled) {
        const w = (config.whitespaceOptions?.isEabled && config.whitespaceOptions?.verifyNoChanges) || !config.whitespaceOptions?.isEabled;
        const a = (config.analyzersOptions?.isEabled && config.analyzersOptions?.verifyNoChanges) || !config.analyzersOptions?.isEabled;
        const s = (config.styleOptions?.isEabled && config.styleOptions?.verifyNoChanges) || !config.styleOptions?.isEabled;
        isDryRun = w && a && s;
    }

    if (isDryRun) {
        core.setOutput('hasChanges', 'false');
        core.notice('Dry run mode. No changes will be committed.', dotnet.ANNOTATION_OPTIONS);
    } else {
        const isFileChanged = await git.checkIsFileChanged();
        core.warning(`Dotnet Format File Changed: ${isFileChanged}`, dotnet.ANNOTATION_OPTIONS);
        core.setOutput('hasChanges', isFileChanged.toString());
    }
}
