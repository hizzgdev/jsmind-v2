#!/usr/bin/env node
/**
 * jsMind v2 command line entry point.
 *
 * @remarks
 * The CLI is the agent-facing surface: it exposes the data layer (model +
 * serialization) without dragging in the renderer, so it runs on plain Node.
 *
 * Commands are grouped by what they operate on:
 *
 *   cross-boundary  create, validate, export, context — whole-document operations
 *   mind            structure, edges and mind.style    — JmMind methods and fields
 *   node            node attributes                    — JmNode writable fields
 *
 * @packageDocumentation
 */

import { parseArgs } from 'node:util';
import { CliExit, CliError, describeFailure, usageError } from './exit.ts';
import {
    enumOption,
    intOption,
    numberOption,
    requireOption,
    type WriteOptions,
} from './io.ts';
import {
    runExport,
    exportHelp,
    EXPORT_TYPES,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    DEFAULT_SCALE,
} from './commands/export.ts';
import { JmImageType } from '../view/export.ts';
import { runValidate, validateHelp, assertValidateArgs } from './commands/validate.ts';
import { runMind, mindHelp, assertMindSubcommand } from './commands/mind.ts';
import { mindSetStyleHelp } from './commands/style.ts';
import { runNode, nodeHelp, setStyleHelp } from './commands/node.ts';
import { runContext, contextHelp, DEFAULT_DEPTH, DEFAULT_MAX_TEXT } from './commands/context.ts';
import { runCreate, createHelp } from './commands/create.ts';
import { checkOptions, assertOptionValues, OPTION_SPEC } from './options.ts';
import { packageVersion } from './version.ts';

const PROGRAM = 'jsmind';

export const HELP = `${PROGRAM} v2 — mind map data commands

Usage: ${PROGRAM} <command> [options]

Cross-boundary commands:
  create <file> --title <title>   Start a new mind map
  validate <file>                 Check a file against the format spec
  export <file> <out.png>         Render to an image  (needs a browser)
  context <file> [options]        Discovery: show the tree and its ids

Structure, edges and the document's style:
  mind <sub> <file> [options]     JmMind methods and fields  (see: jsmind mind --help)

Node attributes:
  node <sub> <file> [options]     JmNode writable fields (see: jsmind node --help)

Options:
  --json                          Machine-readable output
  --dry-run                       Show what would change, write nothing
  --output <path>                 Write somewhere other than the input file
  --backup                        Keep a .bak copy before overwriting
  --strict                        Treat an unknown option as a usage error
  --version                       Print the version and exit
  -h, --help                      Show this help

An option the named command does not take is reported on stderr and ignored, so
a misspelt flag no longer looks like a successful run. The warning never goes to
stdout, which keeps --json output parseable — and also means a consumer that
reads only stdout does not see it. Pass --strict when that blind spot matters.

Exit codes:
  0  success
  1  invalid data
  2  usage error
  3  IO or runtime error

${createHelp}

${validateHelp}

${contextHelp}

${mindHelp}

${nodeHelp}`;

/**
 * Parsed incoming arguments.
 */
interface ParsedArgs {
    values: Record<string, unknown>;
    positionals: string[];
    /**
     * Every option name that appeared, in the order it appeared.
     *
     * @remarks
     * `values` cannot answer "was this flag given?" for a flag the parser does
     * not know — it lands there under its own name, but so would a default. The
     * tokens are the only record of what the caller actually typed, and the
     * allow-list check needs exactly that.
     */
    optionNames: string[];
}

/**
 * Parses argv into options, positionals and the option names used.
 *
 * @returns Parsed arguments, with the program and command stripped from
 *          positionals.
 * @throws {@link CliError} With `Usage` when the command line cannot be parsed.
 * @remarks
 * `strict` is off deliberately. Strict parsing rejects an unknown option
 * immediately, which is the one thing this CLI must not do without saying so:
 * the flag reaches the dispatcher, which knows which subcommand was named and
 * can therefore report `--side` on `move` as well as a typo. The allow-lists in
 * `options.ts` take over the job strict mode was doing, with a message that
 * names the command.
 *
 * A known option given without its value still fails here, as it should: that
 * is a malformed command line whatever the subcommand is.
 */
