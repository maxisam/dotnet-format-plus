import { info } from '@actions/core';
import deepmerge from 'deepmerge';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { resolve } from 'path';
import { inspect } from 'util';

/**
 * Reads configuration from the provided config file path.
 * If a configuration is also present in the workspace directory,
 * the function merges the two configurations, with the workspace
 * configuration taking precedence.
 *
 * @param config - Path to the configuration file.
 * @param workspace - Path to the workspace directory.
 * @returns A merged configuration object, or an empty object if no configuration is found.
 */
export function readJSONSync<T>(path: string): Partial<T> {
    const data = fs.readFileSync(path, 'utf-8');
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'json') {
        return JSON.parse(data);
    } else if (ext === 'yaml' || ext === 'yml') {
        return yaml.load(data) as Partial<T>;
    } else {
        throw new Error(`Unsupported file extension: ${ext}`);
    }
}

/**
 * Custom array merge function to remove duplicates.
 *
 * @param source - Source array.
 * @param target - Target array.
 * @returns Merged array with duplicates removed.
 */
function arrayMergeDedupe<T>(source: T[], target: T[]): T[] {
    return Array.from(new Set([...source, ...target]));
}

export function readConfig<T>(defaultOptions: Partial<T>, configName: string, workspace: string, defaultConfigName: string): Partial<T> {
    const configFile = resolve(configName || defaultConfigName);
    const workspaceConfig = resolve(workspace, configName || defaultConfigName);

    const configExists = fs.existsSync(configFile);
    const workspaceConfigExists = workspaceConfig !== configFile && fs.existsSync(workspaceConfig);

    let resultData: Partial<T> = defaultOptions || {};

    if (configExists) {
        resultData = deepmerge(resultData, readJSONSync<T>(configFile), { arrayMerge: arrayMergeDedupe });
    }
    if (workspaceConfigExists) {
        resultData = deepmerge(resultData, readJSONSync<T>(workspaceConfig), { arrayMerge: arrayMergeDedupe });
    }

    info(`🔎 loaded config: ${inspect(resultData)}`);
    return resultData;
}
