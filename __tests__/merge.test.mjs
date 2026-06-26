import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dedupe, deepMerge } from '../scripts/merge.mjs';

describe('dedupe', () => {
    it('removes duplicates preserving first-occurrence order', () => {
        assert.deepEqual(dedupe([1, 2, 3, 3, 4, 1]), [1, 2, 3, 4]);
    });
});

describe('deepMerge', () => {
    it('source scalars win over target', () => {
        assert.deepEqual(deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 }), { a: 1, b: 3, c: 4 });
    });

    it('merges nested objects recursively', () => {
        assert.deepEqual(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3, z: 4 } }), { a: { x: 1, y: 3, z: 4 } });
    });

    it('concatenates and de-dupes arrays (target items first)', () => {
        assert.deepEqual(deepMerge({ a: [1, 2, 3] }, { a: [3, 4, 5] }), { a: [1, 2, 3, 4, 5] });
    });

    it('source wins when types differ', () => {
        assert.deepEqual(deepMerge({ a: { x: 1 } }, { a: 'scalar' }), { a: 'scalar' });
    });
});
