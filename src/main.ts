import * as core from '@actions/core';
import {info} from '@actions/core';
import {context} from '@actions/github';
import {Octokit} from '@octokit/rest';
import {inspect} from 'util';
import * as Common from './common';
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

async function comment(githubClient: InstanceType<typeof Octokit>, stderr: string[], stdout: string[], formatResult: boolean): Promise<void> {
  if (context.eventName === 'pull_request') {
    if (formatResult) {
      if (stderr.length) {
        // even if the formatting succeeded, we still want to comment on the PR and let the user know that there were fixed
        await git.comment(githubClient, `✅✅ Formatting succeeded  \n ${stderr.join('')}`);
      } else {
        const totalFixedIssues = stdout.length - 2;
        if (totalFixedIssues > 0) {
          const output = `${stdout[0]} \n Total fixed issues: ${stdout.length - 2} \n\n ${stdout[stdout.length - 1]} `;
          await git.comment(githubClient, `✅ Formatting succeeded \n\n ${output}`);
        }
      }
    } else {
      await git.comment(githubClient, `❌ Formatting failed \n ${stderr.join('')}`);
    }
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
    for await (const args of formatArgs) {
      const {stdout, stderr, formatResult} = await dotnet.execFormat(args);
      info(`✅✅✅✅✅ DOTNET FORMAT SUCCESS: ${formatResult} ✅✅✅✅✅`);
      await comment(githubClient, stderr, stdout, formatResult);
      finalFormatResult = finalFormatResult || formatResult;
    }
    await setOutput(options.dryRun);
    if (context.eventName === 'pull_request' && !options.dryRun) {
      const isInit = await git.init(process.cwd(), inputs.commitUsername, inputs.commitUserEmail);
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
