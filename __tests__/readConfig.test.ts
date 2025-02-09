import * as fs from 'fs';
import { readConfig, readJSONSync } from '../src/readConfig';

jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs');
    return {
        ...actualFs,
        existsSync: jest.fn(),
        readFileSync: jest.fn(),
        promises: {
            ...actualFs.promises,
            access: jest.fn()
        }
    };
});
jest.mock('@actions/core');

describe('readJSONSync', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('reads JSON files correctly', () => {
        (fs.readFileSync as jest.Mock).mockReturnValue('{"key": "value"}');
        const result = readJSONSync<{ key: string }>('test.json');
        expect(result).toEqual({ key: 'value' });
    });

    it('reads YAML files correctly', () => {
        (fs.readFileSync as jest.Mock).mockReturnValue('key: value');
        const result = readJSONSync<{ key: string }>('test.yaml');
        expect(result).toEqual({ key: 'value' });
    });

    it('throws error on unsupported file extensions', () => {
        expect(() => readJSONSync('test.txt')).toThrow('Unsupported file extension: txt');
    });
});

describe('readConfig', () => {
    const defaultOptions = { key1: 'value1' };
    const configName = 'testConfig.json';
    const workspace = './test'; // workspace is not the same path as configFile
    const defaultConfigName = 'defaultConfig.json';

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('returns default options when no config exists', () => {
        (fs.existsSync as jest.Mock).mockReturnValueOnce(false).mockReturnValueOnce(false);
        const result = readConfig(defaultOptions, configName, workspace, defaultConfigName);
        expect(result).toEqual(defaultOptions);
    });

    it('merges configFile data with defaultOptions', () => {
        (fs.existsSync as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(false);
        (fs.readFileSync as jest.Mock).mockReturnValueOnce(JSON.stringify({ key2: 'value2', key1: 'updated' }));
        const result = readConfig(defaultOptions, configName, workspace, defaultConfigName);
        expect(result).toEqual({
            key1: 'updated',
            key2: 'value2'
        });
    });

    it('merges workspaceConfig data with defaultOptions and configFile', () => {
        (fs.existsSync as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(true);
        (fs.readFileSync as jest.Mock)
            .mockReturnValueOnce(JSON.stringify({ key2: 'value2', sharedKey: 'configValue' }))
            .mockReturnValueOnce(JSON.stringify({ key3: 'value3', sharedKey: 'workspaceValue' }));

        const result = readConfig(defaultOptions, configName, workspace, defaultConfigName);
        expect(result).toEqual({
            key1: 'value1',
            key2: 'value2',
            key3: 'value3',
            sharedKey: 'workspaceValue'
        });
    });

    it('merges array values from configFile and workspaceConfig without duplicates', () => {
        (fs.existsSync as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(true);
        (fs.readFileSync as jest.Mock)
            .mockReturnValueOnce(JSON.stringify({ arrayKey: [1, 2, 3] }))
            .mockReturnValueOnce(JSON.stringify({ arrayKey: [3, 4, 5] }));

        const result = readConfig(defaultOptions, configName, workspace, defaultConfigName);
        expect(result).toEqual({
            key1: 'value1',
            arrayKey: [1, 2, 3, 4, 5]
        });
    });
});
