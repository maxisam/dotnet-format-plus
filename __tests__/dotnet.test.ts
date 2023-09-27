import * as core from '@actions/core';
import { REPORT_PATH } from '../src/common';
import { generateFormatCommandArgs } from '../src/dotnet';
import { IDotnetFormatConfig } from '../src/modals';

jest.mock('@actions/core');

describe('generateFormatCommandArgs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (core.info as jest.Mock).mockImplementation(message => {
            console.log(`Mocked info: ${message}`);
        });
        (core.setFailed as jest.Mock).mockImplementation(message => {
            console.log(`Mocked setFailed: ${message}`);
        });
    });

    it('should return an empty array if workspace is not specified', async () => {
        const config = {};
        const workspace = '';
        const getFilesToCheck = jest.fn();
        const result = await generateFormatCommandArgs(config, workspace, getFilesToCheck);
        expect(result).toEqual([]);
        expect(core.setFailed).toHaveBeenCalledWith('Specify PROJECT | SOLUTION, .sln or .csproj');
    });

    it('should return an array with format command if options are enabled', async () => {
        const workspace = '/path/to/workspace';
        const config: IDotnetFormatConfig = {
            projectFileName: 'test.csproj',
            onlyChangedFiles: false,
            options: {
                isEabled: true,
                verbosity: 'normal',
                noRestore: true,
                folder: false,
                severity: 'error',
                verifyNoChanges: true
            }
        };
        const getFilesToCheck = jest.fn();
        const result = await generateFormatCommandArgs(config, workspace, getFilesToCheck);
        expect(result).toEqual([
            [
                'format',
                '/path/to/workspace/test.csproj',
                '--verify-no-changes',
                '--verbosity',
                config.options?.verbosity,
                '--no-restore',
                '--severity',
                config.options?.severity,
                '--report',
                `${REPORT_PATH}/dotnet-format.json`
            ]
        ]);
    });

    it('should return an array with sub commands if options are enabled', async () => {
        const workspace = '/path/to/workspace';
        const config: IDotnetFormatConfig = {
            projectFileName: 'test.csproj',
            onlyChangedFiles: false,
            styleOptions: {
                isEabled: true,
                verbosity: 'normal',
                noRestore: true,
                folder: false,
                severity: 'warn',
                verifyNoChanges: true
            },
            analyzersOptions: {
                isEabled: true,
                verbosity: 'detailed',
                noRestore: true,
                folder: true,
                severity: 'error',
                verifyNoChanges: true
            },
            whitespaceOptions: {
                isEabled: true,
                verbosity: 'diagnostic',
                noRestore: true,
                folder: true,
                severity: 'warn',
                verifyNoChanges: false
            }
        };
        const getFilesToCheck = jest.fn();
        const result = await generateFormatCommandArgs(config, workspace, getFilesToCheck);
        expect(result).toEqual([
            [
                'format',
                'whitespace',
                '/path/to/workspace/test.csproj',
                '--folder',
                '--verbosity',
                config.whitespaceOptions?.verbosity,
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
                config.analyzersOptions?.verbosity,
                '--no-restore',
                '--severity',
                config.analyzersOptions?.severity,
                '--report',
                `${REPORT_PATH}/analyzers-format.json`
            ],
            [
                'format',
                'style',
                '/path/to/workspace/test.csproj',
                '--verify-no-changes',
                '--verbosity',
                config.styleOptions?.verbosity,
                '--no-restore',
                '--severity',
                config.styleOptions?.severity,
                '--report',
                `${REPORT_PATH}/style-format.json`
            ]
        ]);
    });
});
