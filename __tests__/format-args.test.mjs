import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildDefaultOptions,
    checkIsDryRun,
    DEFAULT_REPORT_DIR,
    finalizeEnabled,
    generateFormatCommandArgs,
    isEnabledBlock,
    planFormat
} from '../scripts/format-args.mjs';

describe('isEnabledBlock', () => {
    it('reads isEnabled, otherwise the default', () => {
        assert.equal(isEnabledBlock({ isEnabled: true }, false), true);
        assert.equal(isEnabledBlock({ isEnabled: false }, true), false);
        assert.equal(isEnabledBlock(undefined, true), true);
        assert.equal(isEnabledBlock({}, false), false);
    });
});

describe('generateFormatCommandArgs', () => {
    it('throws when workspace is not specified', () => {
        assert.throws(() => generateFormatCommandArgs({}, '', []), /Specify PROJECT \| SOLUTION/);
    });

    it('returns a single format command when options are enabled', () => {
        const config = {
            projectFileName: 'test.csproj',
            onlyChangedFiles: false,
            options: {
                isEnabled: true,
                verbosity: 'normal',
                noRestore: true,
                folder: false,
                severity: 'error',
                verifyNoChanges: true
            }
        };
        const result = generateFormatCommandArgs(config, '/path/to/workspace', []);
        assert.deepEqual(result, [
            [
                'format',
                '/path/to/workspace/test.csproj',
                '--verify-no-changes',
                '--verbosity',
                'normal',
                '--no-restore',
                '--severity',
                'error',
                '--report',
                `${DEFAULT_REPORT_DIR}/dotnet-format.json`
            ]
        ]);
    });

    it('returns sub-commands for granular blocks', () => {
        const config = {
            projectFileName: 'test.csproj',
            onlyChangedFiles: false,
            styleOptions: { isEnabled: true, verbosity: 'normal', noRestore: true, folder: false, severity: 'warn', verifyNoChanges: true },
            analyzersOptions: { isEnabled: true, verbosity: 'detailed', noRestore: true, folder: true, severity: 'error', verifyNoChanges: true },
            whitespaceOptions: { isEnabled: true, verbosity: 'diagnostic', noRestore: true, folder: true, severity: 'warn', verifyNoChanges: false }
        };
        const result = generateFormatCommandArgs(config, '/path/to/workspace', []);
        assert.deepEqual(result, [
            [
                'format',
                'whitespace',
                '/path/to/workspace/test.csproj',
                '--folder',
                '--verbosity',
                'diagnostic',
                '--no-restore',
                '--report',
                `${DEFAULT_REPORT_DIR}/whitespace-format.json`
            ],
            [
                'format',
                'analyzers',
                '/path/to/workspace/test.csproj',
                '--verify-no-changes',
                '--verbosity',
                'detailed',
                '--no-restore',
                '--severity',
                'error',
                '--report',
                `${DEFAULT_REPORT_DIR}/analyzers-format.json`
            ],
            [
                'format',
                'style',
                '/path/to/workspace/test.csproj',
                '--verify-no-changes',
                '--verbosity',
                'normal',
                '--no-restore',
                '--severity',
                'warn',
                '--report',
                `${DEFAULT_REPORT_DIR}/style-format.json`
            ]
        ]);
    });

    it('prepends changed files to --include when onlyChangedFiles is active', () => {
        const config = {
            projectFileName: '',
            options: { isEnabled: true, verbosity: 'normal', include: ['keep.cs'], verifyNoChanges: false }
        };
        const result = generateFormatCommandArgs(config, '/ws', ['a.cs', 'b.cs'], { isOnlyChangedFiles: true });
        const includeIdx = result[0].indexOf('--include');
        assert.equal(result[0][includeIdx + 1], 'a.cs b.cs keep.cs');
    });
});

describe('buildDefaultOptions', () => {
    it('sets verifyNoChanges from the check action and mirrors severity/verbosity', () => {
        const opts = buildDefaultOptions({
            action: 'check',
            severityLevel: 'warn',
            logLevel: 'detailed',
            nugetConfigPath: '',
            dotnetFormatConfigPath: '.dotnet-format.json',
            projectFileName: 'X.sln',
            onlyChangedFiles: false
        });
        assert.equal(opts.options.verifyNoChanges, true);
        assert.equal(opts.whitespaceOptions.folder, true);
        assert.equal(opts.options.noRestore, false);
        // style noRestore keys off dotnetFormatConfigPath (preserved quirk)
        assert.equal(opts.styleOptions.noRestore, true);
        // enabled flags are intentionally omitted until finalizeEnabled
        assert.equal('isEnabled' in opts.options, false);
    });
});

describe('finalizeEnabled', () => {
    it('defaults simple mode on and granular blocks off', () => {
        const config = finalizeEnabled({ options: {}, whitespaceOptions: {}, analyzersOptions: {}, styleOptions: {} });
        assert.equal(config.options.isEnabled, true);
        assert.equal(config.whitespaceOptions.isEnabled, false);
        assert.equal(config.analyzersOptions.isEnabled, false);
        assert.equal(config.styleOptions.isEnabled, false);
    });
});

describe('checkIsDryRun', () => {
    it('returns options.verifyNoChanges in simple mode', () => {
        assert.equal(checkIsDryRun({ options: { isEnabled: true, verifyNoChanges: true } }), true);
        assert.equal(checkIsDryRun({ options: { isEnabled: true, verifyNoChanges: false } }), false);
    });

    it('is a dry run only when every enabled granular block verifies no changes', () => {
        assert.equal(checkIsDryRun({ whitespaceOptions: { isEnabled: true, verifyNoChanges: true } }), true);
        assert.equal(checkIsDryRun({ whitespaceOptions: { isEnabled: true, verifyNoChanges: false } }), false);
        assert.equal(
            checkIsDryRun({
                whitespaceOptions: { isEnabled: true, verifyNoChanges: true },
                analyzersOptions: { isEnabled: true, verifyNoChanges: false }
            }),
            false
        );
    });
});

describe('planFormat', () => {
    it('finalizes config, builds commands, and reports dry run', () => {
        const { commands, isDryRun } = planFormat(
            { projectFileName: 'A.sln', options: { verifyNoChanges: true, verbosity: 'normal', severity: 'error' } },
            { workspace: '/ws' }
        );
        assert.equal(isDryRun, true);
        assert.equal(commands.length, 1);
        assert.equal(commands[0][1], '/ws/A.sln');
    });
});
