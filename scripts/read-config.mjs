// Config reading + 3-way merge, ported 1:1 from src/readConfig.ts.
//
// JSON is parsed natively. YAML support is kept, but the YAML parser is injected
// (`parseYaml`, e.g. js-yaml's `load`) instead of imported, so this module stays
// dependency-free at action runtime. The github-script wrapper converts any
// `.yml`/`.yaml` config to a parsed object (via `npx -y js-yaml`) and the tests
// inject js-yaml directly.

import * as fs from 'node:fs';
import { basename, resolve } from 'node:path';
import { deepMerge } from './merge.mjs';

/**
 * Read and parse a config file by extension. `.json` is built-in; `.yaml`/`.yml`
 * require a `parseYaml` function.
 * @template T
 * @param {string} path
 * @param {(data: string) => unknown} [parseYaml]
 * @returns {Partial<T>}
 */
export function readData(path, parseYaml) {
    const data = fs.readFileSync(path, 'utf-8');
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'json') {
        return JSON.parse(data);
    }
    if (ext === 'yaml' || ext === 'yml') {
        if (typeof parseYaml !== 'function') {
            throw new Error(`YAML config requires a parseYaml function: ${path}`);
        }
        return /** @type {Partial<T>} */ (parseYaml(data));
    }
    throw new Error(`Unsupported file extension: ${ext}`);
}

/**
 * Resolve configuration from a main config path plus an optional workspace config
 * of the same filename. Precedence (later wins): defaults -> main config ->
 * workspace config. Arrays are merged with de-duplication.
 * @template T
 * @param {Partial<T>} defaultOptions
 * @param {string} mainConfigPath
 * @param {string} workspace
 * @param {string} defaultConfigName
 * @param {(data: string) => unknown} [parseYaml]
 * @returns {Partial<T>}
 */
export function resolveConfig(defaultOptions, mainConfigPath, workspace, defaultConfigName, parseYaml) {
    const configFile = resolve(mainConfigPath || defaultConfigName);
    const configFilename = basename(configFile) || defaultConfigName;
    const workspaceConfig = resolve(workspace, configFilename);

    const configExists = fs.existsSync(configFile);
    const workspaceConfigExists = workspaceConfig !== configFile && fs.existsSync(workspaceConfig);

    let result = defaultOptions || {};
    if (configExists) {
        result = deepMerge(result, readData(configFile, parseYaml));
    }
    if (workspaceConfigExists) {
        result = deepMerge(result, readData(workspaceConfig, parseYaml));
    }
    return result;
}
