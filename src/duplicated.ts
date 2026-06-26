import * as fs from 'node:fs';
import path, { resolve } from 'node:path';
import * as core from '@actions/core';
import { context } from '@actions/github';
import * as io from '@actions/io';
import type { Octokit } from '@octokit/rest';
import { getReportFooter } from './common.ts';
import { execute } from './execute.ts';
import * as git from './git.ts';
import type { IDuplication, IJsonReport } from './modals.ts';
import { readConfig } from './readConfig.ts';

// jscpd 5 is a Rust CLI distributed via npm with no in-process Node API, so we
// run it through npx and consume the JSON/markdown reports it writes to disk.
const JSCPD_VERSION = '5';
const REPORT_JSON = 'jscpd-report.json';
const ANNOTATION_OPTIONS = {
    title: 'JSCPD Check'
};

export async function duplicatedCheck(
    workspace: string,
    jscpdConfigPath: string,
    jscpdCheckAsError: boolean,
    postNewComment: boolean,
    githubClient: InstanceType<typeof Octokit>,
    reportArtifactName: string
): Promise<void> {
    const cwd = process.cwd();
    const scanPath = checkWorkspace(workspace);
    const outputDir = path.join(cwd, reportArtifactName);
    const configFile = resolveConfigFile(jscpdConfigPath, scanPath);
    const threshold = getThreshold(jscpdConfigPath, scanPath);

    await runJscpd(scanPath, configFile, outputDir);

    const report = readJsonReport(outputDir);
    if (!report) {
        core.warning('jscpd did not produce a report', ANNOTATION_OPTIONS);
        core.setOutput('hasDuplicates', 'false');
        await io.rmRF(outputDir);
        return;
    }

    const duplicates = report.duplicates ?? [];
    if (duplicates.length > 0) {
        const reportFiles = getReportFiles(outputDir);
        const markdownReport = reportFiles.find(file => file.endsWith('.md')) as string;
        const jsonReport = reportFiles.find(file => file.endsWith('.json')) as string;
        const message = await postReport(githubClient, markdownReport, duplicates, workspace, scanPath, postNewComment);
        fs.writeFileSync(markdownReport, message);
        await git.UploadReportToArtifacts([markdownReport, jsonReport], reportArtifactName);
        const isOverThreshold = checkThreshold(report, threshold);
        jscpdCheckAsError && isOverThreshold ? core.setFailed('❌ DUPLICATED CODE FOUND') : core.warning('DUPLICATED CODE FOUND', ANNOTATION_OPTIONS);
        showAnnotation(duplicates, scanPath, cwd, jscpdCheckAsError && isOverThreshold);
        core.setOutput('hasDuplicates', `${isOverThreshold}`);
    } else {
        core.setOutput('hasDuplicates', 'false');
        core.notice('✅ NO DUPLICATED CODE FOUND', ANNOTATION_OPTIONS);
    }
    await io.rmRF(outputDir);
}

async function runJscpd(scanPath: string, configFile: string | undefined, outputDir: string): Promise<boolean> {
    const jscpdArgs = [scanPath, '--reporters', 'json,markdown,console-full', '--output', outputDir];
    if (configFile) {
        jscpdArgs.push('--config', configFile);
    }
    const { cmd, args } = await resolveJscpdCommand(jscpdArgs);
    core.startGroup('🔎 Running jscpd 5');
    core.info(`${cmd} ${args.join(' ')}`);
    // jscpd exits non-zero when the threshold is exceeded; we evaluate the
    // report ourselves, so don't let that fail the step here.
    const { result } = await execute(cmd, process.cwd(), args, false, true);
    core.endGroup();
    return result;
}

// Prefer a jscpd/cpd binary already on PATH (e.g. installed globally on the
// runner) and only fall back to a one-off npx download when none is present.
async function resolveJscpdCommand(jscpdArgs: string[]): Promise<{ cmd: string; args: string[] }> {
    for (const bin of ['jscpd', 'cpd']) {
        const found = await io.which(bin, false);
        if (found) {
            core.info(`Using installed ${bin}: ${found}`);
            return { cmd: found, args: jscpdArgs };
        }
    }
    core.info(`No jscpd CLI found on PATH; falling back to npx jscpd@${JSCPD_VERSION}`);
    return { cmd: 'npx', args: ['--yes', `jscpd@${JSCPD_VERSION}`, ...jscpdArgs] };
}

function resolveConfigFile(jscpdConfigPath: string, scanPath: string): string | undefined {
    const candidates = [path.join(scanPath, jscpdConfigPath || '.jscpd.json'), resolve(jscpdConfigPath || '.jscpd.json')];
    return candidates.find(candidate => fs.existsSync(candidate));
}

function getThreshold(jscpdConfigPath: string, scanPath: string): number {
    const config = readConfig<{ threshold?: number }>({}, jscpdConfigPath, scanPath, '.jscpd.json');
    return config.threshold ?? 0;
}

function readJsonReport(outputDir: string): IJsonReport | undefined {
    const jsonPath = path.join(outputDir, REPORT_JSON);
    if (!fs.existsSync(jsonPath)) {
        return undefined;
    }
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as IJsonReport;
}

function getReportFiles(outputDir: string): string[] {
    const filePaths = fs.readdirSync(outputDir).map(file => path.join(outputDir, file));
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

function showAnnotation(duplicates: IDuplication[], scanPath: string, cwd: string, isError: boolean): void {
    const show = isError ? core.error : core.warning;
    for (const dup of duplicates) {
        const fileA = toRepoRelative(dup.firstFile.name, scanPath, cwd);
        const fileB = toRepoRelative(dup.secondFile.name, scanPath, cwd);
        show(
            `${fileA} (${dup.firstFile.start}-${dup.firstFile.end})
            and ${fileB} (${dup.secondFile.start}-${dup.secondFile.end})`,
            {
                title: ANNOTATION_OPTIONS.title,
                file: fileA,
                startLine: dup.firstFile.start,
                endLine: dup.firstFile.end
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
    duplicates: IDuplication[],
    workspace: string,
    scanPath: string,
    postNewComment: boolean
): Promise<string> {
    let report = fs.readFileSync(markdownReport, 'utf8');
    // remove existing header
    report = report.replace('# Copy/paste detection report', '');
    const cwd = process.cwd();
    let markdown = '<details>\n';
    markdown += ` <summary> JSCPD Details </summary>\n\n`;
    for (const dup of duplicates) {
        markdown += `- **${path.basename(dup.firstFile.name)}** & **${path.basename(dup.secondFile.name)}**\n`;
        markdown += `  - ${toGithubLink(dup.firstFile, scanPath, cwd)}\n`;
        markdown += `  - ${toGithubLink(dup.secondFile, scanPath, cwd)}\n`;
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

function toRepoRelative(name: string, scanPath: string, cwd: string): string {
    return path.relative(cwd, path.resolve(scanPath, name));
}

function toGithubLink(file: IDuplication['firstFile'], scanPath: string, cwd: string): string {
    const main = toRepoRelative(file.name, scanPath, cwd);
    const range: [number, number] = [file.start, file.end];
    return `[${main}#L${range[0]}-L${range[1]}](https://github.com/${context.repo.owner}/${context.repo.repo}/blob/${context.sha}/${main}#L${range[0]}-L${range[1]})`;
}

function checkThreshold(report: IJsonReport, threshold: number): boolean {
    if (report.statistics.total.percentage > threshold) {
        core.error(`DUPLICATED CODE FOUND ${report.statistics.total.percentage}% IS OVER THRESHOLD ${threshold}%`, ANNOTATION_OPTIONS);
        return true;
    }
    return false;
}
