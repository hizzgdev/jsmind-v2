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
 *   cross-boundary  validate, context        — whole-document operations
 *   mind            structure and edges      — JmMind methods
 *   node            node attributes          — JmNode writable fields
 *
 * @packageDocumentation
 */

import { parseArgs } from 'node:util';
import { CliError, CliExit, usageError } from './exit.ts';
import { intOption, requireOption, type WriteOptions } from './io.ts';
import { runValidate, validateHelp, assertValidateArgs } from './commands/validate.ts';
import { runMind, mindHelp } from './commands/mind.ts';
import { runNode, nodeHelp } from './commands/node.ts';
import { runContext, contextHelp, DEFAULT_DEPTH, DEFAULT_MAX_TEXT } from './commands/context.ts';
import { runCreate, createHelp } from './commands/create.ts';

const PROGRAM = 'jsmind';

const HELP = `${PROGRAM} v2 — mind map data commands

Usage: ${PROGRAM} <command> [options]

Cross-boundary commands:
  create <file> --text <text>     Start a new mind map
  validate <file>                 Check a file against the format spec
  context <file> [options]        Discovery: show the tree and its ids

Structure and edges:
  mind <sub> <file> [options]     JmMind methods        (see: jsmind mind --help)

Node attributes:
  node <sub> <file> [options]     JmNode writable fields (see: jsmind node --help)

Options:
  --json                          Machine-readable output
  --dry-run                       Show what would change, write nothing
  --output <path>                 Write somewhere other than the input file
  --backup                        Keep a .bak copy before overwriting
  -h, --help                      Show this help

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
}

/**
 * Parses argv into options and positionals.
 *
 * @returns Parsed arguments, with the program and command stripped from
 *          positionals.
 * @throws {@link CliError} With `Usage` when the command line cannot be parsed.
 */
function parse(argv: string[]): ParsedArgs {
    try {
        const { values, positionals } = parseArgs({
            args: argv,
            allowPositionals: true,
            strict: true,
            options: {
                'json': { type: 'boolean', default: false },
                'dry-run': { type: 'boolean', default: false },
                'output': { type: 'string' },
                'backup': { type: 'boolean', default: false },
                'help': { type: 'boolean', short: 'h', default: false },
                // locators
                'node-id': { type: 'string' },
                'parent-id': { type: 'string' },
                'edge-id': { type: 'string' },
                'source-id': { type: 'string' },
                'target-id': { type: 'string' },
                // payloads
                'text': { type: 'string' },
                'folded': { type: 'string' },
                'side': { type: 'string' },
                'position': { type: 'string' },
                'type': { type: 'string' },
                'label': { type: 'string' },
                // context
                'focus': { type: 'string' },
                'depth': { type: 'string' },
                'max-text': { type: 'string' },
                'full-text': { type: 'boolean', default: false },
                'ids-only': { type: 'boolean', default: false },
                // create
                'name': { type: 'string' },
                'author': { type: 'string' },
                'force': { type: 'boolean', default: false },
            },
        });
        return { values: values as Record<string, unknown>, positionals };
    } catch (err) {
        // parseArgs throws a plain Error with a decent message; promote it so
        // the caller gets exit code 2 instead of a stack trace.
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
 * Dispatches one parsed invocation.
 *
 * @param parsed - Options and positionals.
 * @returns Exit code.
 * @throws {@link CliError} When the command fails.
 */
function dispatch(parsed: ParsedArgs): number {
    const [command, ...rest] = parsed.positionals;
    const asJson = parsed.values.json === true;

    if (parsed.values.help === true || command === undefined || command === 'help') {
        process.stdout.write(`${HELP}\n`);
        return CliExit.Ok;
    }

    switch (command) {
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
                text: requireOption(parsed.values, 'text'),
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
            if (typeof parsed.values.focus === 'string') {
                options.focus = parsed.values.focus;
            }
            return runContext(options);
        }
        case 'mind': {
            const [subcommand, file, ...extra] = rest;
            if (subcommand === undefined || file === undefined) {
                throw usageError(`mind requires a subcommand and a file\n\n${mindHelp}`);
            }
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
function main(argv: string[]): void {
    try {
        process.exitCode = dispatch(parse(argv));
    } catch (err) {
        if (err instanceof CliError) {
            process.stderr.write(`${err.message}\n`);
            process.exitCode = err.exit;
            return;
        }
        // Anything unexpected is a runtime failure, not a usage problem — the
        // caller should stop and look rather than retry with a different
        // command line.
        process.stderr.write(`Unexpected failure: ${(err as Error).message}\n`);
        process.exitCode = CliExit.IoError;
    }
}

main(process.argv.slice(2));
