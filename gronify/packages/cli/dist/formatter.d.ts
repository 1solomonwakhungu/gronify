export interface FormatOptions {
    color?: boolean;
    pretty?: boolean;
    format?: 'gron' | 'json' | 'minimal';
}
export declare class OutputFormatter {
    private options;
    constructor(options?: FormatOptions);
    /**
     * Format gron output with syntax highlighting
     */
    formatGron(gronOutput: string): string;
    /**
     * Format JSON output with syntax highlighting
     */
    formatJson(jsonOutput: string): string;
    /**
     * Format search results with highlighting
     */
    formatSearchResults(results: string, searchTerm: string): string;
    /**
     * Format error messages
     */
    formatError(message: string): string;
    /**
     * Format warning messages
     */
    formatWarning(message: string): string;
    /**
     * Format success messages
     */
    formatSuccess(message: string): string;
    /**
     * Format info messages
     */
    formatInfo(message: string): string;
    /**
     * Colorize a single gron line
     */
    private colorizeGronLine;
    /**
     * Colorize gron path (json.user.name)
     */
    private colorizeGronPath;
    /**
     * Colorize gron values
     */
    private colorizeGronValue;
    /**
     * Apply pretty formatting with indentation and grouping
     */
    private applyPrettyFormatting;
    /**
     * Apply pretty formatting to already colored lines
     */
    private applyPrettyFormattingToColoredLines;
}
/**
 * Create a formatter with auto-detected options
 */
export declare function createFormatter(options?: Partial<FormatOptions>): OutputFormatter;
/**
 * Quick utility to check if colors should be enabled
 */
export declare function shouldUseColor(): boolean;
//# sourceMappingURL=formatter.d.ts.map