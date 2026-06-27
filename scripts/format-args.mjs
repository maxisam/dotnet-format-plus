// dotnet format planning, ported 1:1 from src/dotnet.ts (generateFormatCommandArgs,
// buildArgs, isEnabledBlock) and src/format.ts (getOptions defaults, resolveEnabled,
// checkIsDryRun). Pure / dependency-free: takes inputs + already-merged config and
// emits ready-to-run `dotnet` argv arrays, so the shell runner never builds args
// (and never has to quote `--include` lists in bash).

import path from 'node:path';
import process from 'node:process';

/** Mirrors REPORT_PATH from src/common.ts (computed from cwd at load time). */
export const DEFAULT_REPORT_DIR = `${process.cwd()}/.dotnet-format`;

const FormatType = {
    all: 'all',
    style: 'style',
    analyzers: 'analyzers',
    whitespace: 'whitespace'
};

/**
 * Resolve whether a format block is enabled via its `isEnabled` key.
 * @param {Record<string, any> | undefined} block
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
export function isEnabledBlock(block, defaultValue) {
    return block?.isEnabled ?? defaultValue;
}

/**
 * @param {Record<string, any> | undefined} block
 * @param {boolean} defaultValue
 */
function resolveEnabled(block, defaultValue) {
    if (block) {
        block.isEnabled = block.isEnabled ?? defaultValue;
    }
}

/**
 * Build the dotnet format flags for one block.
 * @param {Record<string, any>} options
 * @param {boolean} onlyChangedFiles
 * @param {string[]} changedFiles
 * @param {string} type
 * @returns {string[]}
 */
function buildArgs(options, onlyChangedFiles, changedFiles, type) {
    /** @type {string[]} */
    const args = [];
    if (options.verifyNoChanges) {
        args.push('--verify-no-changes');
    }
    if (type === FormatType.whitespace && options.folder) {
        args.push('--folder');
    }
    const includes = onlyChangedFiles && changedFiles.length ? [...changedFiles, ...(options.include ?? [])] : (options.include ?? []);
    if (includes.length) {
        args.push('--include', includes.join(' '));
    }
    if (options.exclude) {
        args.push('--exclude', options.exclude.join(' '));
    }
    args.push('--verbosity', options.verbosity || 'normal');
    if (options.noRestore) {
        args.push('--no-restore');
    }
    if (type !== FormatType.whitespace) {
        args.push('--severity', options.severity || 'error');
    }
    return args;
}

/**
 * Produce the `dotnet` argv array(s) to run. Simple mode (`options`) yields a single
 * command; granular mode yields one per enabled whitespace/analyzers/style block.
 * Throws when no workspace is provided (the caller maps this to core.setFailed).
 * @param {Record<string, any>} config
 * @param {string} workspace
 * @param {string[]} [changedFiles]
 * @param {{ isOnlyChangedFiles?: boolean, reportDir?: string }} [opts]
 * @returns {string[][]}
 */
export function generateFormatCommandArgs(config, workspace, changedFiles = [], opts = {}) {
    const { isOnlyChangedFiles = false, reportDir = DEFAULT_REPORT_DIR } = opts;
    if (!workspace) {
        throw new Error('Specify PROJECT | SOLUTION, .sln or .csproj');
    }
    const projectArg = path.join(workspace, config.projectFileName || '');
    const base = `${reportDir}/`;

    if (isEnabledBlock(config.options, false)) {
        const args = buildArgs(config.options, isOnlyChangedFiles, changedFiles, FormatType.all);
        return [['format', projectArg, ...args, '--report', `${base}dotnet-format.json`]];
    }

    /** @type {Record<string, any>} */
    const mapping = {
        whitespace: config.whitespaceOptions,
        analyzers: config.analyzersOptions,
        style: config.styleOptions
    };
    /** @type {string[][]} */
    const all = [];
    for (const [type, options] of Object.entries(mapping)) {
        if (isEnabledBlock(options, false)) {
            const args = buildArgs(options, isOnlyChangedFiles, changedFiles, type);
            all.push(['format', type, projectArg, ...args, '--report', `${base}${type}-format.json`]);
        }
    }
    return all;
}

/**
 * Build the default options object derived from the action inputs (ported from
 * getOptions in src/format.ts). The enabled flag is intentionally omitted so a
 * user's `isEnabled` is not masked by a default; it is resolved afterwards.
 * @param {Record<string, any>} inputs
 * @returns {Record<string, any>}
 */
export function buildDefaultOptions(inputs) {
    // Shared per-block defaults; the blocks differ only in the two overrides below.
    const base = {
        verifyNoChanges: inputs.action === 'check',
        severity: inputs.severityLevel,
        verbosity: inputs.logLevel,
        noRestore: !!inputs.nugetConfigPath
    };
    return {
        nugetConfigPath: inputs.nugetConfigPath,
        projectFileName: inputs.projectFileName,
        onlyChangedFiles: inputs.onlyChangedFiles,
        options: { ...base },
        whitespaceOptions: { ...base, folder: true },
        analyzersOptions: { ...base },
        // Quirk preserved from the original: style keys noRestore off dotnetFormatConfigPath.
        styleOptions: { ...base, noRestore: !!inputs.dotnetFormatConfigPath }
    };
}

/**
 * Resolve the enabled flag for each block. Simple mode (`options`) defaults on; the
 * granular blocks default off. (Ported from getOptions in src/format.ts.)
 * @param {Record<string, any>} config
 * @returns {Record<string, any>}
 */
export function finalizeEnabled(config) {
    resolveEnabled(config.options, true);
    resolveEnabled(config.whitespaceOptions, false);
    resolveEnabled(config.analyzersOptions, false);
    resolveEnabled(config.styleOptions, false);
    return config;
}

/**
 * Determine whether the run is a dry run (no commit). Ported from checkIsDryRun in
 * src/format.ts.
 * @param {Record<string, any>} config
 * @returns {boolean}
 */
export function checkIsDryRun(config) {
    if (isEnabledBlock(config.options, false)) {
        return config.options?.verifyNoChanges ?? false;
    }
    // A granular block is "dry" when it is disabled, or enabled and verifying no
    // changes — i.e. `(enabled && verify) || !enabled` simplifies to `!enabled || verify`.
    const dry = block => !isEnabledBlock(block, false) || !!block?.verifyNoChanges;
    return dry(config.whitespaceOptions) && dry(config.analyzersOptions) && dry(config.styleOptions);
}

/**
 * Convenience: finalize a merged config and emit everything the runner needs.
 * @param {Record<string, any>} mergedConfig
 * @param {{ workspace: string, changedFiles?: string[], isOnlyChangedFiles?: boolean, reportDir?: string }} opts
 * @returns {{ commands: string[][], isDryRun: boolean }}
 */
export function planFormat(mergedConfig, opts) {
    const { workspace, changedFiles = [], isOnlyChangedFiles = false, reportDir = DEFAULT_REPORT_DIR } = opts;
    const config = finalizeEnabled(mergedConfig);
    const commands = generateFormatCommandArgs(config, workspace, changedFiles, { isOnlyChangedFiles, reportDir });
    const isDryRun = checkIsDryRun(config);
    return { commands, isDryRun };
}
