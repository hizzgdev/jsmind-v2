/**
 * Which options each subcommand accepts, and what to do with the rest.
 *
 * @remarks
 * Each command already reads the options it needs, one at a time, where it uses
 * them. That is not the same thing as declaring what it *accepts*: the argument
 * parser takes every flag in its table, and the command reads the two or three
 * it cares about, so a flag belonging to a sibling subcommand was accepted and
 * then dropped. `jsmind mind move --side left` moved the node and discarded the
 * side; the command echoed success, wrote the file, and did not do what was
 * asked. A caller that only reads exit codes and stdout cannot tell that apart
 * from working.
 *
 * This module is the missing half: one entry per subcommand listing the flags
 * it reads. Anything else is an unknown option, reported on stderr and — with
 * `--strict` — refused. The lists are imported from the modules that own the
 * flags instead of being restated here, and those modules key their tables by
 * their own subcommand unions, so adding a subcommand without an allow-list is a
 * compile error rather than a silent hole.
 *
 * There is deliberately no spelling suggestion. Deciding that `--sdie` "looks
 * like" `--side` means guessing at intent, and a wrong guess sends the caller
 * to fix a flag it never typed.
 *
 * @packageDocumentation
 */

import type { ParseArgsOptionsConfig } from 'node:util';

import { CREATE_OPTIONS } from './commands/create.ts';
import { VALIDATE_OPTIONS } from './commands/validate.ts';
import { CONTEXT_OPTIONS } from './commands/context.ts';
import { EXPORT_OPTIONS } from './commands/export.ts';
import { MIND_OPTIONS } from './commands/mind.ts';
import { NODE_OPTIONS } from './commands/node.ts';
import { usageError } from './exit.ts';

/**
 * Every option the parser knows, and whether it takes a value.
 *
 * @remarks
 * This table says which flags exist; the allow-lists below say which subcommand
 * may use them. They live in one module so they can be compared — the tests
 * check that every allowed name is in this table, which is what turns a typo in
 * an allow-list into a failure instead of a flag that can never be accepted.
 *
 * Laid out by the subcommand that reads each flag, with the shared locators and
 * payloads at the top. A flag reachable from two commands (`--type` for export
 * and for edges) appears once.
 */
export const OPTION_SPEC: ParseArgsOptionsConfig = {
    'json': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'output': { type: 'string' },
    'backup': { type: 'boolean', default: false },
    'help': { type: 'boolean', short: 'h', default: false },
    'strict': { type: 'boolean', default: false },
    'version': { type: 'boolean', default: false },
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
    // node style (set-style). Strings, including the numeric ones: the command
    // parses and range-checks them itself so a bad value names the flag rather
    // than a JSON path. Dots mark a level, matching the path each flag
    // addresses.
    'tone': { type: 'string' },
    'background': { type: 'string' },
    'color': { type: 'string' },
    'border-color': { type: 'string' },
    'border-width': { type: 'string' },
    'border-style': { type: 'string' },
    'font-size': { type: 'string' },
    'font-weight': { type: 'string' },
    'incoming.color': { type: 'string' },
    'incoming.width': { type: 'string' },
    'incoming.pattern': { type: 'string' },
    'incoming.curve': { type: 'string' },
    'clear': { type: 'string' },
    'reset': { type: 'boolean', default: false },
    // document style (mind set-style)
    'default-tone': { type: 'string' },
    // context
    'focus': { type: 'string' },
    // Repeatable: one flag per label, so a label containing a comma needs no
    // escaping and a caller can assemble the arguments without joining.
    'highlight': { type: 'string', multiple: true },
    'depth': { type: 'string' },
    'max-text': { type: 'string' },
    'full-text': { type: 'boolean', default: false },
    'ids-only': { type: 'boolean', default: false },
    // create
    'title': { type: 'string' },
    'name': { type: 'string' },
    'author': { type: 'string' },
    'force': { type: 'boolean', default: false },
    // export
    'width': { type: 'string' },
    'height': { type: 'string' },
    'scale': { type: 'string' },
    'transparent': { type: 'boolean', default: false },
};

