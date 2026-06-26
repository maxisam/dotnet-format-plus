import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import problemMatcherJson from '../src/problem-matcher.json' with { type: 'json' };

const problemMatcher = problemMatcherJson.problemMatcher[0];

function matchResults(output: string[], regexp: RegExp): RegExpExecArray[] {
    return output.map(line => regexp.exec(line)).filter((match): match is RegExpExecArray => match !== null);
}

describe('problemMatcher', () => {
    it('has the correct owner', () => {
        assert.equal(problemMatcher.owner, 'dotnet-format-plus');
    });

    it('has one pattern', () => {
        assert.equal(problemMatcher.pattern.length, 1);
    });

    describe('pattern', () => {
        const reportOutput = [
            "/path/file.cs(15,2): error WHITESPACE: Fix whitespace formatting. Insert '\t'. [/path/project.csproj]",
            "/path/file.cs(15,3): error WHITESPACE: Fix whitespace formatting. Replace 4 characters with '\n\t\t\t'. [/path/project.csproj]",
            "/path/file.cs(16,84): error WHITESPACE: Fix whitespace formatting. Replace 4 characters with '\n\t\t\t'. [/path/project.csproj]"
        ];

        const pattern = problemMatcher.pattern[0];
        const regexp = new RegExp(pattern.regexp);
        const results = matchResults(reportOutput, regexp);

        it('matches violations', () => {
            assert.equal(results.length, 3);
        });

        it('matches violation details', () => {
            assert.equal(results[0][pattern.file], '/path/file.cs');
            assert.equal(results[0][pattern.line], '15');
            assert.equal(results[0][pattern.column], '2');
            assert.equal(results[0][pattern.message], "Fix whitespace formatting. Insert '\t'.");
            assert.equal(results[0][pattern.severity], 'error');
            assert.equal(results[0][pattern.code], 'WHITESPACE');

            assert.equal(results[1][pattern.file], '/path/file.cs');
            assert.equal(results[1][pattern.line], '15');
            assert.equal(results[1][pattern.column], '3');
            assert.equal(results[1][pattern.message], "Fix whitespace formatting. Replace 4 characters with '\n\t\t\t'.");

            assert.equal(results[2][pattern.file], '/path/file.cs');
            assert.equal(results[2][pattern.line], '16');
            assert.equal(results[2][pattern.column], '84');
            assert.equal(results[2][pattern.message], "Fix whitespace formatting. Replace 4 characters with '\n\t\t\t'.");
        });
    });
});
