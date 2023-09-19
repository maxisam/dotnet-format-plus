import { info, notice } from '@actions/core';
import { context } from '@actions/github';
import { IClone, IOptions } from '@jscpd/core';
import { Octokit } from '@octokit/rest';
import { error } from 'console';
import * as fs from 'fs';
import { readJSONSync } from 'fs-extra';
import { detectClones } from 'jscpd';
import { resolve } from 'path';
import { execute } from './execute';
import * as git from './git';
export const REPORT_ARTIFACT_NAME = 'jscpd-report';

export async function duplicatedCheck(workspace: string, jscpdConfigPath: string, githubClient: InstanceType<typeof Octokit>): Promise<void> {
    const cwd = process.cwd();
    const path = checkWorkspace(workspace);
    const clones = await jscpdCheck(path, jscpdConfigPath);
    if (clones.length > 0) {
        error('❌ DUPLICATED CODE FOUND');
        showNotice(clones, cwd);
        const reportFiles = getReportFiles(cwd);
        const markdownReport = reportFiles.find(file => file.endsWith('.md')) as string;
        await git.UploadReportToArtifacts([markdownReport], REPORT_ARTIFACT_NAME);
        await Comment(githubClient, markdownReport, clones);
        await execute(`rm -rf ${cwd}/${REPORT_ARTIFACT_NAME}`);
    } else {
        info('✅✅✅✅✅ NO DUPLICATED CODE FOUND ✅✅✅✅✅');
    }
}

export async function jscpdCheck(workspace: string, jscpdConfigPath: string): Promise<IClone[]> {
    const cwd = process.cwd();
    // read config from file
    const configOptions = readConfig(jscpdConfigPath);
    const defaultOptions = {
        path: [`${workspace}`],
        reporters: ['html', 'markdown', 'consoleFull'],
        output: `${cwd}/${REPORT_ARTIFACT_NAME}`
    };
    const options = { ...configOptions, ...defaultOptions };
    const clones = await detectClones(options);

    return clones;
}

function readConfig(config: string): Partial<IOptions> {
    const configFile: string = config ? resolve(config) : resolve('.jscpd.json');
    const configExists = fs.existsSync(configFile);
    if (configExists) {
        const result = { config: configFile, ...readJSONSync(configFile) };
        if (result.path) {
            // the path should comes from the action workspace
            delete result.path;
        }
        return result;
    }
    return {};
}

function getReportFiles(cwd: string): string[] {
    const files = fs.readdirSync(`${cwd}/${REPORT_ARTIFACT_NAME}`, {
        recursive: true
    }) as string[];
    const filePaths = files.map(file => `${cwd}/${REPORT_ARTIFACT_NAME}/${file}`);
    info(`reportFiles: ${filePaths.join(',')}`);
    return filePaths;
}

function checkWorkspace(workspace: string): string {
    info(`workspace: ${workspace}`);
    //check if workspace path is a file
    const isFile = fs.existsSync(workspace) && fs.lstatSync(workspace).isFile();
    if (isFile) {
        // if it is a file, get the directory
        return workspace.substring(0, workspace.lastIndexOf('/'));
    }
    return workspace;
}

function showNotice(clones: IClone[], cwd: string): void {
    for (const clone of clones) {
        notice(
            `${clone.duplicationA.sourceId.replace(cwd, '')} (${clone.duplicationA.start.line}-${clone.duplicationA.end.line})
            and ${clone.duplicationB.sourceId.replace(cwd, '')} (${clone.duplicationB.start.line}-${clone.duplicationB.end.line})`,
            {
                title: '❌ Duplicated code',
                file: clone.duplicationA.sourceId,
                startLine: clone.duplicationA.start.line,
                endLine: clone.duplicationA.end.line
            }
        );
    }
}

async function Comment(githubClient: InstanceType<typeof Octokit>, markdownReport: string, clones: IClone[]): Promise<boolean> {
    const report = fs.readFileSync(markdownReport, 'utf8');
    const cwd = process.cwd();
    let markdown = '<details>\n';
    markdown += ` <summary> JSCPD Details </summary>\n\n`;
    for (const c of clones) {
        markdown += `- **${c.duplicationA.sourceId.split('/').pop()}** & **${c.duplicationB.sourceId.split('/').pop()}**\n`;
        markdown += `  - ${toGithubLink(c.duplicationA.sourceId, cwd, c.duplicationA.range)}\n`;
        markdown += `  - ${toGithubLink(c.duplicationB.sourceId, cwd, c.duplicationB.range)}\n`;
        markdown += '\n';
    }
    markdown += '</details>\n';
    const message = `❌ DUPLICATED CODE FOUND \n\n${report}\n\n ${markdown}`;
    return await git.comment(githubClient, message);
}

function toGithubLink(path: string, cwd: string, range: [number, number]): string {
    const main = path.replace(`${cwd}/`, '');
    return `[${main}#L${range[0]}-L${range[1]}](https://github.com/${context.repo.owner}/${context.repo.repo}/blob/${context.sha}/${main}#L${range[0]}-L${range[1]})`;
}
