/**
 * File and stream plumbing shared by every CLI command.
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { ioError, usageError } from './exit.ts';

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
        throw ioError(`Not valid JSON: ${path} (${(err as Error).message})`);
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
