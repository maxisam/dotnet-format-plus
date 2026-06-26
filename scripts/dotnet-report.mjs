// dotnet format report -> markdown, ported 1:1 from src/dotnet.ts
// (getReportFiles, getReportHeader, generateReport, generateMarkdownReport,
// toGithubLink). GitHub context is injected (see report-common.mjs).

import * as fs from 'node:fs';
import { getReportFooter } from './report-common.mjs';

/**
 * @param {string} workspace
 * @returns {string}
 */
export function getReportHeader(workspace) {
    return `## ✅ DOT NET FORMAT - ${workspace}`;
}

/**
 * Return the report JSON files that exist and are non-empty (> 2 bytes, to skip
 * `[]`). Mirrors getReportFiles in src/dotnet.ts.
 * @param {string} reportDir
 * @returns {string[]}
 */
export function getReportFiles(reportDir) {
    const reportPaths = [
        `${reportDir}/dotnet-format.json`,
        `${reportDir}/style-format.json`,
        `${reportDir}/analyzers-format.json`,
        `${reportDir}/whitespace-format.json`
    ];
    return reportPaths.filter(p => fs.existsSync(p) && fs.statSync(p).size > 2);
}

/**
 * @param {string} filePath
 * @param {import('./report-common.mjs').ReportContext} ctx
 * @returns {[string, string]}
 */
function toGithubLink(filePath, ctx) {
    const main = filePath.replace(`${ctx.cwd}/`, '');
    const link = `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.sha}/${main}`;
    return [main, link];
}

/**
 * @param {any[]} documents
 * @param {string} title
 * @param {import('./report-common.mjs').ReportContext} ctx
 * @returns {string}
 */
function generateMarkdownReport(documents, title, ctx) {
    let markdown = '<details>\n';
    markdown += ` <summary> ${title} Report </summary>\n\n`;
    for (const doc of documents) {
        const [main, link] = toGithubLink(doc.FilePath, ctx);
        markdown += `- **${doc.FileName}**\n`;
        markdown += `  - **Path:** [${main}](${link})\n`;
        for (const change of doc.FileChanges) {
            markdown += `    - **Description:** ${change.FormatDescription} ([L${change.LineNumber}:${change.CharNumber}](${link}#L${change.LineNumber})) \n`;
        }
        markdown += '\n';
    }
    markdown += '</details>\n';
    return markdown;
}

/**
 * Build the combined markdown report for one or more dotnet format report files.
 * Returns '' when there is nothing to report.
 * @param {string[]} reports
 * @param {string} header
 * @param {import('./report-common.mjs').ReportContext} ctx
 * @returns {string}
 */
export function generateReport(reports, header, ctx) {
    let markdownReport = '';
    for (const report of reports) {
        const fileName = report.split('/').pop()?.split('.')[0] || '';
        const reportJson = JSON.parse(fs.readFileSync(report, 'utf8'));
        markdownReport += generateMarkdownReport(reportJson, fileName.toLocaleUpperCase(), ctx);
    }
    if (!markdownReport) {
        return '';
    }
    return `${header}\n\n ${markdownReport}\n\n ${getReportFooter(ctx)}`;
}
