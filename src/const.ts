export const includedFileTypes = ['.cs', '.vb', '.cspoj', '.vbproj', '.fs', '.fsproj', '.cshtml', '.vbhtml'];
export const enum FileStatus {
    /**
     * The file was added.
     */
    Added = 'added',

    /**
     * The mode of the file was changed or there are unknown changes because the diff was truncated.
     */
    Changed = 'changed',

    /**
     * The content of the file was modified.
     */
    Modified = 'modified',

    /**
     * The file was removed.
     */
    Removed = 'removed',

    /**
     * The file was renamed.
     */
    Renamed = 'renamed'
}
