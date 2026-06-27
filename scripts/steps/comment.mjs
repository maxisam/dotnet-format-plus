// Shared PR comment upsert, ported from git.ts (getExistingCommentId, comment,
// updateComment). Finds a previous bot comment whose body starts with the report
// header and updates it, otherwise creates a new one. Used by both the dotnet
// format and jscpd report steps. Receives github-script's { github, context, core }.

/**
 * @param {any} github
 * @param {any} context
 * @param {string} header
 * @returns {Promise<number | undefined>}
 */
export async function getExistingCommentId(github, context, header) {
    // The two calls are independent; run them together. getAuthenticated may 403 on a
    // token without user scope — fall back to matching the Bot user type in that case.
    const [comments, userLogin] = await Promise.all([
        github.rest.issues.listComments({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number
        }),
        github.rest.users
            .getAuthenticated()
            .then(r => r.data?.login)
            .catch(() => undefined)
    ]);
    const existing = comments.data?.find(c => {
        const isBotUserType = c.user?.type === 'Bot' || c.user?.login === userLogin;
        return isBotUserType && c.body?.startsWith(header);
    });
    return existing?.id;
}

/**
 * Update the existing matching comment, or create a new one. When `postNewComment`
 * is true a new comment is always created.
 * @param {{ github: any, context: any, core: any }} ctx
 * @param {string} header
 * @param {string} message
 * @param {boolean} postNewComment
 * @returns {Promise<boolean>}
 */
export async function upsertComment({ github, context, core }, header, message, postNewComment) {
    const { owner, repo, number } = context.issue;
    if (!number) {
        throw new Error('Unable to get pull request number from action event');
    }
    const existingId = await getExistingCommentId(github, context, header);
    if (!postNewComment && existingId) {
        core.info(`♻️ Updating comment #${existingId} on PR #${number}`);
        const resp = await github.rest.issues.updateComment({ owner, repo, comment_id: existingId, body: message });
        resp.status === 200 ? core.info('Comment updated') : core.error(`Failed to update comment. Status: ${resp.status}`);
        return resp.status === 200;
    }
    core.info(`Commenting on PR #${number}`);
    const resp = await github.rest.issues.createComment({ owner, repo, issue_number: number, body: message });
    resp.status === 201 ? core.info('Commented on PR') : core.error(`Failed to comment on PR. Status: ${resp.status}`);
    return resp.status === 201;
}
