import { info, notice } from '@actions/core';
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
    notice(clones.join('\n'));
    const reportFiles = [`${cwd}/${REPORT_ARTIFACT_NAME}.md`, `${cwd}/${REPORT_ARTIFACT_NAME}.html`];
    await git.UploadReportToArtifacts(reportFiles, REPORT_ARTIFACT_NAME);
    const report = fs.readFileSync(`${cwd}/${REPORT_ARTIFACT_NAME}.md`, 'utf8');
    await git.comment(githubClient, `❌ DUPLICATED CODE FOUND \n\n${report}`);
    await execute(`rm -f ${cwd}/${REPORT_ARTIFACT_NAME}.*`);
  } else {
    info('✅✅✅✅✅ NO DUPLICATED CODE FOUND ✅✅✅✅✅');
  }
}

export async function jscpdCheck(workspace: string, jscpdConfigPath: string): Promise<IClone[]> {
  const cwd = process.cwd();
  // read config from file
  const configOptions = readConfig(jscpdConfigPath);
  const defaultOptions = {
    path: [`${cwd}/${workspace}`],
    reporters: ['html', 'markdown', 'consoleFull'],
    reportersOptions: {
      html: {
        output: `${cwd}/${REPORT_ARTIFACT_NAME}.html`
      },
      markdown: {
        output: `${cwd}/${REPORT_ARTIFACT_NAME}.md`
      }
    }
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
function checkWorkspace(workspace: string): string {
  //check if workspace path is a file
  const isFile = fs.existsSync(workspace) && fs.lstatSync(workspace).isFile();
  if (isFile) {
    // if it is a file, get the directory
    return workspace.substring(0, workspace.lastIndexOf('/'));
  }
  return workspace;
}
