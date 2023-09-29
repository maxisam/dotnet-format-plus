import { join } from 'path';

import { setFailed } from '@actions/core';
import { issueCommand } from '@actions/core/lib/command';

export function addProblemMatcher(): void {
    try {
        issueCommand('add-matcher', {}, join(__dirname, 'problem-matcher.json'));
    } catch (error) {
        if (error instanceof Error) {
            setFailed(error.message);
        } else {
            throw error;
        }
    }
}

export function removeProblemMatcher(): void {
    try {
        issueCommand('remove-matcher', { owner: 'dotnet-format-plus' }, '');
    } catch (error) {
        if (error instanceof Error) {
            setFailed(error.message);
        } else {
            throw error;
        }
    }
}
