/**
 * Load → mutate → write → verify → roll back, shared by every mutating
 * command.
 *
 * @remarks
 * The post-write validation is not optional. A CLI that can silently corrupt a
 * file is worse than no CLI: an agent would keep using the damaged document.
 * Every mutation therefore runs the full integrity check against what actually
 * landed on disk and restores the original bytes when it fails.
 *
 * @packageDocumentation
 */

import { JmMindJsonSerializer, type SerializedMindMap } from '../serialization/json.ts';
import { validateMindData } from '../serialization/validation.ts';
import { formatIssues } from './format.ts';
import type { JmMind } from '../model/mind.ts';
import { readJsonFile, renderJson, writeJsonFile, restoreFile, type WriteOptions } from './io.ts';
import { dataError } from './exit.ts';
import { readFileSync } from 'node:fs';

/**
 * Runs one mutating command against a file.
 *
 * @remarks
 * Three protections apply: `dryRun` never touches the file, `backup` keeps a
 * `.bak`, and `output` redirects the write. When none are set the input file is
 * rewritten in place, which is the agent's normal workflow.
 *
 * @param file - Input mind map.
 * @param options - Dry-run / backup / output settings.
 * @param mutate - Receives the loaded mind map, returns the value to report.
 * @returns The reported value, with the exit code assumed to be 0.
 * @throws {@link CliError} With `InvalidData` when the file or result does not
 *         validate, or `IoError` when the file cannot be read or written.
 */
export function runMutation<T>(
    file: string,
    options: WriteOptions,
    mutate: (mind: JmMind) => T
): T {
    const serializer = new JmMindJsonSerializer();

    // Refuse to operate on a document that is already broken: any change we make
    // would be layered on top of existing damage and the post-write check would
    // blame our edit.
    const original = readJsonFile(file);
    const before = validateMindData(original);
    if (!before.valid) {
        throw dataError(
            `Refusing to modify ${file}: it does not validate.\n${formatIssues(before.errors)}`
        );
    }

    const mind = serializer.deserialize(original as SerializedMindMap);
    const value = mutate(mind);

    const next = serializer.serialize(mind);
    const target = options.output ?? file;

    if (options.dryRun) {
        process.stdout.write(`${renderJson(next)}`);
        return value;
    }

    // Capture the exact bytes before writing so a failed check can put them back.
    let previous: string | null = null;
    try {
        previous = readFileSync(target, 'utf8');
    } catch {
        // Target did not exist (--output to a new path). Nothing to restore.
    }

    writeJsonFile(next, target, options);

    const after = validateMindData(next);
    if (!after.valid) {
        if (previous !== null) {
            restoreFile(target, previous);
        }
        throw dataError(
            `Validation failed after write, ${previous === null ? 'new file left in place' : 'rolled back'}:\n` +
                `${formatIssues(after.errors)}\nFile unchanged.`
        );
    }

    return value;
}

