/**
 * `jsmind create` — start a new mind map file.
 *
 * @remarks
 * Every other command needs a mind map to exist already; this is the only one
 * that produces one from nothing. Without it the CLI can edit maps but not
 * begin one, which leaves the agent hand-writing the initial JSON — exactly
 * what the CLI exists to prevent.
 *
 * The document is built through `JmMind` and `serialize()` rather than assembled
 * as a literal, so a new file cannot drift away from what the serialiser emits
 * for every other map.
 *
 * @packageDocumentation
 */

import { existsSync } from 'node:fs';
import { JmMindJsonSerializer } from '../../serialization/json.ts';
import { JmMind } from '../../model/mind.ts';
import { JmNodeContent } from '../../model/data/node-content.ts';
import { validateMindData } from '../../serialization/validation.ts';
import { formatIssues } from '../format.ts';
import { renderJson, writeJsonFile, CREATE_WRITE_OPTIONS } from '../io.ts';
import { report } from '../shared.ts';
import { CliExit, dataError, usageError } from '../exit.ts';

/**
 * Options `create` reads, beyond the global ones.
 *
 * @remarks
 * Declared for the allow-list in `../options.ts`: a flag that is not here is
 * one this command would silently drop.
 *
 * The write flags come from `../io.ts` and exclude `--output`: this command
 * already names its file as a positional argument, and a redirect would be a
 * second, competing answer to "where does this go".
 */
export const CREATE_OPTIONS = ['title', 'name', 'author', 'force', ...CREATE_WRITE_OPTIONS] as const;

/** Options accepted by the create command. */
export interface CreateOptions {
    file: string;
    title: string;
    name?: string;
    author?: string;
    force: boolean;
    dryRun: boolean;
    backup: boolean;
    /** Emit `{file, rootNodeId}` instead of the confirmation line. */
    asJson: boolean;
}

/**
 * Runs the create command.
 *
 * @param options - Parsed options.
 * @returns Exit code.
 */
export function runCreate(options: CreateOptions): number {
    // Refuse to clobber by default. The same principle as every mutating
    // command: do not quietly destroy something that is already there.
    if (existsSync(options.file) && !options.force) {
        throw usageError(
            `${options.file} already exists. Use --force to overwrite, or pick another path.`
        );
    }

    // Build the object only from the fields that were actually given.
    //
    // Do not "simplify" this to `new JmMind({ name, author })`: mergeObjects
    // spreads user values over the defaults, and a present-but-undefined key
    // overwrites the default with undefined rather than being skipped. That
    // silently produces a document missing meta.name and meta.author, which the
    // validator then rejects as E_META.
    const metadata: { name?: string; author?: string } = {};
    // A mind map is normally named after its root. Defaulting name to title
    // means the common case needs one flag instead of two, and a document that
    // says "jsMind Mindmap" while its root says something else needs an
    // explicit --name to happen.
    metadata.name = options.name ?? options.title;
    if (options.author !== undefined) {
        metadata.author = options.author;
    }

    const mind = new JmMind(metadata);
    mind.root.content = new JmNodeContent('text', options.title);

    const serializer = new JmMindJsonSerializer();
    const doc = serializer.serialize(mind);

    // Check its own output before touching the disk. If the serialiser ever
    // emits something the validator rejects, that is a bug in this project,
    // not in the caller's data — the message says so.
    const check = validateMindData(doc);
    if (!check.valid) {
        throw dataError(
            `Refusing to write ${options.file}: the document built for it does not validate.\n` +
                `This is a bug in jsmind, not in your input.\n${formatIssues(check.errors)}`
        );
    }

    if (options.dryRun) {
        process.stdout.write(renderJson(doc));
        return CliExit.Ok;
    }

    writeJsonFile(doc, options.file, { dryRun: false, backup: options.backup });
    // The root's id is data: it comes from the `root` field of the document,
    // and `'root'` is only the default the constructor picks. Hand it back so
    // the next command does not have to run `context` to learn it.
    report(
        options.asJson,
        `created ${options.file} (root node id ${mind.root.id})`,
        { file: options.file, rootNodeId: mind.root.id }
    );
    return CliExit.Ok;
}

/**
 * Describes the create command for `--help`.
 */
export const createHelp = `jsmind create <file> --title <title> [options]

Start a new mind map containing a single root node.

  --title <title>    Root node label; also becomes meta.name (required)
  --name <name>      Override meta.name when it should differ from the title
  --author <author>  Author recorded in meta
  --force            Overwrite the file if it already exists
  --backup           Keep a .bak copy of the file being overwritten
  --dry-run          Print the document instead of writing it
  --json             Print {file, rootNodeId} instead of the confirmation line

Refuses to overwrite an existing file without --force.`;
