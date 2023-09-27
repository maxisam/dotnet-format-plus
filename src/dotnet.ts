import * as core from '@actions/core';
import { context } from '@actions/github';

import * as fs from 'fs';
import path from 'path';
import { inspect } from 'util';
import { REPORT_PATH } from './common';
import { execute } from './execute';
import { FormatResult, FormatType, IDotnetFormatArgs, IDotnetFormatConfig, ReportItem } from './modals';

export const ANNOTATION_OPTIONS = {
    title: 'DOTNET FORMAT Check'
};

export function setDotnetEnvironmentVariables(): void {
    process.env.DOTNET_CLI_TELEMETRY_OPTOUT = 'true';
    process.env.DOTNET_NOLOGO = 'true';
}

function formatOnlyChangedFiles(onlyChangedFiles: boolean): boolean {
    if (onlyChangedFiles) {
        if (context.eventName === 'issue_comment' || context.eventName === 'pull_request') {
            return true;
        }
        core.warning('Formatting only changed files is available on the issue_comment and pull_request events only');
        return false;
    }
    return false;
}

export async function generateFormatCommandArgs(
    config: Partial<IDotnetFormatConfig>,
    workspace: string,
    getFilesToCheck: () => Promise<string[]>
): Promise<string[][]> {
    const dotnetFormatOptions: string[] = [];
    core.info(`loaded options: ${inspect(config)}`);

    if (workspace) {
        // TODO: check for .sln or .csproj if projectFileName is not specified
        dotnetFormatOptions.push(path.join(workspace, config.projectFileName || ''));
    } else {
        core.setFailed('Specify PROJECT | SOLUTION, .sln or .csproj');
        return [];
    }
    if (config.options && config.options.isEabled) {
        const args = await buildArgs(config.options, formatOnlyChangedFiles(config.onlyChangedFiles || false), getFilesToCheck, FormatType.all);
        return [['format', ...dotnetFormatOptions, ...args, '--report', `${REPORT_PATH}/dotnet-format.json`]];
    } else {
        const allArgs: string[][] = [];
        core.info('🔍 sub command');
        if (config.whitespaceOptions && config.whitespaceOptions.isEabled) {
            const args = await buildArgs(
                config.whitespaceOptions,
                formatOnlyChangedFiles(config.onlyChangedFiles || false),
                getFilesToCheck,
                FormatType.whitespace
            );
            allArgs.push(['format', 'whitespace', ...dotnetFormatOptions, ...args, '--report', `${REPORT_PATH}/whitespace-format.json`]);
        }
        if (config.analyzersOptions && config.analyzersOptions.isEabled) {
            const args = await buildArgs(
                config.analyzersOptions,
                formatOnlyChangedFiles(config.onlyChangedFiles || false),
                getFilesToCheck,
                FormatType.analyzers
            );
            allArgs.push(['format', 'analyzers', ...dotnetFormatOptions, ...args, '--report', `${REPORT_PATH}/analyzers-format.json`]);
        }
        if (config.styleOptions && config.styleOptions.isEabled) {
            const args = await buildArgs(
                config.styleOptions,
                formatOnlyChangedFiles(config.onlyChangedFiles || false),
                getFilesToCheck,
                FormatType.style
            );
            allArgs.push(['format', 'style', ...dotnetFormatOptions, ...args, '--report', `${REPORT_PATH}/style-format.json`]);
        }
        return allArgs;
    }
}
async function buildArgs(
    options: IDotnetFormatArgs,
    onlyChangedFiles: boolean,
    getFilesToCheck: () => Promise<string[]>,
    type: FormatType
): Promise<string[]> {
    const dotnetFormatOptions: string[] = [];

    options?.verifyNoChanges && dotnetFormatOptions.push('--verify-no-changes');
    if (type === FormatType.whitespace && options.folder) {
        dotnetFormatOptions.push('--folder');
    }
    if (onlyChangedFiles) {
        const filesToCheck = await getFilesToCheck();
        core.debug(`filesToCheck: ${inspect(filesToCheck)}`);
        core.info(`🔍 Checking ${filesToCheck.length} files`);

        if (!filesToCheck.length) {
            core.warning('No files found for formatting', ANNOTATION_OPTIONS);
        }

        // this doesn't work other than whitespace check
        dotnetFormatOptions.push('--include', filesToCheck.join(' '));
    }
    !!options?.exclude && dotnetFormatOptions.push('--exclude', options.exclude.join(' '));
    dotnetFormatOptions.push('--verbosity', options?.verbosity || 'normal');
    options.noRestore && dotnetFormatOptions.push('--no-restore');

    if (type !== FormatType.whitespace) {
        dotnetFormatOptions.push('--severity', options?.severity || 'error');
    }
    return dotnetFormatOptions;
}

export async function execFormat(formatArgs: string[]): Promise<FormatResult> {
    const { stdout, stderr } = await execute('dotnet', process.cwd(), formatArgs, false, true);
    // dotnet format returns non-zero exit code if there are formatting issues
    // but we don't want to fail the action in this case
    // stdout will always end with Format complete ...
    // stderr will be empty if there are no formatting issues

    const result = stdout[stdout.length - 1].includes('Format complete');
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
    return reportPaths.filter(path => fs.existsSync(path) && fs.statSync(path).size > 2);
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

function toGithubLink(path: string, cwd: string): string {
    const main = path.replace(`${cwd}/`, '');
    return `[${main}](https://github.com/${context.repo.owner}/${context.repo.repo}/blob/${context.sha}/${main})`;
}
