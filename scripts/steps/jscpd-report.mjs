// github-script wrapper (Phase 4, T13): consume the jscpd JSON/markdown report,
// build the PR message + job summary, emit annotations, set hasDuplicates, and fail
// the build when jscpdCheckAsError && over threshold. Ported 1:1 from
// duplicatedCheck in src/duplicated.ts. Receives github-script's
// { github, context, core, exec }; scanPath/outputDir + inputs arrive via env.

import * as fs from 'node:fs';
import path from 'node:path';
import { buildAnnotations, buildJscpdMessage, getReportHeader, isOverThreshold } from '../jscpd-report.mjs';
import { resolveConfig } from '../read-config.mjs';
import { upsertComment } from './comment.mjs';
import { makeLoader } from './load-config.mjs';

const ANNOTATION = { title: 'JSCPD Check' };
const REPORT_JSON = 'jscpd-report.json';

/**
 * @param {{ github: any, context: any, core: any, exec: any }} ctx
 */
export async function run({ github, context, core, exec }) {
    const env = process.env;
    const workspace = env.WORKSPACE || '';
    const scanPath = env.SCAN_PATH || workspace;
    const outputDir = env.OUTPUT_DIR || '';
    const jscpdConfigPath = env.JSCPD_CONFIG_PATH || '';
    const jscpdCheckAsError = env.JSCPD_CHECK_AS_ERROR === 'true';
    const postNewComment = env.POST_NEW_COMMENT === 'true';

    const jsonPath = path.join(outputDir, REPORT_JSON);
    if (!fs.existsSync(jsonPath)) {
        core.warning('jscpd did not produce a report', ANNOTATION);
        core.setOutput('hasDuplicates', 'false');
        return;
    }

    const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const duplicates = report.duplicates ?? [];
    if (duplicates.length === 0) {
        core.setOutput('hasDuplicates', 'false');
        core.notice('✅ NO DUPLICATED CODE FOUND', ANNOTATION);
        return;
    }

    // Threshold: merged from the resolved jscpd config (matches getThreshold).
    const cfg = await resolveConfig({}, jscpdConfigPath, scanPath, '.jscpd.json', makeLoader(exec));
    const threshold = cfg.threshold ?? 0;

    const cwd = process.cwd();
    const reportCtx = {
        owner: context.repo.owner,
        repo: context.repo.repo,
        sha: context.sha,
        cwd,
        runId: context.runId,
        commit: context.payload?.pull_request?.head?.sha || context.sha
    };
    const header = getReportHeader(workspace);

    // Build the message from jscpd's markdown report, post it, and overwrite the
    // markdown file with the full message (so the uploaded artifact matches).
    const mdFile = findByExt(outputDir, '.md');
    const mdContent = mdFile ? fs.readFileSync(mdFile, 'utf8') : '';
    const message = buildJscpdMessage(mdContent, duplicates, workspace, scanPath, reportCtx);
    if (mdFile) {
        fs.writeFileSync(mdFile, message);
    }
    await core.summary.addRaw(message).write();
    if (context.eventName === 'pull_request') {
        await upsertComment({ github, context, core }, header, message, postNewComment);
    }

    const over = isOverThreshold(report, threshold);
    if (over) {
        core.error(`DUPLICATED CODE FOUND ${report.statistics.total.percentage}% IS OVER THRESHOLD ${threshold}%`, ANNOTATION);
    }

    if (jscpdCheckAsError && over) {
        core.setFailed('❌ DUPLICATED CODE FOUND');
    } else {
        core.warning('DUPLICATED CODE FOUND', ANNOTATION);
    }

    const emit = jscpdCheckAsError && over ? core.error : core.warning;
    for (const a of buildAnnotations(duplicates, scanPath, cwd)) {
        emit(a.message, { title: ANNOTATION.title, file: a.file, startLine: a.startLine, endLine: a.endLine });
    }

    core.setOutput('hasDuplicates', `${over}`);
}

/**
 * @param {string} dir
 * @param {string} ext
 * @returns {string | undefined}
 */
function findByExt(dir, ext) {
    if (!fs.existsSync(dir)) {
        return undefined;
    }
    const found = fs.readdirSync(dir).find(f => f.endsWith(ext));
    return found ? path.join(dir, found) : undefined;
}
