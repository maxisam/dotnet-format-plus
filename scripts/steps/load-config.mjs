// Shared config loader for resolveConfig: returns a loadObject(absPath) that yields
// null when the file is absent, parses JSON natively, and converts YAML to JSON
// out-of-process. It prefers a `yq` binary already on the runner (GitHub-hosted
// runners ship it) and otherwise falls back to a one-off, version-pinned
// `npx -y js-yaml@<ver>` download — so no YAML dependency is needed at runtime.

import * as fs from 'node:fs';
import { readData } from '../read-config.mjs';

// Pinned so the on-demand fallback is reproducible (mirrors `jscpd@5`).
const JS_YAML_SPEC = 'js-yaml@4.1.0';

/**
 * Build the loadObject(absPath) used by resolveConfig.
 * @param {{ exec: (cmd: string, args: string[], opts?: any) => Promise<number> }} exec  github-script's exec
 * @param {{ which: (tool: string, check?: boolean) => Promise<string> }} [io]  github-script's io (for the `yq` lookup)
 * @returns {(absPath: string) => Promise<any | null>}
 */
export function makeLoader(exec, io) {
    return async p => {
        if (!fs.existsSync(p)) {
            return null;
        }
        if (/\.ya?ml$/i.test(p)) {
            return parseYaml(p, exec, io);
        }
        return readData(p);
    };
}

/**
 * Convert a YAML file to a JS object. Prefers an installed `yq` (present on
 * GitHub-hosted runners); otherwise falls back to a pinned `npx -y js-yaml`.
 * @param {string} p
 * @param {{ exec: Function }} exec
 * @param {{ which: Function } | undefined} io
 * @returns {Promise<any>}
 */
async function parseYaml(p, exec, io) {
    const yqPath = io ? await io.which('yq', false) : '';
    if (yqPath) {
        const out = [];
        const code = await exec.exec(yqPath, ['-o=json', '.', p], {
            silent: true,
            ignoreReturnCode: true,
            listeners: { stdout: d => out.push(d.toString()) }
        });
        if (code === 0) {
            try {
                return JSON.parse(out.join(''));
            } catch {
                // yq produced unexpected output; fall through to the js-yaml fallback.
            }
        }
    }

    const out = [];
    await exec.exec('npx', ['-y', JS_YAML_SPEC, p], {
        silent: true,
        listeners: { stdout: d => out.push(d.toString()) }
    });
    return JSON.parse(out.join(''));
}
