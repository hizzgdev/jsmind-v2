/**
 * Exit codes and the error type the CLI commands throw.
 *
 * @remarks
 * The three failure classes are kept apart on purpose. An agent that gets `1`
 * will go and fix the data; one that gets `2` will fix its command line; one
 * that gets `3` will stop and ask a human. Collapsing them into a single code
 * leaves the caller guessing which of those to do.
 *
 * @packageDocumentation
 */

/**
 * Process exit codes.
 *
 * @public
 */
export const CliExit = {
    /** Everything worked. */
    Ok: 0,
    /** The data is invalid: validation failed, or a referenced id is absent. */
    InvalidData: 1,
    /** The command line is wrong: missing argument, unknown command, conflicts. */
    Usage: 2,
    /** IO or runtime failure: file missing, no write permission, crash. */
    IoError: 3,
} as const;

export type CliExit = typeof CliExit[keyof typeof CliExit];

/**
 * An error that already knows which exit code it deserves.
 *
 * @public
 */
export class CliError extends Error {
    /** Exit code this failure maps to. */
    readonly exit: CliExit;

    /**
     * @param message - Human-readable description, written to stderr.
     * @param exit - Exit code to terminate with.
     */
    constructor(message: string, exit: CliExit) {
        super(message);
        this.exit = exit;
        this.name = 'CliError';
    }
}

/**
 * Convenience constructor for a usage error.
 *
 * @param message - What the caller got wrong.
 * @returns A CliError carrying `CliExit.Usage`.
 */
export function usageError(message: string): CliError {
    return new CliError(message, CliExit.Usage);
}

/**
 * Convenience constructor for an invalid-data error.
 *
 * @param message - What is wrong with the data.
 * @returns A CliError carrying `CliExit.InvalidData`.
 */
export function dataError(message: string): CliError {
    return new CliError(message, CliExit.InvalidData);
}

/**
 * Convenience constructor for an IO error.
 *
 * @param message - What failed.
 * @returns A CliError carrying `CliExit.IoError`.
 */
export function ioError(message: string): CliError {
    return new CliError(message, CliExit.IoError);
}
