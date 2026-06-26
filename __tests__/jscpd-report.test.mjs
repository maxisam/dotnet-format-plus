import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAnnotations, buildJscpdMessage, getReportHeader, isOverThreshold } from '../scripts/jscpd-report.mjs';

const ctx = {
    owner: 'maxisam',
    repo: 'dotnet-format-plus',
    sha: 'abc123',
    cwd: '/repo',
    runId: 42,
    commit: 'abc1234567'
};

const duplicates = [
    {
        firstFile: { name: 'A.cs', start: 1, end: 5 },
        secondFile: { name: 'B.cs', start: 10, end: 14 }
    }
];

describe('getReportHeader', () => {
    it('includes the workspace', () => {
        assert.equal(getReportHeader('/ws/App'), '## ❌ DUPLICATED CODE FOUND - /ws/App');
    });
});

describe('isOverThreshold', () => {
    it('compares total percentage against the threshold', () => {
        assert.equal(isOverThreshold({ statistics: { total: { percentage: 5 } } }, 0), true);
        assert.equal(isOverThreshold({ statistics: { total: { percentage: 0 } } }, 0), false);
        assert.equal(isOverThreshold({ statistics: { total: { percentage: 3 } } }, 5), false);
    });
});

describe('buildJscpdMessage', () => {
    it('strips the default header, adds links and footer', () => {
        const md = buildJscpdMessage('# Copy/paste detection report\n\nsome table', duplicates, '/repo/src', '/repo/src', ctx);
        assert.match(md, /## ❌ DUPLICATED CODE FOUND - \/repo\/src/);
        assert.doesNotMatch(md, /# Copy\/paste detection report/);
        assert.match(md, /<summary> JSCPD Details <\/summary>/);
        assert.match(md, /\*\*A\.cs\*\* & \*\*B\.cs\*\*/);
        assert.match(md, /https:\/\/github\.com\/maxisam\/dotnet-format-plus\/blob\/abc123\/src\/A\.cs#L1-L5/);
        assert.match(md, /updated for commit \[abc1234\]/);
    });
});

describe('buildAnnotations', () => {
    it('maps duplicates to repo-relative annotation payloads', () => {
        const annotations = buildAnnotations(duplicates, '/repo/src', '/repo');
        assert.equal(annotations.length, 1);
        assert.deepEqual(
            { file: annotations[0].file, startLine: annotations[0].startLine, endLine: annotations[0].endLine },
            { file: 'src/A.cs', startLine: 1, endLine: 5 }
        );
        assert.match(annotations[0].message, /src\/A\.cs \(1-5\)/);
        assert.match(annotations[0].message, /and src\/B\.cs \(10-14\)/);
    });
});
