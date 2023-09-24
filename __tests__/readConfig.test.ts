import * as core from '@actions/core';
import { IOptions } from '@jscpd/core';
import * as fs from 'fs';
import { resolve } from 'path';
import { readConfig } from '../src/readConfig';
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    promises: {
        access: jest.fn()
    }
}));
jest.mock('@actions/core');

describe('readConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (core.warning as jest.Mock).mockImplementation(message => {
            console.log(`Mocked warning: ${message}`);
        });
    });

    it('should read and merge config from both configFile and workspaceConfig', () => {
        (fs.existsSync as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(true);
        (fs.readFileSync as jest.Mock)
            .mockReturnValueOnce(JSON.stringify({ executionId: 'value1', ignore: ['item1'] }))
            .mockReturnValueOnce(JSON.stringify({ maxSize: 'value2', ignore: ['item2'] }));
        const result = readConfig<IOptions>('mockConfigPath', 'mockWorkspacePath', '.jscpd.json');
        expect(result).toEqual({
            config: resolve('mockWorkspacePath', '.jscpd.json'),
            executionId: 'value1',
            maxSize: 'value2',
            // the order of the array items is flipped because the workspaceConfig is merged last
            ignore: ['item1', 'item2']
        });
    });

    it('should read config only from configFile', () => {
        (fs.existsSync as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(false);
        (fs.readFileSync as jest.Mock).mockReturnValueOnce(JSON.stringify({ maxSize: 'value1' }));
        const result = readConfig<IOptions>('mockConfigPath', 'mockWorkspacePath', '.jscpd.json');
        expect(result).toEqual({
            config: resolve('mockConfigPath'),
            maxSize: 'value1'
        });
    });
});
