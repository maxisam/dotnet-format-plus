// jscpd report -> markdown + threshold + annotations, ported 1:1 from
// src/duplicated.ts (getReportHeader, postReport's markdown building,
// checkThreshold, showAnnotation, toGithubLink, toRepoRelative). The pure
// message/threshold/annotation logic lives here; the github-script wrapper does
// the actual core.error/warning + comment posting.

import path from 'node:path';
import { getReportFooter } from './report-common.mjs';

/**
 * @param {string} workspace
 * @returns {string}
 */
export function getReportHeader(workspace) {
    return `## ❌ DUPLICATED CODE FOUND - ${workspace}`;
}

/**
 * @param {string} name
 * @param {string} scanPath
 * @param {string} cwd
 * @returns {string}
 */
function toRepoRelative(name, scanPath, cwd) {
    return path.relative(cwd, path.resolve(scanPath, name));
}

/**
 * @param {{ name: string, start: number, end: number }} file
 * @param {string} scanPath
 * @param {import('./report-common.mjs').ReportContext} ctx
 * @returns {string}
 */
function toGithubLink(file, scanPath, ctx) {
    const main = toRepoRelative(file.name, scanPath, ctx.cwd);
    const [start, end] = [file.start, file.end];
    return `[${main}#L${start}-L${end}](https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.sha}/${main}#L${start}-L${end})`;
}

/**
 * True when the total duplicated percentage exceeds the threshold.
 * @param {{ statistics: { total: { percentage: number } } }} report
 * @param {number} threshold
 * @returns {boolean}
 */
export function isOverThreshold(report, threshold) {
    return report.statistics.total.percentage > threshold;
}

/**
 * Build the PR comment / summary message from the jscpd markdown report content
 * and the parsed duplicates. Mirrors the message built in postReport.
 * @param {string} markdownReportContent  Raw contents of jscpd's markdown report.
 * @param {any[]} duplicates
 * @param {string} workspace
 * @param {string} scanPath
 * @param {import('./report-common.mjs').ReportContext} ctx
 * @returns {string}
 */
export function buildJscpdMessage(markdownReportContent, duplicates, workspace, scanPath, ctx) {
    const report = markdownReportContent.replace('# Copy/paste detection report', '');
    let markdown = '<details>\n';
    markdown += ` <summary> JSCPD Details </summary>\n\n`;
    for (const dup of duplicates) {
        markdown += `- **${path.basename(dup.firstFile.name)}** & **${path.basename(dup.secondFile.name)}**\n`;
        markdown += `  - ${toGithubLink(dup.firstFile, scanPath, ctx)}\n`;
        markdown += `  - ${toGithubLink(dup.secondFile, scanPath, ctx)}\n`;
        markdown += '\n';
    }
    markdown += '</details>\n';
    const header = getReportHeader(workspace);
    return `${header} \n\n${report}\n\n ${markdown}\n\n ${getReportFooter(ctx)}`;
}

/**
 * Build the annotation payloads for each duplicate. The wrapper emits these via
 * core.error/core.warning. Mirrors showAnnotation in src/duplicated.ts.
 * @param {any[]} duplicates
 * @param {string} scanPath
 * @param {string} cwd
 * @returns {{ file: string, startLine: number, endLine: number, message: string }[]}
 */
export function buildAnnotations(duplicates, scanPath, cwd) {
    return duplicates.map(dup => {
        const fileA = toRepoRelative(dup.firstFile.name, scanPath, cwd);
        const fileB = toRepoRelative(dup.secondFile.name, scanPath, cwd);
        return {
            file: fileA,
            startLine: dup.firstFile.start,
            endLine: dup.firstFile.end,
            message: `${fileA} (${dup.firstFile.start}-${dup.firstFile.end})\n            and ${fileB} (${dup.secondFile.start}-${dup.secondFile.end})`
        };
    });
}
