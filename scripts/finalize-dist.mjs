// Finalize the ncc bundle by copying the problem matcher next to the bundled
// entrypoint so problem-matcher.ts can locate it at runtime via import.meta.url.
// ncc emits an ESM bundle (the project is "type": "module"), so no extra
// dist/package.json is required.
import { copyFileSync } from 'node:fs';

copyFileSync('src/problem-matcher.json', 'dist/problem-matcher.json');

console.log('✅ dist finalized: problem-matcher.json copied');
