/**
 * @fileoverview `Render preview`'s two per-run decisions: the tone it writes
 * onto its copy of the example data, and the transparent background it asks the
 * action for.
 *
 * @remarks
 * The tone is random, and randomness in CI has one job here: never being the
 * reason the job went red. So the picker is tested against draws at and beyond
 * both ends of its range, not just against whatever `Math.random` happens to
 * return on the machine running this - and the second half of this file pins
 * the wiring, because a picker nothing calls is not a preview that varies.
 *
 * The YAML is read as text rather than parsed: the repository has no YAML
 * dependency of its own (`js-yaml` arrives with a transitive package), and what
 * matters is only that these few strings are present.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { pickTone } from '../../scripts/preview-tone.ts';
import { JmTone } from '../../src/model/data/style.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** The one source of tone names: the model's own enum, read in order. */
const TONES: readonly string[] = Object.values(JmTone);

const ACTION = readFileSync(join(ROOT, '.github/actions/render-map/action.yml'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

test('pickTone: every tone in the model is reachable, in the model\'s order', () => {
    // The expected list comes from JmTone, so this fails if the picker grows a
    // list of its own and that list drifts from the palette.
    const picked = TONES.map((_tone, index) => pickTone(() => (index + 0.5) / TONES.length));
    assert.deepEqual(picked, [...TONES]);
});

test('pickTone: a draw outside [0, 1) is clamped, never undefined', () => {
    // Math.random() cannot produce these, but the flake rule is about the job,
    // not about the generator's documentation: a draw of 1 indexes past the end
    // and hands `undefined` to `mind set-style`.
    assert.equal(pickTone(() => 1), TONES[TONES.length - 1]);
    assert.equal(pickTone(() => 999), TONES[TONES.length - 1]);
    assert.equal(pickTone(() => -1), TONES[0]);
    assert.equal(pickTone(() => Number.NaN), TONES[0]);
});

test('pickTone: real randomness always lands on a legal tone', () => {
    for (let draw = 0; draw < 500; draw++) {
        const tone: string = pickTone();
        assert.ok(TONES.includes(tone), `${tone} is not one of ${TONES.join(', ')}`);
    }
});

test('pickTone: a run can differ from the next one', () => {
    // Not "is random" - that is unprovable - but that the pick is not pinned to
    // one entry, which is the way a "random" tone quietly becomes a constant.
    assert.notEqual(pickTone(() => 0), pickTone(() => 0.999));
});

test('the script prints one tone name and nothing else', () => {
    // What the workflow relies on: `tone=$(node scripts/preview-tone.ts)`. A
    // second line of output would be pasted into the CLI's argument.
    const run = spawnSync(process.execPath, [join(ROOT, 'scripts/preview-tone.ts')], {
        encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), run.stdout.trim().split('\n')[0]);
    assert.ok(TONES.includes(run.stdout.trim()), `unexpected stdout ${JSON.stringify(run.stdout)}`);
    assert.equal(run.stderr, '');
});

test('render-map: transparency is an input, and its default is opaque', () => {
    // The action has callers besides the preview; a default of "transparent"
    // would restyle all of their images without them asking.
    const input = /^ {2}transparent:\n(?: {4}.*\n)*? {4}default: '([^']*)'$/m.exec(ACTION);
    assert.ok(input, 'render-map should declare a transparent input with a default');
    assert.equal(input?.[1], 'false');
});

test('render-map: the flag follows the input rather than being always on', () => {
    // One RHS flag for one boolean input: `--transparent` appears in the args
    // array inside the conditional, and the command that runs the render takes
    // the array - not a hardcoded flag.
    assert.match(ACTION, /if \[ "\$TRANSPARENT" = "true" \]; then\s*\n\s*args\+=\(--transparent\)/);
    assert.match(ACTION, /node scripts\/render-preview\.ts "\$\{args\[@\]\}"/);
    assert.match(ACTION, /TRANSPARENT: \$\{\{ inputs\.transparent \}\}/);
});

test('the preview job turns transparency on, for its own render only', () => {
    assert.match(WORKFLOW, /data-file: tmp\/preview-data\.json/);
    assert.match(WORKFLOW, /transparent: 'true'/);
});

test('the preview job styles a copy, and never the tracked fixture', () => {
    assert.match(WORKFLOW, /cp example\/v2-features\.json tmp\/preview-data\.json/);
    assert.match(WORKFLOW, /node dist\/cli\.js mind set-style tmp\/preview-data\.json --default-tone "\$TONE"/);
    assert.ok(
        !/set-style example\//.test(WORKFLOW),
        'the tone must be written onto a copy; editing example/v2-features.json would make the preview show something the repository does not contain'
    );
});

test('the chosen tone reaches the job log and the comment', () => {
    assert.match(WORKFLOW, /tone=\$\(node scripts\/preview-tone\.ts\)/);
    assert.match(WORKFLOW, /echo "default tone for this run: \$tone"/);
    // Two consumers: the step that writes the tone, and the step that posts the
    // comment. A preview whose tone is not named in the comment leaves a reader
    // unable to tell a theme problem from a rendering problem.
    assert.equal(WORKFLOW.match(/TONE: \$\{\{ steps\.tone\.outputs\.tone \}\}/g)?.length, 2);
    assert.match(WORKFLOW, /defaultTone: \$TONE/);
});

test('no tone names are copied into the CI configuration', () => {
    // The failure this prevents: a name list in YAML that survives a palette
    // change and then hands the CLI a tone that no longer exists. Two shapes of
    // copy are checked - a list, and a literal passed to the flag.
    const listLike =
        /(?:default|primary|success|warning|danger|info|accent)\s*[,|]\s*(?:default|primary|success|warning|danger|info|accent)/;
    const literalFlag = /--default-tone\s+(?:default|primary|success|warning|danger|info|accent)\b/;

    for (const [name, text] of [
        ['action.yml', ACTION],
        ['ci.yml', WORKFLOW],
    ] as const) {
        assert.ok(!listLike.test(text), `${name} should read tone names from JmTone, not restate the list`);
        assert.ok(!literalFlag.test(text), `${name} should pass the picked tone, not a literal one`);
    }
});
