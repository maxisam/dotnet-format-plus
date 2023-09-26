import { IBlamedLines, IStatistic, ITokenLocation } from '@jscpd/core';

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
    commitMessage = 'commitMessage',
    nugetConfigPath = 'nugetConfigPath',
    dotnetFormatConfigPath = 'dotnetFormatConfigPath',
    jscpdCheck = 'jscpdCheck',
    jscpdConfigPath = 'jscpdConfigPath',
    jscpdCheckAsError = 'jscpdCheckAsError'
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
    nugetConfigPath: string;
    dotnetFormatConfigPath: string;
    jscpdCheck: boolean;
    jscpdConfigPath: string;
    jscpdCheckAsError: boolean;
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
    verbosity?: string;
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

export type severityType = 'error' | 'info' | 'warn';
