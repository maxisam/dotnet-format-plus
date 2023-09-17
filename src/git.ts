import * as artifact from '@actions/artifact';
import { error, info } from '@actions/core';
import { context } from '@actions/github';
import { Octokit } from '@octokit/rest';
import { debug } from 'console';
import { extname } from 'path';
import { REPORT_PATH } from './common';
import { execute } from './execute';

const enum FileStatus {
  /**
   * The file was added.
   */
  Added = 'added',

  /**
   * The mode of the file was changed or there are unknown changes because the diff was truncated.
   */
  Changed = 'changed',

  /**
   * The content of the file was modified.
   */
  Modified = 'modified',

  /**
   * The file was removed.
   */
  Removed = 'removed',

  /**
   * The file was renamed.
   */
  Renamed = 'renamed'
}

const fileTypes = ['.cs', '.vb'];

export async function getPullRequestFiles(githubClient: InstanceType<typeof Octokit>): Promise<string[]> {
  if (!context.issue.number) {
    throw Error('Unable to get pull request number from action event');
  }

  const files = await githubClient.paginate(githubClient.rest.pulls.listFiles, {
    ...context.repo,
    pull_number: context.issue.number
  });

  return files
    .filter(file => file.status !== FileStatus.Removed)
    .filter(file => fileTypes.includes(extname(file.filename)))
    .map(file => file.filename);
}

export async function checkIsFileChanged(): Promise<boolean> {
  debug('Checking changed files');
  const { stdout, stderr } = await execute('git', process.cwd(), ['status', '-s'], false, false);
  await execute('git', process.cwd(), ['status', '-s'], false, false);

  if (stderr.join('') !== '') {
    error(`Errors while checking git status for changed files. Error: ${stderr.join('\n')}`);
  }

  if (stdout.join('') === '') {
    info('Did not find any changed files');
    return false;
  }
  info('Found changed files');
  return true;
}

export async function comment(githubClient: InstanceType<typeof Octokit>, message: string): Promise<boolean> {
  const { owner, repo, number } = context.issue;
  if (!number) {
    throw new Error('Unable to get pull request number from action event');
  }
  info(`Commenting on PR #${number}`);
  const resp = await githubClient.rest.issues.createComment({
    owner,
    repo,
    issue_number: number,
    body: message
  });
  resp.status === 201 ? info('Commented on PR') : error(`Failed to comment on PR. Response: ${resp}`);
  return resp.status === 201;
}

export async function init(workspace: string, username: string, email: string): Promise<boolean> {
  try {
    info('Configuring git…');

    let result = await execute(`git config --global --add safe.directory "${workspace}"`, workspace, [], true);
    if (!result.result) {
      error(`Unable to configure git: ${result.stderr.join('')}`);
    }
    result = await execute(`git config user.name "${username}"`, workspace);
    if (result.result) {
      result = await execute(`git config user.email "${email}"`, workspace);
      await execute(`git config core.ignorecase false`, workspace);
    }
    return result.result;
  } catch (ex) {
    error(`Unable to configure git: ${ex}`);
    throw ex;
  }
}

export async function commit(workspace: string, message: string, branch: string): Promise<boolean> {
  // check what is the current branch
  const { stdout } = await execute(`git branch --show-current`);
  if (stdout.join('').trim() !== branch) {
    info(`Checking out ${branch}…`);
    await execute(`git fetch origin ${branch} --depth=1`);
    await execute(`git checkout -b ${branch} FETCH_HEAD`);
  }
  info(`Committing changes to ${branch}…`);
  await execute(`git add .`, workspace);
  const result = await execute(`git commit -m "${message}"`, workspace);
  if (result.result) {
    info('Changes committed');
  } else {
    throw new Error(`Commit failed`);
  }
  return result.result;
}

const ATTEMPT_LIMIT = 3;
const REJECTED_KEYWORDS = ['[rejected]', '[remote rejected]'];

export async function push(branch: string): Promise<boolean> {
  for (let attempt = 1; attempt <= ATTEMPT_LIMIT; attempt++) {
    info(`Pushing changes… (attempt ${attempt} of ${ATTEMPT_LIMIT})`);
    const pushResult = await execute(`git push --porcelain origin ${branch}:${branch}`, process.cwd(), [], false, true);

    const stdout = pushResult.stdout.join('');
    const stderr = pushResult.stderr.join('\n');

    if (wasPushRejected(stdout)) {
      await handleRejectedPush(branch);
    } else if (stderr.startsWith('fatal:')) {
      throw new Error(stderr);
    } else {
      return true;
    }
  }

  throw new Error(`Attempt limit exceeded`);
}

function wasPushRejected(stdout: string): boolean {
  return REJECTED_KEYWORDS.some(keyword => stdout.includes(keyword));
}

async function handleRejectedPush(branch: string): Promise<void> {
  info('Updates were rejected');
  info('Fetching upstream changes…');
  await execute(`git fetch`);
  info(`Rebasing local changes onto ${branch}…`);
  const result = await execute(`git pull --rebase`);
  if (result.result) {
    info(`Rebase successful`);
  } else {
    throw new Error(`Rebase failed`);
  }
}
// add report to github action artifacts
export async function UploadReportToArtifacts(): Promise<void> {
  const artifactClient = artifact.create();
  const reportPath = REPORT_PATH;
  const artifactName = 'dotnet-format-report';

  const uploadResponse = await artifactClient.uploadArtifact(artifactName, [reportPath], process.cwd(), {
    continueOnError: true
  });

  if (uploadResponse.failedItems.length > 0) {
    error(`Failed to upload artifact ${artifactName}: ${uploadResponse.failedItems.join(', ')}`);
  } else {
    info(`Artifact ${artifactName} uploaded successfully`);
    // remove report from local
  }
  await execute(`rm -rf ${reportPath}`);
}