function parse(argv: string[]): ParsedArgs {
    try {
        const { values, positionals, tokens } = parseArgs({
            args: argv,
            allowPositionals: true,
            strict: false,
            tokens: true,
            options: OPTION_SPEC,
        });
        // Lenient parsing drops two value checks that strict parsing made;
        // put them back before anything reads a value.
        assertOptionValues(tokens);
        return {
            values: values as Record<string, unknown>,
            positionals,
            optionNames: tokens.flatMap(token => (token.kind === 'option' ? [token.name] : [])),
        };
    } catch (err) {
        // parseArgs throws a plain Error with a decent message; promote it so
        // the caller gets exit code 2 instead of a stack trace. Errors raised
        // by this module are already classified - re-wrapping them would only
        // change their type.
        if (err instanceof CliError) {
            throw err;
        }
        throw usageError((err as Error).message);
    }
}

/**
 * Reads the write-behaviour flags.
 *
 * @param values - Parsed options.
 * @returns Write options for the mutation pipeline.
 */
function writeOptions(values: Record<string, unknown>): WriteOptions {
    const result: WriteOptions = {
        dryRun: values['dry-run'] === true,
        backup: values.backup === true,
    };
    if (typeof values.output === 'string') {
        result.output = values.output;
    }
    return result;
}

/**
 * Picks the help text that matches how specific the invocation was.
 *
 * @param positionals - Command and, optionally, subcommand: `['mind']`,
 *                      `['node', 'set-style']`, and so on.
 * @returns The focused block, or `undefined` when the full index is the right
 *          answer.
 * @remarks
 * `--help` used to print the root block before the command was looked at, so
 * `jsmind mind --help` handed back the same 134 lines the root help points
 * away from. The ladder is written out rather than derived from a registry:
 * `set-style` is the only subcommand whose field table is long enough to swamp
 * the group block it sits in, and it has that block in both groups.
 *
 * Every command has its own block at the first level, so `--help` never has to
 * fall back to the index: `create`, `validate`, `context` and `export` are
 * single pages whose block was already embedded in `HELP` (or, for `export`,
 * written but never reached) — printing the index for them asked the reader to
 * find the one part that answers their question inside 134 lines.
 */
function focusedHelp(positionals: string[]): string | undefined {
    const [command, subcommand] = positionals;
    switch (command) {
        case 'create':
            return createHelp;
        case 'validate':
            return validateHelp;
        case 'context':
            return contextHelp;
        case 'export':
            return exportHelp;
        case 'mind':
            // Three words deep, same as `node set-style`: `set-style` carries a
            // field table, everything else in the group fits in mindHelp.
            return subcommand === 'set-style' ? mindSetStyleHelp : mindHelp;
        case 'node':
            return subcommand === 'set-style' ? setStyleHelp : nodeHelp;
        default:
            return undefined;
    }
}

/**
 * Dispatches one parsed invocation.
 *
 * @param parsed - Options and positionals.
 * @returns Exit code.
 * @throws {@link CliError} When the command fails.
 */
