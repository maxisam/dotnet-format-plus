import { info, warning } from '@actions/core';
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
        const workspaceConfigData = readJSONSync(workspaceConfig);
        for (const key in resultData) {
            mergeArrayProps(workspaceConfigData, resultData, key as keyof IOptions);
        }
        resultData = { ...resultData, ...workspaceConfigData };
    }
    if (resultConfigPath) {
        const result = { config: resultConfigPath, ...resultData };
        info(`🔎 loaded config: ${inspect(result)}`);
        return result;
    }

    warning(`🔎 config: ${config} not found`);
    return {};
}

function mergeArrayProps(newConfig: Partial<IOptions>, origConfig: Partial<IOptions>, prop: keyof IOptions): void {
    if (Array.isArray(newConfig[prop]) && Array.isArray(origConfig[prop])) {
        newConfig[prop] = [...(newConfig[prop] as string[]), ...(origConfig[prop] as string[])];
    } else if (!newConfig[prop] && Array.isArray(origConfig[prop])) {
        newConfig[prop] = origConfig[prop];
    }
}
