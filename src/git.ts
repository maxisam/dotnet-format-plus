import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import { context } from '@actions/github';
import { Octokit } from '@octokit/rest';
import { extname } from 'path';
import { FileStatus, includedFileTypes } from './const';
import { execute } from './execute';

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
        .filter(file => includedFileTypes.includes(extname(file.filename)))
        .map(file => file.filename);
}

export async function init(workspace: string, username: string, email: string): Promise<boolean> {
    try {
        core.info('Configuring git…');

        let result = await execute(`git config --global --add safe.directory "${workspace}"`, workspace, [], true);
        if (!result.result) {
            core.error(`Unable to configure git: ${result.stderr.join('')}`);
        }
        result = await execute(`git config user.name "${username}"`, workspace);
        if (result.result) {
            result = await execute(`git config user.email "${email}"`, workspace);
            await execute(`git config core.ignorecase false`, workspace);
        }
        return result.result;
    } catch (ex) {
        core.error(`Unable to configure git: ${ex}`);
        throw ex;
    }
}

export async function checkIsFileChanged(): Promise<boolean> {
    core.debug('Checking changed files');
    const { stdout, stderr } = await execute('git', process.cwd(), ['status', '-s'], false, false);
    await execute('git', process.cwd(), ['status', '-s'], false, false);

    if (stderr.join('') !== '') {
        core.error(`Errors while checking git status for changed files. Error: ${stderr.join('\n')}`);
    }

    if (stdout.join('') === '') {
        core.info('Did not find any changed files');
        return false;
    }
    core.info('Found changed files');
    return true;
}

export async function commit(workspace: string, message: string, branch: string): Promise<boolean> {
    // check what is the current branch
    const { stdout } = await execute(`git branch --show-current`);
    if (stdout.join('').trim() !== branch) {
        core.info(`It is on "${stdout.join('').trim()}" branch, Checking out "${branch}"`);
        await execute(`git fetch origin ${branch} --depth=1`);
        await execute(`git stash`);
        await execute(`git checkout -b ${branch} FETCH_HEAD`);
        await execute(`git stash pop`);
    }
    core.info(`Committing changes to ${branch}…`);
    await execute(`git add .`, workspace);
    const result = await execute(`git commit -m "${message}"`, workspace);
    if (result.result) {
        core.info('Changes committed');
    } else {
        throw new Error(`Commit failed`);
    }
    return result.result;
}

const ATTEMPT_LIMIT = 3;
const REJECTED_KEYWORDS = ['[rejected]', '[remote rejected]'];

export async function push(branch: string): Promise<boolean> {
    for (let attempt = 1; attempt <= ATTEMPT_LIMIT; attempt++) {
        core.info(`Pushing changes… (attempt ${attempt} of ${ATTEMPT_LIMIT})`);
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
    core.info('Updates were rejected');
    core.info('Fetching upstream changes…');
    await execute(`git fetch`);
    core.info(`Rebasing local changes onto ${branch}…`);
    const result = await execute(`git pull --rebase`);
    if (result.result) {
        core.info(`Rebase successful`);
    } else {
        throw new Error(`Rebase failed`);
    }
}
// add report to github action artifacts
export async function UploadReportToArtifacts(reports: string[], artifactName: string): Promise<void> {
    const artifactClient = new DefaultArtifactClient();
    if (reports.length === 0) {
        core.info(`No reports found`);
        return;
    }
    const uploadResponse = await artifactClient.uploadArtifact(artifactName, reports, process.cwd());

    if (!uploadResponse.id) {
        core.error(`Failed to upload artifact ${artifactName}`);
    } else {
        core.info(`Artifact ${artifactName} uploaded successfully`);
    }
}

// https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary
export async function setSummary(text: string): Promise<void> {
    await core.summary.addRaw(text).write();
}

async function tryGetUserLogin(octokit: Octokit): Promise<string | undefined> {
    try {
        const username = await octokit.rest.users.getAuthenticated();
        return username.data?.login;
    } catch {
        core.warning('⚠️ Failed to get username without user scope, will check comment with user type instead');
        // when token doesn't have user scope
        return undefined;
    }
}

export async function getExistingCommentId(octokit: Octokit, header: string): Promise<number | undefined> {
    const comments = await octokit.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number
    });
    const userLogin = await tryGetUserLogin(octokit);
    const existingComment = comments.data?.find(c => {
        const isBotUserType = c.user?.type === 'Bot' || c.user?.login === userLogin;
        const startsWithHeader = c.body?.startsWith(header);
        return isBotUserType && startsWithHeader;
    });
    return existingComment?.id;
}

export async function comment(githubClient: InstanceType<typeof Octokit>, message: string): Promise<boolean> {
    const { owner, repo, number } = context.issue;
    if (!number) {
        throw new Error('Unable to get pull request number from action event');
    }
    core.info(`Commenting on PR #${number}`);
    const resp = await githubClient.rest.issues.createComment({
        owner,
        repo,
        issue_number: number,
        body: message
    });
    resp.status === 201 ? core.info('Commented on PR') : core.error(`Failed to comment on PR. Response: ${resp}`);
    return resp.status === 201;
}

export async function updateComment(githubClient: InstanceType<typeof Octokit>, commentId: number, body: string): Promise<boolean> {
    const { owner, repo, number } = context.issue;
    core.info(`♻️ Updating comment #${commentId} on PR #${number}`);
    const resp = await githubClient.rest.issues.updateComment({
        owner,
        repo,
        comment_id: commentId,
        body
    });
    resp.status === 200 ? core.info('Comment updated') : core.error(`Failed to update comment. Response: ${resp}`);
    return resp.status === 200;
}
