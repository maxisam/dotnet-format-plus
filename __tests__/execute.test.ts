import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execute } from '../src/execute.ts';

describe('execute', () => {
    it('should execute a command successfully', async () => {
        const result = await execute('echo', process.cwd(), ['hello', 'world'], false, false);

        assert.equal(result.result, true);
        assert.equal(result.stdout.join(''), 'hello world\n');
        assert.equal(result.stderr.join(''), '');
    });
});
