import { IBlamedLines, IStatistic, ITokenLocation } from '@jscpd/core';

export enum INPUTS {
    authToken = 'authToken',
    action = 'action',
    onlyChangedFiles = 'onlyChangedFiles',
    failFast = 'failFast',
    workspace = 'workspace',
    projectFileName = 'projectFileName',
    severityLevel = 'severityLevel',
    logLevel = 'logLevel',
    commitUsername = 'commitUsername',
    commitUserEmail = 'commitUserEmail',
    commitMessage = 'commitMessage',
    nugetConfigPath = 'nugetConfigPath',
    dotnetFormatConfigPath = 'dotnetFormatConfigPath',
    jscpdCheck = 'jscpdCheck',
    jscpdConfigPath = 'jscpdConfigPath',
    jscpdCheckAsError = 'jscpdCheckAsError',
    problemMatcherEnabled = 'problemMatcherEnabled',
    skipCommit = 'skipCommit',
    postNewComment = 'postNewComment'
}

export interface IInputs {
    authToken: string;
    action?: string;
    onlyChangedFiles: boolean;
    failFast: boolean;
    workspace: string;
    projectFileName: string;
    severityLevel: FixLevelType;
    logLevel: VerbosityType;
    problemMatcherEnabled: boolean;
    skipCommit: boolean;
    commitUsername: string;
    commitUserEmail: string;
    commitMessage: string;
    nugetConfigPath: string;
    dotnetFormatConfigPath: string;
    jscpdCheck: boolean;
    jscpdConfigPath: string;
    jscpdCheckAsError: boolean;
    postNewComment: boolean;
}

export type FixLevelType = 'error' | 'info' | 'warn';

export type FormatResult = {
    stdout: string[];
    stderr: string[];
    formatResult: boolean;
};

export interface FileChange {
    LineNumber: number;
    CharNumber: number;
    DiagnosticId: string;
    FormatDescription: string;
}

export interface ReportItem {
    DocumentId: {
        ProjectId: {
            Id: string;
        };
        Id: string;
    };
    FileName: string;
    FilePath: string;
    FileChanges: FileChange[];
}

export interface IDuplication {
    format: string;
    lines: number;
    tokens: number;
    firstFile: {
        name: string;
        start: number;
        end: number;
        startLoc: ITokenLocation;
        endLoc: ITokenLocation;
        blame?: IBlamedLines;
    };
    secondFile: {
        name: string;
        start: number;
        end: number;
        startLoc: ITokenLocation;
        endLoc: ITokenLocation;
        blame?: IBlamedLines;
    };
    fragment: string;
}

export interface IJsonReport {
    duplicates: IDuplication[];
    statistics: IStatistic;
}

export interface IDotnetFormatArgs {
    isEabled: boolean;
    include?: string[];
    exclude?: string[];
    verbosity?: VerbosityType;
    noRestore?: boolean;
    folder?: boolean;
    severity?: severityType;
    verifyNoChanges: boolean;
}
export interface IDotnetFormatConfig {
    nugetConfigPath?: string;
    // can be a cproj or solution file
    projectFileName?: string;
    // simple mode will only run dotnet format and ignore all other options from style, analyzers and whitespace
    onlyChangedFiles: boolean;
    options?: IDotnetFormatArgs;
    styleOptions?: IDotnetFormatArgs;
    analyzersOptions?: IDotnetFormatArgs;
    whitespaceOptions?: IDotnetFormatArgs;
}

export type VerbosityType = 'quiet' | 'minimal' | 'normal' | 'detailed' | 'diagnostic';
export type severityType = 'error' | 'info' | 'warn';

export enum FormatType {
    all = 'all',
    style = 'style',
    analyzers = 'analyzers',
    whitespace = 'whitespace'
}