/**
 * Options every subcommand accepts, whatever it does.
 *
 * @remarks
 * `--help` and `--version` are here rather than in any command's list: they
 * answer for the whole program, so they can never be the wrong flag.
 *
 * `--output` is global even though `create` does not read it — it names the
 * file the command writes, and `create` already takes that as its positional.
 * Treating it as an error there would turn a reasonable-but-pointless flag into
 * a failed run; the command's own help says where the path goes.
 */
export const GLOBAL_OPTIONS = [
    'json',
    'dry-run',
    'output',
    'backup',
    'strict',
    'version',
    'help',
] as const;

/**
 * Adds the group name to every key of a subcommand table.
 *
 * @param prefix - The words that select the group, e.g. `mind` or `node`.
 * @param table - Subcommand → allowed options.
 * @returns The same entries, keyed by the words a caller types.
 */
function prefixed(
    prefix: string,
    table: Record<string, readonly string[]>
): Record<string, readonly string[]> {
    const keyed: Record<string, readonly string[]> = {};
    for (const [subcommand, allowed] of Object.entries(table)) {
        keyed[`${prefix} ${subcommand}`] = allowed;
    }
    return keyed;
}

/**
 * The allow-list for every subcommand, keyed by the words that select it.
 *
 * @remarks
 * A key is what {@link commandKey} produces from the invocation, so the lookup
 * never has to know how deep a command nests. `validate` maps to an empty list
 * on purpose: it takes a file and nothing else, and `--json` reaches it through
 * {@link GLOBAL_OPTIONS}. `help` is listed too, so `jsmind help mind --sdie`
 * is judged like any other command line instead of falling through unexamined.
 */
export const COMMAND_OPTIONS: Record<string, readonly string[]> = {
    create: CREATE_OPTIONS,
    validate: VALIDATE_OPTIONS,
    context: CONTEXT_OPTIONS,
    export: EXPORT_OPTIONS,
    help: [],
    ...prefixed('mind', MIND_OPTIONS),
    ...prefixed('node', NODE_OPTIONS),
};

/**
 * The table key an invocation is filed under.
 *
 * @param positionals - Everything that was not an option: command, subcommand
 *                      and the file paths.
 * @returns The key to look up in {@link COMMAND_OPTIONS}, or `undefined` when
 *          the command line does not name a command at all.
 * @remarks
 * Only the words that select a command are read. Both groups are one level
 * deep — `mind set-style`, `node set-text` — so the word after the group is the
 * whole subcommand and a file path sits where this function stops looking.
 *
 * There is no depth case to keep in step with the dispatcher any more. When
 * `mind style set` wrote the document style, `style` was a level of its own and
 * this function had to know that; now the same command is one word, and a
 * subcommand added to either group needs no change here.
 */
export function commandKey(positionals: readonly string[]): string | undefined {
    const [command, second] = positionals;
    if (command === undefined) {
        return undefined;
    }
    if (command === 'mind' || command === 'node') {
        return second === undefined ? undefined : `${command} ${second}`;
    }
    return command;
}

/**
 * Options the invocation supplied that its command does not accept.
 *
 * @param positionals - Words that selected the command.
 * @param supplied - Option names that appeared, as the parser keyed them.
 * @returns The offending names, in first-seen order, without duplicates.
 * @remarks
 * With no command named, the supplied options are judged against
 * {@link GLOBAL_OPTIONS}: `jsmind --jdson` is a typo for a global flag even
 * though no subcommand is there to own it.
 *
 * A command or subcommand the table does not describe returns nothing rather
 * than guessing: that invocation is already on its way to an "unknown command"
 * usage error, and a second complaint about its options would bury the first.
 */
export function unknownOptions(
    positionals: readonly string[],
    supplied: readonly string[]
): string[] {
    const key = commandKey(positionals);
    const allowed = key === undefined ? GLOBAL_OPTIONS : COMMAND_OPTIONS[key];
    if (allowed === undefined) {
        return [];
    }

    const known = new Set<string>([...GLOBAL_OPTIONS, ...allowed]);
    return [...new Set(supplied)].filter(name => !known.has(name));
}

