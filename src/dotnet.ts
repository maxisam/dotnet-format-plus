import * as core from '@actions/core';
import { context } from '@actions/github';

import * as fs from 'fs';
import path from 'path';
import { inspect } from 'util';
import { REPORT_PATH, formatOnlyChangedFiles } from './common';
import { execute } from './execute';
import { FormatResult, FormatType, IDotnetFormatArgs, IDotnetFormatConfig, ReportItem } from './modals';

export const ANNOTATION_OPTIONS = {
    title: 'DOTNET FORMAT Check'
};
const DOTNET_FORMAT = 'format';
const BASE_REPORT_PATH = `${REPORT_PATH}/`;
const FORMAT_COMPLETE = 'Format complete';
export function setDotnetEnvironmentVariables(): void {
    process.env.DOTNET_CLI_TELEMETRY_OPTOUT = 'true';
    process.env.DOTNET_NOLOGO = 'true';
}

export function generateFormatCommandArgs(config: Partial<IDotnetFormatConfig>, workspace: string, changedFiles: string[]): string[][] {
    core.info(`loaded options: ${inspect(config)}`);
    if (!workspace) {
        core.setFailed('Specify PROJECT | SOLUTION, .sln or .csproj');
        return [];
    }
    const dotnetFormatOptions = [path.join(workspace, config.projectFileName || '')];
    const isOnlyChangedFiles = formatOnlyChangedFiles(config.onlyChangedFiles || false);
    if (isOnlyChangedFiles) {
        core.debug(`filesToCheck: ${inspect(changedFiles)}`);
        core.info(`🔍 Checking ${changedFiles.length} files`);
    }

    if (config.options?.isEabled) {
        const args = buildArgs(config.options, isOnlyChangedFiles, changedFiles, FormatType.all);
        return [[DOTNET_FORMAT, ...dotnetFormatOptions, ...args, '--report', `${BASE_REPORT_PATH}dotnet-format.json`]];
    }

    const allArgs: string[][] = [];
    const formatOptionsMapping = {
        whitespace: config.whitespaceOptions,
        analyzers: config.analyzersOptions,
        style: config.styleOptions
    };

    for (const [type, options] of Object.entries(formatOptionsMapping)) {
        if (options?.isEabled) {
            const args = buildArgs(options, isOnlyChangedFiles, changedFiles, type as FormatType);
            allArgs.push([DOTNET_FORMAT, type, ...dotnetFormatOptions, ...args, '--report', `${BASE_REPORT_PATH}${type}-format.json`]);
        }
    }

    return allArgs;
}

function buildArgs(options: IDotnetFormatArgs, onlyChangedFiles: boolean, changedFiles: string[], type: FormatType): string[] {
    const dotnetFormatOptions: string[] = [];
    options.verifyNoChanges && dotnetFormatOptions.push('--verify-no-changes');
    type === FormatType.whitespace && options.folder && dotnetFormatOptions.push('--folder');
    if (onlyChangedFiles && changedFiles.length) {
        dotnetFormatOptions.push('--include', `${changedFiles.join(' ')} ${options.include?.join(' ')}`);
    } else if (options.include) {
        dotnetFormatOptions.push('--include', options.include.join(' '));
    }
    options.exclude && dotnetFormatOptions.push('--exclude', options.exclude.join(' '));
    dotnetFormatOptions.push('--verbosity', options.verbosity || 'normal');
    options.noRestore && dotnetFormatOptions.push('--no-restore');
    type !== FormatType.whitespace && dotnetFormatOptions.push('--severity', options.severity || 'error');
    return dotnetFormatOptions;
}

export async function execFormat(formatArgs: string[]): Promise<FormatResult> {
    const { stdout, stderr } = await execute('dotnet', process.cwd(), formatArgs, false, true);
    // dotnet format returns non-zero exit code if there are formatting issues
    // but we don't want to fail the action in this case
    // stdout will always end with Format complete ...
    // stderr will be empty if there are no formatting issues

    const result = stdout[stdout.length - 1].includes(FORMAT_COMPLETE);
    return { stdout, stderr, formatResult: result };
}

export function getReportFiles(): string[] {
    const reportPaths = [
        `${REPORT_PATH}/dotnet-format.json`,
        `${REPORT_PATH}/style-format.json`,
        `${REPORT_PATH}/analyzers-format.json`,
        `${REPORT_PATH}/whitespace-format.json`
    ];
    // check if file size is greater than 2 bytes to avoid empty report
    return reportPaths.filter(p => fs.existsSync(p) && fs.statSync(p).size > 2);
}

export function generateReport(reports: string[]): string {
    let markdownReport = '';
    for (const report of reports) {
        // get file name from report path without extension
        const fileName = report.split('/').pop()?.split('.')[0] || '';
        const reportJson = JSON.parse(fs.readFileSync(report, 'utf8')) as ReportItem[];
        markdownReport += generateMarkdownReport(reportJson, fileName.toLocaleUpperCase());
    }
    if (!markdownReport) {
        return '';
    }
    return `✅ Formatting succeeded\n\n ${markdownReport}`;
}

export async function nugetRestore(nugetConfigPath: string, workspace: string): Promise<boolean> {
    const { result } = await execute(
        'dotnet restore',
        process.cwd(),
        // for some reason dotnet restore doesn't work with --configfile
        [`-p:RestoreConfigFile=${workspace}${nugetConfigPath}`, `${workspace}`],
        false,
        false
    );
    return result;
}

function generateMarkdownReport(documents: ReportItem[], title: string): string {
    let markdown = '<details>\n';
    markdown += ` <summary> ${title} Report </summary>\n\n`;
    const cwd = process.cwd();
    for (const doc of documents) {
        markdown += `- **${doc.FileName}**\n`;
        markdown += `  - **Path:** ${toGithubLink(doc.FilePath, cwd)}\n`;

        for (const change of doc.FileChanges) {
            markdown += `    - **Description:** ${change.FormatDescription}\n`;
        }

        markdown += '\n';
    }

    markdown += '</details>\n';
    return markdown;
}

function toGithubLink(filePath: string, cwd: string): string {
    const main = filePath.replace(`${cwd}/`, '');
    return `[${main}](https://github.com/${context.repo.owner}/${context.repo.repo}/blob/${context.sha}/${main})`;
}
