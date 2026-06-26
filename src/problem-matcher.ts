import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '@actions/core';
import { issueCommand } from '@actions/core/lib/command.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

export function addProblemMatcher(): void {
    try {
        core.info(`Adding problem matcher from ${join(moduleDir, 'problem-matcher.json')}`);
        issueCommand('add-matcher', {}, join(moduleDir, 'problem-matcher.json'));
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            throw error;
        }
    }
}

export function removeProblemMatcher(): void {
    try {
        core.info(`Removing problem matcher`);
        issueCommand('remove-matcher', { owner: 'dotnet-format-plus' }, '');
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            throw error;
        }
    }
}