function dispatch(parsed: ParsedArgs): number | Promise<number> {
    const [command, ...rest] = parsed.positionals;
    const asJson = parsed.values.json === true;

    // `--version` is an answer on its own: no command is needed, nothing may be
    // printed beside it, and the flags around it are therefore not judged.
    if (parsed.values.version === true) {
        process.stdout.write(`${packageVersion()}\n`);
        return CliExit.Ok;
    }

    // An option this invocation cannot use is reported rather than obeyed. The
    // check runs before dispatch so the warning names the command the caller
    // meant, and `--help` is exempt because it answers without running anything
    // — the flags beside it have no command to be wrong for.
    if (parsed.values.help !== true) {
        checkOptions(parsed.positionals, parsed.optionNames, parsed.values.strict === true);
    }

    // `help <command>` asks the same question as `<command> --help`, so both
    // resolve through the same ladder. With no topic at all, the full index is
    // the answer.
    if (command === undefined || command === 'help' || parsed.values.help === true) {
        const topic = command === 'help' ? rest : parsed.positionals;
        process.stdout.write(`${focusedHelp(topic) ?? HELP}\n`);
        return CliExit.Ok;
    }

    switch (command) {
        case 'export': {
            const [file, output, ...extra] = rest;
            if (file === undefined || output === undefined) {
                throw usageError('export requires an input file and an output image path');
            }
            if (extra.length > 0) {
                throw usageError(`Unexpected arguments: ${extra.join(' ')}`);
            }
            return runExport({
                file,
                output,
                width: numberOption(parsed.values.width, DEFAULT_WIDTH, 'width'),
                height: numberOption(parsed.values.height, DEFAULT_HEIGHT, 'height'),
                scale: numberOption(parsed.values.scale, DEFAULT_SCALE, 'scale'),
                type: enumOption(parsed.values.type, JmImageType.Png, EXPORT_TYPES, 'type'),
                asJson,
                transparent: parsed.values.transparent === true,
            });
        }
        case 'validate': {
            assertValidateArgs(rest);
            return runValidate(rest[0], asJson);
        }
        case 'create': {
            const [file, ...extra] = rest;
            if (file === undefined) {
                throw usageError('create requires a file path');
            }
            if (extra.length > 0) {
                throw usageError(`Unexpected arguments: ${extra.join(' ')}`);
            }
            const options: Parameters<typeof runCreate>[0] = {
                file,
                title: requireOption(parsed.values, 'title'),
                force: parsed.values.force === true,
                dryRun: parsed.values['dry-run'] === true,
                // --output is deliberately not forwarded: for create the path
                // is already a positional argument, and an output redirect
                // would give two competing answers to "where does this go".
                backup: parsed.values.backup === true,
            };
            if (typeof parsed.values.name === 'string') {
                options.name = parsed.values.name;
            }
            if (typeof parsed.values.author === 'string') {
                options.author = parsed.values.author;
            }
            return runCreate(options);
        }
        case 'context': {
            const [file, ...extra] = rest;
            if (file === undefined) {
                throw usageError('context requires a file path');
            }
            if (extra.length > 0) {
                throw usageError(`Unexpected arguments: ${extra.join(' ')}`);
            }
            const options: Parameters<typeof runContext>[0] = {
                file,
                depth: intOption(parsed.values.depth, DEFAULT_DEPTH, 'depth'),
                maxText: intOption(parsed.values['max-text'], DEFAULT_MAX_TEXT, 'max-text'),
                fullText: parsed.values['full-text'] === true,
                idsOnly: parsed.values['ids-only'] === true,
                asJson,
            };
            // `multiple: true` makes this a list; a single flag arrives as a
            // one-element list, so both shapes read the same way.
            const highlight = parsed.values.highlight;
            if (Array.isArray(highlight) && highlight.length > 0) {
                options.highlight = highlight.filter(
                    (text): text is string => typeof text === 'string'
                );
            }
            return runContext(options);
        }
        case 'mind': {
            const [subcommand, file, ...extra] = rest;
            if (subcommand === undefined || file === undefined) {
                throw usageError(`mind requires a subcommand and a file\n\n${mindHelp}`);
            }
            // The subcommand is judged before the words after it, so the retired
            // three-word form (`mind style set f.json`) is told which word is
            // wrong instead of being told the file is surplus.
            assertMindSubcommand(subcommand);
            if (extra.length > 0) {
                throw usageError(`Unexpected arguments: ${extra.join(' ')}`);
            }
            return runMind(file, subcommand, parsed.values, writeOptions(parsed.values));
        }
        case 'node': {
            const [subcommand, file, ...extra] = rest;
            if (subcommand === undefined || file === undefined) {
                throw usageError(`node requires a subcommand and a file\n\n${nodeHelp}`);
            }
            if (extra.length > 0) {
                throw usageError(`Unexpected arguments: ${extra.join(' ')}`);
            }
            return runNode(file, subcommand, parsed.values, writeOptions(parsed.values));
        }
        default:
            throw usageError(`Unknown command: ${command}\n\nRun "${PROGRAM} --help" for usage.`);
    }
}

/**
 * Runs the CLI and terminates the process.
 *
 * @param argv - Arguments after the executable and script path.
 */
async function main(argv: string[]): Promise<void> {
    try {
        process.exitCode = await dispatch(parse(argv));
    } catch (err) {
        const failure = describeFailure(err);
        process.stderr.write(`${failure.message}\n`);
        process.exitCode = failure.exit;
    }
}

void main(process.argv.slice(2));
