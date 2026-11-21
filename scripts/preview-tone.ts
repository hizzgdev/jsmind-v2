/**
 * @fileoverview `Render preview`'s tone for one run: a random `defaultTone`,
 * read from the model's own list.
 *
 * @remarks
 * The preview writes a document-level tone onto a copy of the example data
 * before rendering it. Two reasons: consecutive previews then differ, so the
 * picture on a pull request is not always the same one, and a palette
 * regression in a single tone has somewhere to show up.
 *
 * The names come from {@link JmTone} - not from a list here, nor from the
 * workflow YAML, nor from the shell that calls this. A copy of the seven names
 * goes stale the first time the palette changes, and it goes stale silently:
 * the run that discovered it would be one that picked a retired name and had
 * `mind set-style` refuse it, which reads like a broken job rather than a
 * broken copy.
 *
 * Writes one name and nothing else, so a caller can do
 * `tone=$(node scripts/preview-tone.ts)` and pass the result straight to the
 * CLI.
 *
 * @packageDocumentation
 */

import { fileURLToPath } from 'node:url';

import { JmTone } from '../src/model/data/style.ts';

/** Every tone the model accepts, in declaration order. */
const TONES: readonly JmTone[] = Object.values(JmTone);

/**
 * Maps a random draw onto an index of {@link TONES}.
 *
 * @param draw - A number from a random source.
 * @returns An index that is always inside the array.
 * @remarks
 * Clamped rather than trusted. `Math.random()` is `[0, 1)`, so the naive
 * `Math.floor(draw * length)` is fine today - but a draw of exactly 1 indexes
 * one past the end and hands `undefined` to the CLI, and a NaN draw does the
 * same. Either would fail a job for a legal-looking call, which is exactly the
 * flake a random choice must not introduce.
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

// Run only as a program: the tests import `pickTone`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.stdout.write(`${pickTone()}\n`);
}
