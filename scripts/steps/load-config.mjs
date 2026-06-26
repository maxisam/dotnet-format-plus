// Shared config loader for resolveConfig: returns a loadObject(absPath) that yields
// null when the file is absent, parses JSON natively, and converts YAML
// out-of-process with `npx -y js-yaml` (so no YAML dependency is needed at action
// runtime). Used by both the dotnet format and jscpd resolve paths.

import * as fs from 'node:fs';
import { readData } from '../read-config.mjs';

/**
 * @param {{ exec: (cmd: string, args: string[], opts: any) => Promise<number> }} exec  github-script's exec
 * @returns {(absPath: string) => Promise<any | null>}
 */
export function makeLoader(exec) {
    return async p => {
        if (!fs.existsSync(p)) {
            return null;
        }
        if (/\.ya?ml$/i.test(p)) {
            let out = '';
            await exec.exec('npx', ['-y', 'js-yaml', p], {
                silent: true,
                listeners: { stdout: d => (out += d.toString()) }
            });
            return JSON.parse(out);
        }
        return readData(p);
    };
}
