/**
 * `jsmind validate` — check a mind map file without touching it.
 *
 * @packageDocumentation
 */

import { validateMindData } from '../../serialization/validation.ts';
import { readJsonFile } from '../io.ts';
import { CliExit, usageError } from '../exit.ts';

/**
 * Runs the validate command.
 *
 * @param file - Path to the mind map JSON.
 * @param asJson - Emit machine-readable output instead of prose.
 * @returns The exit code: 0 when valid, 1 when the data is invalid.
 * @throws {@link CliError} With `IoError` when the file cannot be read.
 */
export function runValidate(file: string, asJson: boolean): number {
    const data = readJsonFile(file);
    const result = validateMindData(data);

    if (asJson) {
        process.stdout.write(
            `${JSON.stringify({ valid: result.valid, errors: result.errors }, null, 2)}\n`
        );
        return result.valid ? CliExit.Ok : CliExit.InvalidData;
    }

    if (result.valid) {
        process.stdout.write(`${file}: valid\n`);
        return CliExit.Ok;
    }

    // One line per issue, code first so it lines up for scanning.
    process.stderr.write(`${file}: ${result.errors.length} problem(s)\n\n`);
    for (const issue of result.errors) {
        process.stderr.write(`  ${issue.code}  ${issue.path || '<root>'}\n    ${issue.message}\n`);
    }
    return CliExit.InvalidData;
}

/**
 * Describes the validate command for `--help`.
 */
export const validateHelp = `jsmind validate <file> [--json]

Checks a v2 mind map file against the format specification and reports every
problem found. Does not modify the file.

Exit codes:
  0  valid
  1  invalid data
  3  file cannot be read`;

/**
 * Throws when the argument list does not fit the command.
 *
 * @param positional - Positional arguments after the command name.
 */
export function assertValidateArgs(positional: string[]): void {
    if (positional.length === 0) {
        throw usageError('validate requires a file path');
    }
    if (positional.length > 1) {
        throw usageError(`validate takes one file, got ${positional.length}`);
    }
}
