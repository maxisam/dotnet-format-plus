import { inspect } from 'node:util';
import * as core from '@actions/core';
import * as Common from './common.ts';
import { duplicatedCheck } from './duplicated.ts';
import { format } from './format.ts';
import { addProblemMatcher, removeProblemMatcher } from './problem-matcher.ts';

async function run(): Promise<boolean> {
    try {
        const inputs = Common.getInputs();
        core.debug(`🔍Inputs: ${inspect(inputs)}`);
        const githubClient = Common.getOctokitRest(inputs.authToken);
        inputs.problemMatcherEnabled && addProblemMatcher();
        const finalFormatResult = await format(inputs, githubClient);
        inputs.problemMatcherEnabled && removeProblemMatcher();
        if (inputs.jscpdCheck) {
            await duplicatedCheck(
                inputs.workspace,
                inputs.jscpdConfigPath,
                inputs.jscpdCheckAsError,
                inputs.postNewComment,
                githubClient,
                inputs.jscpdReportArtifactName
            );
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
