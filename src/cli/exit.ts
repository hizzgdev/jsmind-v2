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

/**
 * A failure as the CLI presents it: the line for stderr and the code for the shell.
 *
 * @public
 */
export interface CliFailure {
    /** Text to write to stderr, without a trailing newline. */
    message: string;
    /** Exit code the process should terminate with. */
    exit: CliExit;
}

/**
 * Turns a caught error into the message and exit code it deserves.
 *
 * @param err - Whatever a command threw.
 * @returns The message and exit code to report.
 * @remarks
 * Every failure a command raises on purpose is a {@link CliError}, and already
 * carries its own code. Everything else is a bug or an exhausted environment, so
 * it is reported as `Unexpected failure:` + `IoError` - the caller has no
 * command-line change that would fix it.
 *
 * The decision lives here, in one function, because that is the only place a
 * test can hold the boundary between "fix your command" (1 and 2) and "stop and
 * ask a human" (3) without exercising every command.
 */
export function describeFailure(err: unknown): CliFailure {
    if (err instanceof CliError) {
        return { message: err.message, exit: err.exit };
    }
    return {
        message: `Unexpected failure: ${(err as Error).message}`,
        exit: CliExit.IoError,
    };
}
