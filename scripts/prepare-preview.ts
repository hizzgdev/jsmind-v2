/**
 * @fileoverview `Render preview`'s preparation step: writes the example map,
 * with one randomly drawn `defaultTone`, to the file the render reads.
 *
 * @remarks
 * The preview renders a prepared copy, never the tracked fixture. This is the
 * step that makes the copy: read the input, draw a tone for this run, write the
 * document with `mind.style.defaultTone` set, and print the tone so the job can
 * name it in the comment.
 *
 * A tone per run, randomly, for two reasons: consecutive previews then differ,
 * so the picture on a pull request is not always the same one, and a palette
 * regression in a single tone has a run that shows it.
 *
 * The names come from {@link JmTone} — not from a list here, nor from the
 * workflow YAML, nor from the shell that calls this. A copy of the seven names
 * goes stale the first time the palette changes, and it goes stale silently:
 * the run that discovered it would be one that drew a retired name and had the
 * write refuse it, which reads like a broken job rather than a broken copy.
 *
 * Input and output are both arguments, and the output is the render's
 * `data-file`. That is the whole shape of the step — one path in, the same path
 * out — so the workflow reads top to bottom without a path appearing under two
 * names. Anything else the preview needs before rendering is another thing this
 * preparation does, not a second one-purpose script beside it.
 *
 * Prints the tone and nothing else to stdout, so a caller can do
 * `tone=$(node scripts/prepare-preview.ts in.json out.json)`.
 *
 * @packageDocumentation
 */

import { fileURLToPath } from 'node:url';

import { CliExit, describeFailure } from '../src/cli/exit.ts';
import { runMutation } from '../src/cli/mutate.ts';
import { JmTone } from '../src/model/data/style.ts';
import type { JmMind } from '../src/model/mind.ts';

/** Every tone the model accepts, in declaration order. */
const TONES: readonly JmTone[] = Object.values(JmTone);

/** What to print when the command line is wrong. */
const USAGE = 'usage: node scripts/prepare-preview.ts <input.json> <output.json>';

/**
 * Maps a random draw onto an index of {@link TONES}.
 *
 * @param draw - A number from a random source.
 * @returns An index that is always inside the array.
 * @remarks
 * Clamped rather than trusted. `Math.random()` is `[0, 1)`, so the naive
 * `Math.floor(draw * length)` is fine today — but a draw of exactly 1 indexes
 * one past the end and writes `undefined` into the document, and a NaN draw
 * does the same. Either would fail a job for a legal-looking call, which is
 * exactly the flake a random choice must not introduce.
 *
 * @private
 */
function toIndex(draw: number): number {
    if (!Number.isFinite(draw)) {
        return 0;
    }
    return Math.min(TONES.length - 1, Math.max(0, Math.floor(draw * TONES.length)));
}

/**
 * Picks one tone for this run.
 *
 * @param random - Source of randomness. Injectable so the choice can be tested
 * without depending on a particular draw; defaults to `Math.random`.
 * @returns A tone from {@link JmTone}, never `undefined`.
 */
export function pickTone(random: () => number = Math.random): JmTone {
    return TONES[toIndex(random())];
}

/**
 * Writes the prepared document the preview will render.
 *
 * @param input - The tracked fixture to prepare.
 * @param output - Where the prepared document goes; the render's `data-file`.
 * @param random - Source of randomness, forwarded to {@link pickTone}.
 * @returns The tone written into the document.
 * @throws {@link CliError} With `InvalidData` when the input does not validate,
 * or `IoError` when either file cannot be read or written.
 * @remarks
 * Through {@link runMutation}, the same load → mutate → write → validate path
 * every writing command uses. The prepared file has to be a document the
 * renderer accepts, and the post-write check is what asserts that; a
 * hand-rolled read/parse/write here would skip it and hand `jsmind export` a
 * file whose validity nothing had checked.
 *
 * The style block is spread rather than replaced: a document that already
 * declares a theme or its own `tones` keeps them, and only the tone this run
 * drew changes — the same thing `mind set-style` does through its own
 * `applyStyle`.
 */
export function preparePreview(
    input: string,
    output: string,
    random: () => number = Math.random
): JmTone {
    const tone = pickTone(random);
    return runMutation(input, { dryRun: false, output, backup: false }, (mind: JmMind) => {
        mind.style = { ...mind.style, defaultTone: tone };
        return tone;
    });
}

/**
 * Runs the preparation and reports the outcome the way the CLI does.
 *
 * @param argv - Arguments after the executable and script path.
 * @returns The exit code the process should end with.
 */
export function main(argv: string[]): number {
    const [input, output, ...extra] = argv;
    if (input === undefined || output === undefined || extra.length > 0) {
        process.stderr.write(`${USAGE}\n`);
        return CliExit.Usage;
    }

    try {
        const tone = preparePreview(input, output);
        // stdout carries the tone and nothing else: the workflow captures the
        // whole stream into `$tone`, so a second line would land inside that
        // value rather than beside it.
        process.stdout.write(`${tone}\n`);
        return CliExit.Ok;
    } catch (err) {
        const failure = describeFailure(err);
        process.stderr.write(`${failure.message}\n`);
        return failure.exit;
    }
}

// Run only as a program: the tests import the functions above.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main(process.argv.slice(2));
}
