import * as core from '@actions/core';
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
            .mockReturnValueOnce(JSON.stringify({ setting1: 'value1', array: ['item1'] }))
            .mockReturnValueOnce(JSON.stringify({ setting2: 'value2', array: ['item2'] }));
        const result = readConfig('mockConfigPath', 'mockWorkspacePath', '.jscpd.json');
        expect(result).toEqual({
            config: resolve('mockWorkspacePath', 'mockConfigPath'),
            setting1: 'value1',
            setting2: 'value2',
            // the order of the array items is flipped because the workspaceConfig is merged last
            array: ['item2', 'item1']
        });
    });

    it('should read config only from configFile', () => {
        (fs.existsSync as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(false);
        (fs.readFileSync as jest.Mock).mockReturnValueOnce(JSON.stringify({ setting1: 'value1' }));
        const result = readConfig('mockConfigPath', 'mockWorkspacePath', '.jscpd.json');
        expect(result).toEqual({
            config: resolve('mockConfigPath'),
            setting1: 'value1'
        });
    });
});
