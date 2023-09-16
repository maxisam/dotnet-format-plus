export enum INPUTS {
  authToken = 'authToken',
  action = 'action',
  onlyChangedFiles = 'onlyChangedFiles',
  failFast = 'failFast',
  workspace = 'workspace',
  include = 'include',
  exclude = 'exclude',
  skipFixWhitespace = 'skipFixWhitespace',
  skipFixAnalyzers = 'skipFixAnalyzers',
  skipFixStyle = 'skipFixStyle',
  styleSeverityLevel = 'styleSeverityLevel',
  analyzersSeverityLevel = 'analyzersSeverityLevel',
  logLevel = 'logLevel',
  commitUsername = 'commitUsername',
  commitUserEmail = 'commitUserEmail',
  commitMessage = 'commitMessage'
}

export interface IInputs {
  authToken: string;
  action?: string;
  onlyChangedFiles: boolean;
  failFast: boolean;
  workspace: string;
  include?: string;
  exclude?: string;
  skipFixWhitespace: boolean;
  skipFixAnalyzers: boolean;
  skipFixStyle: boolean;
  styleSeverityLevel: FixLevelType;
  analyzersSeverityLevel: FixLevelType;
  logLevel: string;
  commitUsername: string;
  commitUserEmail: string;
  commitMessage: string;
}

export type FixLevelType = 'error' | 'info' | 'warn';

export interface FormatOptions {
  onlyChangedFiles: boolean;
  dryRun: boolean;
  workspace?: string;
  include?: string;
  exclude?: string;
  logLevel: string;
  skipFixWhitespace: boolean;
  skipFixAnalyzers: boolean;
  skipFixStyle: boolean;
  analyzersSeverityLevel: FixLevelType;
  styleSeverityLevel: FixLevelType;
}

export type FormatResult = {
  stdout: string[];
  stderr: string[];
  formatResult: boolean;
};
