import {exec} from '@actions/exec';

type ExecuteOutput = {
  stdout: string[];
  stderr: string[];
  result: boolean;
};

/** Wrapper around the GitHub toolkit exec command which returns the output.
 * Also allows you to easily toggle the current working directory.
 * on a non-zero exit status or to leave implementation up to the caller.
 */
export async function execute(
  cmd: string,
  cwd: string = process.cwd(),
  args: string[] = [],
  silent = false,
  ignoreReturnCode = false
): Promise<ExecuteOutput> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await exec(cmd, args, {
    silent,
    cwd,
    listeners: {
      stdout: (data: Buffer) => {
        stdout.push(data.toString());
      },
      stderr: (data: Buffer) => {
        stderr.push(data.toString());
      }
    },
    ignoreReturnCode
  });

  return {stdout, stderr, result: exitCode === 0};
}