/**
 * Reports the options the invocation cannot use, or refuses them under `--strict`.
 *
 * @param positionals - Words that selected the command.
 * @param supplied - Option names that appeared, as the parser keyed them.
 * @param strict - Whether an unknown option is a usage error instead of a warning.
 * @throws {@link CliError} With `Usage` when `strict` is set and an option is unknown.
 * @remarks
 * The warning goes to stderr because stdout is a contract: `jsmind context
 * x.json --json | jq` has to parse whatever happens on the command line. The
 * command itself still runs and its exit code is untouched, so a caller that
 * has not adopted `--strict` sees exactly the result it saw before — plus one
 * line telling it the flag did nothing.
 *
 * The cost of that choice is real and documented rather than fixed: a consumer
 * that only reads stdout and the exit code never sees the warning. That is why
 * `--strict` exists for callers that want the failure.
 */
export function checkOptions(
    positionals: readonly string[],
    supplied: readonly string[],
    strict: boolean
): void {
    const unknown = unknownOptions(positionals, supplied);
    if (unknown.length === 0) {
        return;
    }

    const key = commandKey(positionals);
    const noun = unknown.length === 1 ? 'option' : 'options';
    const list = unknown.map(name => `--${name}`).join(', ');
    // "for <command>" only when there is one to name; a bare `jsmind --sdie`
    // has no command to be wrong about, but the flag is still unknown.
    const subject = key === undefined ? '' : ` for "${key}"`;

    if (strict) {
        throw usageError(`Unknown ${noun}${subject}: ${list}`);
    }
    process.stderr.write(
        `jsmind: warning: unknown ${noun}${subject}: ${list} ` +
            '(--strict makes this an error)\n'
    );
}

/**
 * The fields of a parsed option token this module reads.
 *
 * @remarks
 * Structural rather than imported: the parser's token type is generic over its
 * config, and naming it here would tie this module to the entry point's spec for
 * no benefit.
 */
export interface OptionTokenFields {
    /** `option`, `positional` or `option-terminator`. */
    readonly kind: string;
    /** Long name the option is keyed by: `depth` for `--depth` and `-d` alike. */
    readonly name?: string;
    /** What the following argument became, when there was one. */
    readonly value?: string;
    /** Whether the value came from `--depth=5` instead of the next argument. */
    readonly inlineValue?: boolean;
}

/**
 * Restores the value checks the strict parser made.
 *
 * @remarks
 * Parsing leniently is what lets an unknown option reach the allow-list, but it
 * also drops the three value checks strict parsing made, and each drop turns a
 * command line that used to fail into one that runs and does the wrong thing:
 *
 * - a string option with no value falls back to its default (`--depth`), or
 *   takes the next flag as a path (`--output --json`);
 * - a string option whose value is another flag takes that flag as its value;
 * - a boolean option given a value is read as that string, and every command
 *   compares `values.x === true`, so the flag is silently dropped — which is
 *   how `--dry-run=true` came to perform the write it was asked to suppress.
 *
 * All three reproduce the parse error strict mode raised, worded the same way.
 *
 * This runs before the allow-list so a malformed value is reported as itself,
 * and only for options the spec knows: an unknown option with no value is not
 * missing a value, it is unknown, and that is the other message.
 *
 * @param tokens - Option tokens from the parser.
 * @throws {@link CliError} With `Usage` when a value is missing, looks like
 *         another option, or is given to an option that takes none.
 */
export function assertOptionValues(tokens: readonly OptionTokenFields[]): void {
    for (const token of tokens) {
        if (token.kind !== 'option' || token.name === undefined) {
            continue;
        }
        const spec = OPTION_SPEC[token.name];
        if (spec === undefined) {
            continue;
        }
        if (spec.type === 'boolean') {
            if (token.value !== undefined) {
                throw usageError(`Option '--${token.name}' does not take an argument`);
            }
            continue;
        }
        if (token.value === undefined) {
            throw usageError(`Option '--${token.name} <value>' argument missing`);
        }
        if (token.inlineValue === false && token.value.startsWith('-')) {
            throw usageError(`Option '--${token.name}' argument is ambiguous.`);
        }
    }
}
