// github-script wrapper (Phase 3, T6+T7): resolve the dotnet format config, fold in
// the PR changed-files lookup, and write the normalized run plan to
// $RUNNER_TEMP/df-config.json for the shell runner. Receives github-script's
// { github, context, core, exec, io }; all action inputs arrive via env (composite
// actions don't expose inputs to core.getInput).

import * as fs from 'node:fs';
import path from 'node:path';
import { buildDefaultOptions, planFormat } from '../format-args.mjs';
import { resolveConfig } from '../read-config.mjs';
import { makeLoader } from './load-config.mjs';

// Mirrors includedFileTypes from src/const.ts.
const INCLUDED_FILE_TYPES = ['.cs', '.vb', '.cspoj', '.vbproj', '.fs', '.fsproj', '.cshtml', '.vbhtml'];
const ANNOTATION = { title: 'DOTNET FORMAT Check' };

/**
 * @param {{ github: any, context: any, core: any, exec: any, io: any }} ctx
 */
export async function run({ github, context, core, exec, io }) {
    const env = process.env;
    const inputs = {
        action: env.ACTION,
        severityLevel: env.SEVERITY_LEVEL,
        logLevel: env.LOG_LEVEL,
        nugetConfigPath: env.NUGET_CONFIG_PATH || '',
        dotnetFormatConfigPath: env.DOTNET_FORMAT_CONFIG_PATH || '',
        projectFileName: env.PROJECT_FILE_NAME || '',
        onlyChangedFiles: env.ONLY_CHANGED_FILES === 'true',
        workspace: env.WORKSPACE || ''
    };

    const loadObject = makeLoader(exec, io);
    const defaults = buildDefaultOptions(inputs);
    const merged = await resolveConfig(defaults, inputs.dotnetFormatConfigPath, inputs.workspace, '.dotnet-format.json', loadObject);

    // Changed files (folds in T7): only on PR/issue_comment events when requested.
    const isOnlyChangedFiles = inputs.onlyChangedFiles && ['pull_request', 'issue_comment'].includes(context.eventName);
    let changedFiles = [];
    let skipped = false;
    if (isOnlyChangedFiles) {
        if (!context.issue.number) {
            throw new Error('Unable to get pull request number from action event');
        }
        const files = await github.paginate(github.rest.pulls.listFiles, {
            ...context.repo,
            pull_number: context.issue.number
        });
        changedFiles = files
            .filter(f => f.status !== 'removed')
            .filter(f => INCLUDED_FILE_TYPES.includes(path.extname(f.filename)))
            .map(f => f.filename);
        core.info(`🔍 Checking ${changedFiles.length} changed files`);
        if (!changedFiles.length) {
            // Matches the original: nothing to format -> treat as success, run nothing.
            core.warning('No files found for formatting', ANNOTATION);
            skipped = true;
        }
    }

    const reportDir = path.join(process.cwd(), '.dotnet-format');
    const { commands, isDryRun } = skipped
        ? { commands: [], isDryRun: true }
        : planFormat(merged, { workspace: inputs.workspace, changedFiles, isOnlyChangedFiles, reportDir });

    const plan = {
        workspace: inputs.workspace,
        nugetConfigPath: inputs.nugetConfigPath,
        reportDir,
        isDryRun,
        onlyChangedFiles: isOnlyChangedFiles,
        changedFilesCount: changedFiles.length,
        skipped,
        commands
    };

    const planPath = path.join(env.RUNNER_TEMP || process.cwd(), 'df-config.json');
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
    core.setOutput('planPath', planPath);
    core.startGroup('🔎 Dotnet Format Plan');
    core.info(JSON.stringify(plan, null, 2));
    core.endGroup();
}
