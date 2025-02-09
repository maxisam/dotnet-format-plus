import * as core from '@actions/core';
import { context } from '@actions/github';
import { IClone, IOptions } from '@jscpd/core';
import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import { detectClones } from 'jscpd';
import { inspect } from 'util';
import { getReportFooter } from './common';
import { execute } from './execute';
import * as git from './git';
import { IJsonReport } from './modals';
import { readConfig } from './readConfig';
export const REPORT_ARTIFACT_NAME = 'jscpdReport';

const ANNOTATION_OPTIONS = {
    title: 'JSCPD Check'
};
export async function duplicatedCheck(
    workspace: string,
    jscpdConfigPath: string,
    jscpdCheckAsError: boolean,
    postNewComment: boolean,
    githubClient: InstanceType<typeof Octokit>
): Promise<void> {
    const cwd = process.cwd();
    const path = checkWorkspace(workspace);
    const options = getOptions(jscpdConfigPath, path, cwd);
    const clones = await detectClones(options);
    if (clones.length > 0) {
        const reportFiles = getReportFiles(cwd);
        const markdownReport = reportFiles.find(file => file.endsWith('.md')) as string;
        const jsonReport = reportFiles.find(file => file.endsWith('.json')) as string;
        const message = await postReport(githubClient, markdownReport, clones, workspace, postNewComment);
        fs.writeFileSync(markdownReport, message);
        await git.UploadReportToArtifacts([markdownReport, jsonReport], REPORT_ARTIFACT_NAME);
        const isOverThreshold = checkThreshold(jsonReport, options.threshold || 0);
        jscpdCheckAsError && isOverThreshold ? core.setFailed('❌ DUPLICATED CODE FOUND') : core.warning('DUPLICATED CODE FOUND', ANNOTATION_OPTIONS);
        showAnnotation(clones, cwd, jscpdCheckAsError && isOverThreshold);
        core.setOutput('hasDuplicates', `${isOverThreshold}`);
    } else {
        core.setOutput('hasDuplicates', 'false');
        core.notice('✅ NO DUPLICATED CODE FOUND', ANNOTATION_OPTIONS);
    }
    await execute(`rm -rf ${cwd}/${REPORT_ARTIFACT_NAME}`);
}

function getOptions(jscpdConfigPath: string, workspace: string, cwd: string): Partial<IOptions> {
    const configOptions = readConfig<IOptions>({}, jscpdConfigPath, workspace, '.jscpd.json');
    const defaultOptions = {
        path: [`${workspace}`],
        reporters: ['markdown', 'json', 'consoleFull'],
        output: `${cwd}/${REPORT_ARTIFACT_NAME}`
    };
    const options = { ...configOptions, ...defaultOptions };
    core.startGroup('🔎 loaded options');
    core.info(`${inspect(options)}`);
    core.endGroup();
    return options;
}

function getReportFiles(cwd: string): string[] {
    const files = fs.readdirSync(`${cwd}/${REPORT_ARTIFACT_NAME}`);
    const filePaths = files.map(file => `${cwd}/${REPORT_ARTIFACT_NAME}/${file}`);
    core.info(`reportFiles: ${filePaths.join(',')}`);
    return filePaths;
}

function checkWorkspace(workspace: string): string {
    core.info(`workspace: ${workspace}`);
    //check if workspace path is a file
    const isFile = fs.existsSync(workspace) && fs.lstatSync(workspace).isFile();
    if (isFile) {
        // if it is a file, get the directory
        return workspace.substring(0, workspace.lastIndexOf('/'));
    }
    return workspace;
}

function showAnnotation(clones: IClone[], cwd: string, isError: boolean): void {
    const show = isError ? core.error : core.warning;
    for (const clone of clones) {
        show(
            `${clone.duplicationA.sourceId.replace(cwd, '')} (${clone.duplicationA.start.line}-${clone.duplicationA.end.line})
            and ${clone.duplicationB.sourceId.replace(cwd, '')} (${clone.duplicationB.start.line}-${clone.duplicationB.end.line})`,
            {
                title: ANNOTATION_OPTIONS.title,
                file: clone.duplicationA.sourceId,
                startLine: clone.duplicationA.start.line,
                endLine: clone.duplicationA.end.line
            }
        );
    }
}

function getReportHeader(workspace: string): string {
    return `## ❌ DUPLICATED CODE FOUND - ${workspace}`;
}

async function postReport(
    githubClient: InstanceType<typeof Octokit>,
    markdownReport: string,
    clones: IClone[],
    workspace: string,
    postNewComment: boolean
): Promise<string> {
    let report = fs.readFileSync(markdownReport, 'utf8');
    // remove existing header
    report = report.replace('# Copy/paste detection report', '');
    const cwd = process.cwd();
    let markdown = '<details>\n';
    markdown += ` <summary> JSCPD Details </summary>\n\n`;
    for (const c of clones) {
        markdown += `- **${c.duplicationA.sourceId.split('/').pop()}** & **${c.duplicationB.sourceId.split('/').pop()}**\n`;
        markdown += `  - ${toGithubLink(c.duplicationA.sourceId, cwd, [c.duplicationA.start.line, c.duplicationA.end.line])}\n`;
        markdown += `  - ${toGithubLink(c.duplicationB.sourceId, cwd, [c.duplicationB.start.line, c.duplicationB.end.line])}\n`;
        markdown += '\n';
    }
    markdown += '</details>\n';
    const header = getReportHeader(workspace);
    const message = `${header} \n\n${report}\n\n ${markdown}\n\n ${getReportFooter()}`;
    await git.setSummary(message);
    if (context.eventName === 'pull_request') {
        const existingCommentId = await git.getExistingCommentId(githubClient, header);
        if (!postNewComment && existingCommentId) {
            await git.updateComment(githubClient, existingCommentId, message);
        } else {
            await git.comment(githubClient, message);
        }
    }
    return message;
}

function toGithubLink(path: string, cwd: string, range: [number, number]): string {
    const main = path.replace(`${cwd}/`, '');
    return `[${main}#L${range[0]}-L${range[1]}](https://github.com/${context.repo.owner}/${context.repo.repo}/blob/${context.sha}/${main}#L${range[0]}-L${range[1]})`;
}

function checkThreshold(jsonReport: string, threshold: number): boolean {
    // read json report
    const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8')) as IJsonReport;
    if (report.statistics.total.percentage > threshold) {
        core.error(`DUPLICATED CODE FOUND ${report.statistics.total.percentage}% IS OVER THRESHOLD ${threshold}%`, ANNOTATION_OPTIONS);
        return true;
    }
    return false;
}
