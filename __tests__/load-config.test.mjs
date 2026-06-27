import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { makeLoader } from '../scripts/steps/load-config.mjs';

// Fake github-script `exec`: records calls and replays a scripted exit code + stdout.
function fakeExec(script) {
    const calls = [];
    const exec = {
        async exec(cmd, args, opts) {
            calls.push({ cmd, args });
            const { code = 0, out = '' } = script(cmd, args) || {};
            if (out && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(out));
            }
            return code;
        }
    };
    return { exec, calls };
}

const yqIo = { which: async tool => (tool === 'yq' ? '/usr/bin/yq' : '') };
const noYqIo = { which: async () => '' };

describe('makeLoader', () => {
    let dir;
    let yamlFile;
    let jsonFile;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-'));
        yamlFile = path.join(dir, 'c.yaml');
        jsonFile = path.join(dir, 'c.json');
        fs.writeFileSync(yamlFile, 'threshold: 5');
        fs.writeFileSync(jsonFile, '{"threshold":7}');
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns null for a missing file', async () => {
        const { exec } = fakeExec(() => ({}));
        assert.equal(await makeLoader(exec, yqIo)(path.join(dir, 'nope.yaml')), null);
    });

    it('reads JSON natively without spawning anything', async () => {
        const { exec, calls } = fakeExec(() => ({}));
        assert.deepEqual(await makeLoader(exec, yqIo)(jsonFile), { threshold: 7 });
        assert.equal(calls.length, 0);
    });

    it('uses yq when it is on PATH', async () => {
        const { exec, calls } = fakeExec(cmd => (cmd.includes('yq') ? { code: 0, out: '{"threshold":5}' } : {}));
        assert.deepEqual(await makeLoader(exec, yqIo)(yamlFile), { threshold: 5 });
        assert.equal(calls.length, 1);
        assert.match(calls[0].cmd, /yq$/);
        assert.deepEqual(calls[0].args, ['-o=json', '.', yamlFile]);
    });

    it('falls back to a pinned npx js-yaml when yq is absent', async () => {
        const { exec, calls } = fakeExec(cmd => (cmd === 'npx' ? { code: 0, out: '{"threshold":5}' } : {}));
        assert.deepEqual(await makeLoader(exec, noYqIo)(yamlFile), { threshold: 5 });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].cmd, 'npx');
        assert.deepEqual(calls[0].args, ['-y', 'js-yaml@4.1.0', yamlFile]);
    });

    it('falls back to npx when yq exits non-zero', async () => {
        const { exec, calls } = fakeExec(cmd => {
            if (cmd.includes('yq')) return { code: 1, out: '' };
            if (cmd === 'npx') return { code: 0, out: '{"threshold":5}' };
            return {};
        });
        assert.deepEqual(await makeLoader(exec, yqIo)(yamlFile), { threshold: 5 });
        assert.equal(calls.length, 2);
        assert.match(calls[0].cmd, /yq$/);
        assert.equal(calls[1].cmd, 'npx');
    });
});
