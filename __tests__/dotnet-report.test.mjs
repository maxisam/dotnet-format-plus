import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { generateReport, getReportFiles, getReportHeader } from '../scripts/dotnet-report.mjs';

const ctx = {
    owner: 'maxisam',
    repo: 'dotnet-format-plus',
    sha: 'abc123',
    cwd: '/repo',
    runId: 42,
    commit: 'abc1234567'
};

describe('getReportHeader', () => {
    it('includes the workspace', () => {
        assert.equal(getReportHeader('/ws/App'), '## ✅ DOT NET FORMAT - /ws/App');
    });
});

describe('getReportFiles', () => {
    let dir;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-report-'));
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('keeps non-empty report files and skips empty ones', () => {
        fs.writeFileSync(path.join(dir, 'dotnet-format.json'), '[{"a":1}]');
        fs.writeFileSync(path.join(dir, 'style-format.json'), '[]'); // 2 bytes -> skipped
        const files = getReportFiles(dir);
        assert.deepEqual(files, [`${dir}/dotnet-format.json`]);
    });
});

describe('generateReport', () => {
    let dir;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gen-'));
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('builds markdown with blob links from the report JSON', () => {
        const report = path.join(dir, 'dotnet-format.json');
        fs.writeFileSync(
            report,
            JSON.stringify([
                {
                    FileName: 'Program.cs',
                    FilePath: '/repo/src/Program.cs',
                    FileChanges: [{ LineNumber: 10, CharNumber: 5, DiagnosticId: 'IDE0055', FormatDescription: 'Fix whitespace' }]
                }
            ])
        );
        const md = generateReport([report], getReportHeader('/repo'), ctx);
        assert.match(md, /## ✅ DOT NET FORMAT - \/repo/);
        assert.match(md, /<summary> DOTNET-FORMAT Report <\/summary>/);
        assert.match(md, /\*\*Program\.cs\*\*/);
        assert.match(md, /https:\/\/github\.com\/maxisam\/dotnet-format-plus\/blob\/abc123\/src\/Program\.cs/);
        assert.match(md, /Fix whitespace \(\[L10:5\]/);
        assert.match(md, /updated for commit \[abc1234\]/);
    });

    it('returns empty string when there are no report files', () => {
        // getReportFiles filters empty ([]) reports out by size, so generateReport
        // only yields '' when handed no files at all.
        assert.equal(generateReport([], getReportHeader('/repo'), ctx), '');
    });
});
