import * as core from '@actions/core';
import { info } from '@actions/core';
import { context } from '@actions/github';
import { inspect } from 'util';
import * as Common from './common';
import { REPORT_ARTIFACT_NAME } from './common';
import * as dotnet from './dotnet';
import * as git from './git';

async function setOutput(isDryRun: boolean): Promise<void> {
  if (isDryRun) {
    core.setOutput('has-changes', 'false');
  } else {
    const isFileChanged = await git.checkIsFileChanged();
    info(`isFileChanged: ${isFileChanged}`);
    core.setOutput('has-changes', isFileChanged.toString());
  }
}

async function run(): Promise<boolean> {
  try {
    const inputs = Common.getInputs();
    inspect(inputs);
    const githubClient = Common.getOctokitRest(inputs.authToken);
    const options = Common.getFormatOptions(inputs);
    const formatArgs = await dotnet.buildFormatCommandArgs(options, async () => {
      return await git.getPullRequestFiles(githubClient);
    });
    let finalFormatResult = false;
    for (const args of formatArgs) {
      const { formatResult } = await dotnet.execFormat(args);
      info(`✅✅✅✅✅ DOTNET FORMAT SUCCESS: ${formatResult} ✅✅✅✅✅`);
      finalFormatResult = finalFormatResult || formatResult;
    }
    const reportFiles = dotnet.getReportFiles();
    await git.UploadReportToArtifacts(reportFiles, REPORT_ARTIFACT_NAME);
    await setOutput(options.dryRun);
    if (context.eventName === 'pull_request' && !options.dryRun) {
      await git.comment(githubClient, dotnet.generateReport(reportFiles));
      const isRemoved = await Common.RemoveReportFiles();
      const isInit = isRemoved && (await git.init(process.cwd(), inputs.commitUsername, inputs.commitUserEmail));
      const currentBranch = Common.getCurrentBranch();
      const isCommit = isInit && (await git.commit(process.cwd(), inputs.commitMessage, currentBranch));
      if (isCommit) {
        await git.push(currentBranch);
      }
    }
    return finalFormatResult;
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed with error ${error.message}`);
    }
    return false;
  }
}

await run();
