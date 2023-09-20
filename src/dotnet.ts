import * as core from '@actions/core';
import { context } from '@actions/github';

import * as fs from 'fs';
import { inspect } from 'util';
import { REPORT_PATH } from './common';
import { execute } from './execute';
import { FormatOptions, FormatResult, ReportItem } from './modals';

export const ANNOTATION_OPTIONS = {
    title: 'DOTNET FORMAT Check'
};
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

function buildFormatCommandArgsVariants(options: FormatOptions): string[][] {
    const dotnetFormatOptions: string[][] = [];
    if (
        !options.skipFixWhitespace &&
        !options.skipFixAnalyzers &&
        !options.skipFixStyle &&
        options.styleSeverityLevel === options.analyzersSeverityLevel
    ) {
        return [['format']];
    }
    if (!options.skipFixWhitespace) {
        dotnetFormatOptions.push(['format', 'whitespace']);
    }
    if (!options.skipFixAnalyzers) {
        dotnetFormatOptions.push(['format', 'analyzers', '--severity', options.analyzersSeverityLevel]);
    }
    if (!options.skipFixStyle) {
        dotnetFormatOptions.push(['format', 'style', '--severity', options.styleSeverityLevel]);
    }
    if (dotnetFormatOptions.length) {
        return dotnetFormatOptions;
    } else {
        core.warning('All fix options are disabled. Falling back to default format command', ANNOTATION_OPTIONS);
        return [['format']];
    }
}

export async function buildFormatCommandArgs(options: FormatOptions, getFilesToCheck: () => Promise<string[]>): Promise<string[][]> {
    const dotnetFormatOptions: string[] = [];

    if (options.workspace) {
        dotnetFormatOptions.push(options.workspace);
    } else {
        core.setFailed('Specify PROJECT | SOLUTION, .sln or .csproj');
        return [];
    }

    options.dryRun && dotnetFormatOptions.push('--verify-no-changes');
    if (formatOnlyChangedFiles(options.onlyChangedFiles) && context.eventName === 'pull_request') {
        const filesToCheck = await getFilesToCheck();
        core.debug(`filesToCheck: ${inspect(filesToCheck)}`);
        core.info(`Checking ${filesToCheck.length} files`);

        if (!filesToCheck.length) {
            core.warning('No files found for formatting', ANNOTATION_OPTIONS);
        }

        // this doesn't work other than whitespace check
        dotnetFormatOptions.push('--folder', '--include', filesToCheck.join(' '));
    }

    !!options.exclude && dotnetFormatOptions.push('--exclude', options.exclude);
    dotnetFormatOptions.push('--verbosity', options.logLevel);
    const dotnetFormatOptionsGroups = buildFormatCommandArgsVariants(options);
    return dotnetFormatOptionsGroups.map(option => {
        if (option.length === 1) {
            return [...option, ...dotnetFormatOptions, '--report', `${REPORT_PATH}/dotnet-format.json`];
        } else {
            return [...option, ...dotnetFormatOptions, '--report', `${REPORT_PATH}/${option[1]}-format.json`];
        }
    });
}

export function setDotnetEnvironmentVariables(): void {
    process.env.DOTNET_CLI_TELEMETRY_OPTOUT = 'true';
    process.env.DOTNET_NOLOGO = 'true';
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
