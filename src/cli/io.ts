/**
 * File and stream plumbing shared by every CLI command.
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dataError, ioError, usageError } from './exit.ts';

/**
 * Reads and parses a JSON file.
 *
 * @param path - File to read.
 * @returns The parsed document.
 * @throws {@link CliError} With `IoError` when the file cannot be read, or with
 *         `InvalidData` when it is not valid JSON.
 */
export function readJsonFile(path: string): unknown {
    let text: string;
    try {
        text = readFileSync(path, 'utf8');
    } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'ENOENT') {
            throw ioError(`File not found: ${path}`);
        }
        if (code === 'EACCES') {
            throw ioError(`Permission denied: ${path}`);
        }
        throw ioError(`Cannot read ${path}: ${(err as Error).message}`);
    }

    try {
        return JSON.parse(text);
    } catch (err) {
        // Reachable file, unreadable content: that is a data problem, not a
        // filesystem one. Exit 1 tells the caller to fix the file; exit 3 would
        // send it to a human for something it can see for itself.
        throw dataError(`Not valid JSON: ${path} (${(err as Error).message})`);
    }
}

/**
 * Renders a document as the CLI writes it.
 *
 * @remarks
 * Two-space indent and a trailing newline, so a file the CLI touches stays
 * diff-friendly instead of collapsing onto one line.
 *
 * @param data - Document to render.
 * @returns JSON text ready to write.
 */
export function renderJson(data: unknown): string {
    return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * Options controlling how a command writes its result.
 *
 * @public
 */
export interface WriteOptions {
    /** Print what would be written; touch nothing. */
    dryRun: boolean;
    /** Write here instead of the input file. */
    output?: string;
    /** Keep a `.bak` copy of the original before overwriting. */
    backup: boolean;
}

/**
 * Writes a document to disk.
 *
 * @remarks
 * Returns the text that was written so the caller can validate exactly what
 * landed, rather than re-deriving it and hoping the two agree.
 *
 * @param data - Document to write.
 * @param target - Path to write to.
 * @param options - Dry-run / backup behaviour.
 * @returns The serialized text, or null in dry-run mode.
 */
export function writeJsonFile(
    data: unknown,
    target: string,
    options: WriteOptions
): string | null {
    const text = renderJson(data);

    if (options.dryRun) {
        return null;
    }

    if (options.backup && existsSync(target)) {
        try {
            copyFileSync(target, `${target}.bak`);
        } catch (err) {
            throw ioError(`Cannot create backup for ${target}: ${(err as Error).message}`);
        }
    }

    try {
        writeFileSync(target, text, 'utf8');
    } catch (err) {
        throw ioError(`Cannot write ${target}: ${(err as Error).message}`);
    }

    return text;
}

/**
 * Restores a file to a previously captured state.
 *
 * @remarks
 * Used when validation fails after a write. Best effort: if even the restore
 * fails the caller has already got a loud enough problem, so the original error
 * is not masked by this one.
 *
 * @param target - Path to restore.
 * @param previous - Exact contents to put back.
 */
export function restoreFile(target: string, previous: string): void {
    try {
        writeFileSync(target, previous, 'utf8');
    } catch {
        // Nothing useful to add; the caller reports the validation failure,
        // which is the real problem.
    }
}

/**
 * Reads an integer option that must be present.
 *
 * @param values - Parsed option values.
 * @param name - Option name without dashes.
 * @returns The integer.
 * @throws {@link CliError} With `Usage` when absent or not an integer.
 */
export function requireIntOption(values: Record<string, unknown>, name: string): number {
    const raw = values[name];
    if (raw === undefined) {
        throw usageError(`Missing required option --${name}`);
    }
    return parseIntOption(raw, name);
}

/**
 * Reads an integer option, falling back when it is absent.
 *
 * @param raw - Raw option value.
 * @param fallback - Used when the option is absent.
 * @param name - Option name for the error message.
 * @returns The integer.
 * @throws {@link CliError} With `Usage` when present but not a non-negative integer.
 */
export function intOption(raw: unknown, fallback: number, name: string): number {
    if (raw === undefined) {
        return fallback;
    }
    return parseIntOption(raw, name);
}

/**
 * Reads a positive number option, falling back when it is absent.
 *
 * Unlike {@link intOption} this accepts fractions, which is what a rendering
 * scale needs: 1.5 is a legitimate value, 0 is not - it would produce an
 * image with no pixels in it.
 *
 * @param raw - Raw option value.
 * @param fallback - Used when the option is absent.
 * @param name - Option name for the error message.
 * @returns The number.
 * @throws {@link CliError} With `Usage` when present but not a positive number.
 */
export function numberOption(raw: unknown, fallback: number, name: string): number {
    if (raw === undefined) {
        return fallback;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw usageError(`--${name} must be a positive number, got "${String(raw)}"`);
    }
    return value;
}

/**
 * Reads an option restricted to a fixed set of values.
 *
 * The allowed list goes in the message, because "not one of image/gif" alone
 * leaves the caller guessing what would have worked.
 *
 * @param raw - Raw option value.
 * @param fallback - Used when the option is absent.
 * @param allowed - Accepted values.
 * @param name - Option name for the error message.
 * @returns The chosen value.
 * @throws {@link CliError} With `Usage` when present but not in `allowed`.
 */
export function enumOption<T extends string>(
    raw: unknown,
    fallback: T,
    allowed: readonly T[],
    name: string
): T {
    if (raw === undefined) {
        return fallback;
    }
    const value = String(raw) as T;
    if (!allowed.includes(value)) {
        throw usageError(`--${name} must be one of ${allowed.join(', ')}, got "${value}"`);
    }
    return value;
}

/**
 * Converts one raw option value to a non-negative integer.
 *
 * @param raw - Raw value.
 * @param name - Option name for the error message.
 * @returns The integer.
 * @throws {@link CliError} With `Usage` when the value is not a non-negative integer.
 */
function parseIntOption(raw: unknown, name: string): number {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        throw usageError(`--${name} must be a non-negative integer, got "${String(raw)}"`);
    }
    return value;
}

/**
 * Reads a required string option from parsed arguments.
 *
 * @param values - Parsed option values.
 * @param name - Option name without dashes.
 * @returns The value.
 * @throws {@link CliError} With `Usage` when absent.
 */
export function requireOption(
    values: Record<string, unknown>,
    name: string
): string {
    const value = values[name];
    if (typeof value !== 'string' || value.length === 0) {
        throw usageError(`Missing required option --${name}`);
    }
    return value;
}

/**
 * Reads an optional string option.
 *
 * @param values - Parsed option values.
 * @param name - Option name without dashes.
 * @returns The value, or undefined.
 */
export function optionalOption(
    values: Record<string, unknown>,
    name: string
): string | undefined {
    const value = values[name];
    return typeof value === 'string' ? value : undefined;
}
