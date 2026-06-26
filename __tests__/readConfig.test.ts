import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readConfig, readJSONSync } from '../src/readConfig.ts';

describe('readJSONSync', () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-json-'));
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('reads JSON files correctly', () => {
        const file = path.join(dir, 'test.json');
        fs.writeFileSync(file, '{"key": "value"}');
        assert.deepEqual(readJSONSync<{ key: string }>(file), { key: 'value' });
    });

    it('reads YAML files correctly', () => {
        const file = path.join(dir, 'test.yaml');
        fs.writeFileSync(file, 'key: value');
        assert.deepEqual(readJSONSync<{ key: string }>(file), { key: 'value' });
    });

    it('throws error on unsupported file extensions', () => {
        const file = path.join(dir, 'test.txt');
        fs.writeFileSync(file, 'whatever');
        assert.throws(() => readJSONSync(file), /Unsupported file extension: txt/);
    });
});

describe('readConfig', () => {
    const defaultOptions = { key1: 'value1' };
    let dir: string;
    let mainPath: string;
    let wsDir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-config-'));
        mainPath = path.join(dir, 'main', 'config.json');
        wsDir = path.join(dir, 'ws');
        fs.mkdirSync(path.dirname(mainPath), { recursive: true });
        fs.mkdirSync(wsDir, { recursive: true });
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns default options when no config exists', () => {
        const result = readConfig(defaultOptions, mainPath, wsDir, 'config.json');
        assert.deepEqual(result, defaultOptions);
    });

    it('merges configFile data with defaultOptions', () => {
        fs.writeFileSync(mainPath, JSON.stringify({ key2: 'value2', key1: 'updated' }));
        const result = readConfig(defaultOptions, mainPath, wsDir, 'config.json');
        assert.deepEqual(result, { key1: 'updated', key2: 'value2' });
    });

    it('merges workspaceConfig data with defaultOptions and configFile', () => {
        fs.writeFileSync(mainPath, JSON.stringify({ key2: 'value2', sharedKey: 'configValue' }));
        fs.writeFileSync(path.join(wsDir, 'config.json'), JSON.stringify({ key3: 'value3', sharedKey: 'workspaceValue' }));
        const result = readConfig(defaultOptions, mainPath, wsDir, 'config.json');
        assert.deepEqual(result, {
            key1: 'value1',
            key2: 'value2',
            key3: 'value3',
            sharedKey: 'workspaceValue'
        });
    });

    it('merges array values from configFile and workspaceConfig without duplicates', () => {
        fs.writeFileSync(mainPath, JSON.stringify({ arrayKey: [1, 2, 3] }));
        fs.writeFileSync(path.join(wsDir, 'config.json'), JSON.stringify({ arrayKey: [3, 4, 5] }));
        const result = readConfig(defaultOptions, mainPath, wsDir, 'config.json');
        assert.deepEqual(result, {
            key1: 'value1',
            arrayKey: [1, 2, 3, 4, 5]
        });
    });
});
