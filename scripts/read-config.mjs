// Config reading + 3-way merge, ported 1:1 from src/readConfig.ts.
//
// JSON is parsed natively. YAML support is kept, but the YAML parser is injected
// (`parseYaml`, e.g. js-yaml's `load`) instead of imported, so this module stays
// dependency-free at action runtime. The github-script wrapper converts any
// `.yml`/`.yaml` config to a parsed object (via `yq`, or a pinned `npx -y js-yaml`
// fallback — see steps/load-config.mjs) and the tests inject js-yaml directly.

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
 * Resolve the absolute main + workspace config paths (the workspace candidate uses
 * the same filename as the main config). Mirrors the path logic in src/readConfig.ts.
 * @param {string} mainConfigPath
 * @param {string} workspace
 * @param {string} defaultConfigName
 * @returns {{ configFile: string, workspaceConfig: string }}
 */
export function resolveConfigPaths(mainConfigPath, workspace, defaultConfigName) {
    const configFile = resolve(mainConfigPath || defaultConfigName);
    const configFilename = basename(configFile) || defaultConfigName;
    const workspaceConfig = resolve(workspace, configFilename);
    return { configFile, workspaceConfig };
}

/**
 * Resolve configuration from a main config path plus an optional workspace config
 * of the same filename. Precedence (later wins): defaults -> main config ->
 * workspace config; arrays are merged with de-duplication. This is the single
 * source of merge precedence; all file I/O + parsing is delegated to the injected
 * `loadObject(absPath) => object | null | Promise<object|null>` (return `null` when
 * the file is absent) so the module stays dependency-free at action runtime.
 * @template T
 * @param {Partial<T>} defaultOptions
 * @param {string} mainConfigPath
 * @param {string} workspace
 * @param {string} defaultConfigName
 * @param {(absPath: string) => (Partial<T> | null | Promise<Partial<T> | null>)} loadObject
 * @returns {Promise<Partial<T>>}
 */
export async function resolveConfig(defaultOptions, mainConfigPath, workspace, defaultConfigName, loadObject) {
    const { configFile, workspaceConfig } = resolveConfigPaths(mainConfigPath, workspace, defaultConfigName);

    let result = defaultOptions || {};
    const main = await loadObject(configFile);
    if (main) {
        result = deepMerge(result, main);
    }
    if (workspaceConfig !== configFile) {
        const ws = await loadObject(workspaceConfig);
        if (ws) {
            result = deepMerge(result, ws);
        }
    }
    return result;
}
