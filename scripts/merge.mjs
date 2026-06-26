// Deep-merge utilities mirroring the previous `deepmerge` + custom array-dedup
// behavior from src/readConfig.ts, reimplemented dependency-free so the helpers
// can be loaded directly by an `actions/github-script` step (no bundling, no
// node_modules at action runtime).

/** @param {unknown} v */
function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Dedupe preserving first-occurrence order (matches `Array.from(new Set(...))`,
 * which is what the old `arrayMergeDedupe` used).
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
export function dedupe(arr) {
    return Array.from(new Set(arr));
}

/**
 * Deep merge `source` into `target`. Plain objects merge recursively, arrays are
 * concatenated then de-duplicated (target items first), and for everything else
 * `source` wins. Mirrors `deepmerge(target, source, { arrayMerge: arrayMergeDedupe })`.
 * @param {any} target
 * @param {any} source
 * @returns {any}
 */
export function deepMerge(target, source) {
    if (Array.isArray(target) && Array.isArray(source)) {
        return dedupe([...target, ...source]);
    }
    if (isPlainObject(target) && isPlainObject(source)) {
        /** @type {Record<string, any>} */
        const out = { ...target };
        for (const key of Object.keys(source)) {
            out[key] = key in target ? deepMerge(target[key], source[key]) : source[key];
        }
        return out;
    }
    return source;
}
