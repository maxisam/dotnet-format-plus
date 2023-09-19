import { warning } from '@actions/core';
import { IOptions } from '@jscpd/core';
import * as fs from 'fs';
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

export function readConfig(config: string, workspace: string, defaultConfig: string): Partial<IOptions> {
    const readJSONSync = (path: string): Partial<IOptions> => {
        const data = fs.readFileSync(path, 'utf-8');
        return JSON.parse(data);
    };
    const configFile = resolve(config || defaultConfig);
    const workspaceConfig = resolve(workspace, config || defaultConfig);

    const configExists = fs.existsSync(configFile);
    const workspaceConfigExists = fs.existsSync(workspaceConfig);

    let resultConfigPath = '';
    let resultData: Partial<IOptions> = {};

    if (configExists) {
        resultConfigPath = configFile;
        resultData = { ...resultData, ...readJSONSync(configFile) };
    }
    if (workspaceConfigExists) {
        resultConfigPath = workspaceConfig;
        resultData = { ...resultData, ...readJSONSync(workspaceConfig) };
    }

    if (resultConfigPath) {
        const result = { config: resultConfigPath, ...resultData };
        inspect(result);
        return result;
    }

    warning(`🔎 config: ${config} not found`);
    return {};
}
