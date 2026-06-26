import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REPORT_PATH } from '../src/common.ts';
import { generateFormatCommandArgs } from '../src/dotnet.ts';
import type { IDotnetFormatConfig } from '../src/modals.ts';

// Capture stdout for the duration of fn so the GitHub Actions commands emitted
// by @actions/core (e.g. ::error::) can be asserted without mocking the module.
function captureStdout(fn: () => void): string {
    const original = process.stdout.write.bind(process.stdout);
    let out = '';
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
        out += chunk.toString();
        return true;
    }) as typeof process.stdout.write;
    try {
        fn();
    } finally {
        process.stdout.write = original;
    }
    return out;
}

describe('generateFormatCommandArgs', () => {
    it('returns an empty array and fails when workspace is not specified', () => {
        const previousExitCode = process.exitCode;
        let result: string[][] = [];
        const out = captureStdout(() => {
            result = generateFormatCommandArgs({}, '', []);
        });
        // core.setFailed sets process.exitCode; reset it so the test run is clean.
        process.exitCode = previousExitCode;

        assert.deepEqual(result, []);
        assert.match(out, /Specify PROJECT \| SOLUTION/);
    });

    it('returns an array with format command if options are enabled', () => {
        const workspace = '/path/to/workspace';
        const config: IDotnetFormatConfig = {
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
        const result = generateFormatCommandArgs(config, workspace, []);
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
                `${REPORT_PATH}/dotnet-format.json`
            ]
        ]);
    });

    it('returns an array with sub commands if options are enabled', () => {
        const workspace = '/path/to/workspace';
        const config: IDotnetFormatConfig = {
            projectFileName: 'test.csproj',
            onlyChangedFiles: false,
            styleOptions: {
                isEnabled: true,
                verbosity: 'normal',
                noRestore: true,
                folder: false,
                severity: 'warn',
                verifyNoChanges: true
            },
            analyzersOptions: {
                isEnabled: true,
                verbosity: 'detailed',
                noRestore: true,
                folder: true,
                severity: 'error',
                verifyNoChanges: true
            },
            whitespaceOptions: {
                isEnabled: true,
                verbosity: 'diagnostic',
                noRestore: true,
                folder: true,
                severity: 'warn',
                verifyNoChanges: false
            }
        };
        const result = generateFormatCommandArgs(config, workspace, []);
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
                `${REPORT_PATH}/whitespace-format.json`
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
                `${REPORT_PATH}/analyzers-format.json`
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
                `${REPORT_PATH}/style-format.json`
            ]
        ]);
    });

    it('treats the legacy isEabled key as enabled (backward compatibility)', () => {
        const workspace = '/path/to/workspace';
        const config = {
            projectFileName: 'test.csproj',
            onlyChangedFiles: false,
            options: {
                isEabled: true,
                verbosity: 'normal',
                noRestore: true,
                severity: 'error',
                verifyNoChanges: true
            }
        } as IDotnetFormatConfig;
        const result = generateFormatCommandArgs(config, workspace, []);
        assert.equal(result.length, 1);
        assert.equal(result[0][0], 'format');
        assert.equal(result[0][1], '/path/to/workspace/test.csproj');
    });
});
