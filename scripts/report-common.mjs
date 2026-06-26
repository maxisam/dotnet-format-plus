// Shared report footer, ported from getReportFooter in src/common.ts. The GitHub
// context is passed in (owner/repo/runId + the commit to link) instead of read
// from @actions/github, so the report helpers stay pure and testable.

/**
 * @typedef {Object} ReportContext
 * @property {string} owner
 * @property {string} repo
 * @property {string} sha       Commit SHA used for blob links.
 * @property {string} cwd       Working dir, used to make paths repo-relative.
 * @property {string|number} [runId]  Workflow run id for the footer link.
 * @property {string} [commit]  Commit to credit in the footer (PR head sha or sha).
 */

/**
 * @param {ReportContext} ctx
 * @returns {string}
 */
export function getReportFooter(ctx) {
    const commit = ctx.commit || ctx.sha;
    if (!commit) {
        return '';
    }
    const commitLink = `[${commit.substring(0, 7)}](https://github.com/${ctx.owner}/${ctx.repo}/commit/${commit})`;
    const workflowLink = `[Workflow](https://github.com/${ctx.owner}/${ctx.repo}/actions/runs/${ctx.runId})`;
    return `<br/>_✏️ updated for commit ${commitLink} by ${workflowLink}_ \n\n`;
}
