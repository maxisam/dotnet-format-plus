import * as core from '@actions/core';
import { context } from '@actions/github';
import { Octokit } from '@octokit/rest';
import * as Common from './common';
import { REPORT_ARTIFACT_NAME } from './common';
import * as dotnet from './dotnet';
import * as git from './git';
import { IInputs } from './modals';

export async function setOutput(isDryRun: boolean): Promise<void> {
    if (isDryRun) {
        core.setOutput('hasChanges', 'false');
        core.notice('Dry run mode. No changes will be committed.', dotnet.ANNOTATION_OPTIONS);
    } else {
        const isFileChanged = await git.checkIsFileChanged();
        core.warning(`Dotnet Format File Changed: ${isFileChanged}`, dotnet.ANNOTATION_OPTIONS);
        core.setOutput('hasChanges', isFileChanged.toString());
    }
}

export async function format(inputs: IInputs, githubClient: InstanceType<typeof Octokit>): Promise<boolean> {
    dotnet.setDotnetEnvironmentVariables();
    if (inputs.nugetConfigPath) {
        await dotnet.nugetRestore(inputs.nugetConfigPath, inputs.workspace);
    }
    const options = Common.getFormatOptions(inputs);
    const formatArgs = await dotnet.buildFormatCommandArgs(options, async () => {
        return await git.getPullRequestFiles(githubClient);
    });
    let finalFormatResult = false;
    for (const args of formatArgs) {
        const { formatResult } = await dotnet.execFormat(args);
        core.info(`✅✅✅✅✅ DOTNET FORMAT SUCCESS: ${formatResult} ✅✅✅✅✅`);
        finalFormatResult = finalFormatResult || formatResult;
    }
    const reportFiles = dotnet.getReportFiles();
    await git.UploadReportToArtifacts(reportFiles, REPORT_ARTIFACT_NAME);
    if (finalFormatResult && context.eventName === 'pull_request' && !options.dryRun) {
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
    await setOutput(options.dryRun);
    finalFormatResult
        ? core.notice('✅ DOTNET FORMAT SUCCESS', dotnet.ANNOTATION_OPTIONS)
        : core.error('DOTNET FORMAT FAILED', dotnet.ANNOTATION_OPTIONS);
    return finalFormatResult;
}
