import * as core from '@actions/core';
import { inspect } from 'util';
import * as Common from './common';
import { duplicatedCheck } from './duplicated';
import { format } from './format';
import { addProblemMatcher, removeProblemMatcher } from './problem-matcher';

async function run(): Promise<boolean> {
    try {
        const inputs = Common.getInputs();
        core.debug(`🔍Inputs: ${inspect(inputs)}`);
        const githubClient = Common.getOctokitRest(inputs.authToken);
        if (inputs.problemMatcherEnabled) {
            addProblemMatcher();
        }
        const finalFormatResult = await format(inputs, githubClient);
        removeProblemMatcher();
        if (inputs.jscpdCheck) {
            await duplicatedCheck(inputs.workspace, inputs.jscpdConfigPath, inputs.jscpdCheckAsError, githubClient);
        }
        if (!finalFormatResult && inputs.failFast) {
            core.setFailed(`Action failed with format issue`);
        }
        return finalFormatResult;
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(`Action failed with error ${error.message}`);
        }
        return false;
    }
}

await run();
