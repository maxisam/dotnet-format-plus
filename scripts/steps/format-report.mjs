// github-script wrapper (Phase 3, T9): turn the dotnet format report JSON into
// markdown, write it to the job summary, and post/update the PR comment. Receives
// github-script's { github, context, core }; report dir + inputs arrive via env.

import { generateReport, getReportFiles, getReportHeader } from '../dotnet-report.mjs';
import { upsertComment } from './comment.mjs';

/**
 * @param {{ github: any, context: any, core: any }} ctx
 */
export async function run({ github, context, core }) {
    const env = process.env;
    const workspace = env.WORKSPACE || '';
    const reportDir = env.REPORT_DIR || '';
    const postNewComment = env.POST_NEW_COMMENT === 'true';

    const reportFiles = getReportFiles(reportDir);
    if (!reportFiles.length) {
        core.info('No dotnet format report files to post');
        return;
    }

    const header = getReportHeader(workspace);
    const reportCtx = {
        owner: context.repo.owner,
        repo: context.repo.repo,
        sha: context.sha,
        cwd: process.cwd(),
        runId: context.runId,
        commit: context.payload?.pull_request?.head?.sha || context.sha
    };
    const message = generateReport(reportFiles, header, reportCtx);
    if (!message) {
        return;
    }

    await core.summary.addRaw(message).write();
    if (context.eventName === 'pull_request') {
        await upsertComment({ github, context, core }, header, message, postNewComment);
    }
}
