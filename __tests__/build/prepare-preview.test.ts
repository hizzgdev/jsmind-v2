/**
 * @fileoverview `Render preview`'s preparation step: the tone it draws, the
 * file it writes, and the transparent background it asks the action for.
 *
 * @remarks
 * The tone is random, and randomness in CI has one job here: never being the
 * reason the job went red. So the picker is tested against draws at and beyond
 * both ends of its range, not just against whatever `Math.random` happens to
 * return on the machine running this.
 *
 * The rest is the wiring, because a picker nothing calls is not a preview that
 * varies, and a prepared file the render does not read is not a preparation.
 * The two paths are pinned to each other rather than each to a literal: the
 * point of the step is that the file it writes is the file that gets rendered.
 *
 * The YAML is read as text rather than parsed: the repository has no YAML
 * dependency of its own (`js-yaml` arrives with a transitive package), and what
 * matters is only that these few strings are present.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { pickTone, preparePreview } from '../../scripts/prepare-preview.ts';
import { JmTone } from '../../src/model/data/style.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = join(ROOT, 'scripts/prepare-preview.ts');
const EXAMPLE = join(ROOT, 'example/v2-features.json');

/** The one source of tone names: the model's own enum, read in order. */
const TONES: readonly string[] = Object.values(JmTone);

const ACTION = readFileSync(join(ROOT, '.github/actions/render-map/action.yml'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

/** Runs a body against a temp directory, and removes it whatever the body did. */
function withTempDir<T>(body: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-prepare-preview-'));
    try {
        return body(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('pickTone: every tone in the model is reachable, in the model\'s order', () => {
    // The expected list comes from JmTone, so this fails if the picker grows a
    // list of its own and that list drifts from the palette.
    const picked = TONES.map((_tone, index) => pickTone(() => (index + 0.5) / TONES.length));
    assert.deepEqual(picked, [...TONES]);
});

test('pickTone: a draw outside [0, 1) is clamped, never undefined', () => {
    // Math.random() cannot produce these, but the flake rule is about the job,
    // not about the generator's documentation: a draw of 1 indexes past the end
    // and writes `undefined` into the document.
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

test('preparePreview: writes the drawn tone to the output and leaves the input alone', () =>
    withTempDir(dir => {
        const output = join(dir, 'preview-data.json');
        const before = readFileSync(EXAMPLE, 'utf8');

        const tone = preparePreview(EXAMPLE, output, () => 0.99);

        assert.equal(tone, TONES[TONES.length - 1], 'the draw picks the tone');
        assert.equal(readFileSync(EXAMPLE, 'utf8'), before, 'the tracked fixture must not be written');

        const prepared = JSON.parse(readFileSync(output, 'utf8')) as {
            style?: { defaultTone?: string };
        };
        assert.equal(prepared.style?.defaultTone, tone);
    }));

test('preparePreview: keeps the rest of the document', () =>
    withTempDir(dir => {
        const output = join(dir, 'preview-data.json');
        const source = JSON.parse(readFileSync(EXAMPLE, 'utf8')) as {
            nodes: Record<string, unknown>;
            root: string;
        };

        preparePreview(EXAMPLE, output, () => 0.5);
        const prepared = JSON.parse(readFileSync(output, 'utf8')) as {
            nodes: Record<string, { style?: { tone?: string } }>;
            root: string;
        };

        // The tone is one field of one block: a preparation that dropped the
        // nodes it was handed would still have a legal `defaultTone`.
        assert.deepEqual(Object.keys(prepared.nodes).sort(), Object.keys(source.nodes).sort());
        assert.equal(prepared.root, source.root);
        // A node's own tone still wins over the document default, so the
        // fixture's explicit override has to survive this write.
        assert.equal(prepared.nodes['jm-mw4ottqm']?.style?.tone, 'primary');
    }));

test('preparePreview: a broken input fails before anything is written', () =>
    withTempDir(dir => {
        const input = join(dir, 'broken.json');
        const output = join(dir, 'preview-data.json');
        writeFileSync(input, '{"format":"not_jsmind_v2"}\n', 'utf8');

        assert.throws(() => preparePreview(input, output, () => 0.5), /does not validate/);
        assert.ok(!existsSync(output), 'nothing should be written from data that failed to load');
    }));

test('the script prints one tone name and nothing else', () =>
    withTempDir(dir => {
        // What the workflow relies on: `tone=$(node scripts/prepare-preview.ts
        // in.json out.json)`. A second line would be pasted into the value, and
        // a zero exit with no file would render whatever the last run left.
        const output = join(dir, 'preview-data.json');
        const run = spawnSync(process.execPath, [SCRIPT, EXAMPLE, output], { encoding: 'utf8' });

        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stderr, '');
        assert.equal(run.stdout.trim(), run.stdout.trim().split('\n')[0]);

        const printed = run.stdout.trim();
        assert.ok(TONES.includes(printed), `unexpected stdout ${JSON.stringify(run.stdout)}`);
        const prepared = JSON.parse(readFileSync(output, 'utf8')) as {
            style: { defaultTone: string };
        };
        assert.equal(prepared.style.defaultTone, printed, 'the logged tone is the tone in the file');
    }));

test('the script refuses a command line without both paths', () => {
    // Exit 2 is the CLI's "fix your command" code. The next step renders
    // whatever path it was given, so a missing argument has to stop the job
    // rather than prepare nothing and leave the previous run's file in place.
    const run = spawnSync(process.execPath, [SCRIPT, EXAMPLE], { encoding: 'utf8' });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /usage: node scripts\/prepare-preview\.ts/);
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

test('the file the prepare step writes is the file the render step reads', () => {
    // Both paths are read off the workflow and compared with each other rather
    // than with a literal: preparation that writes somewhere the render does
    // not look is the failure this step exists to make unreadable-past.
    const prepared = /tone=\$\(node scripts\/prepare-preview\.ts example\/v2-features\.json (\S+)\)/.exec(
        WORKFLOW
    );
    const rendered = /data-file: (\S+)/.exec(WORKFLOW);

    assert.ok(prepared, 'prepare should be `tone=$(node scripts/prepare-preview.ts <in> <out>)`');
    assert.ok(rendered, 'the render step should name a data-file');
    assert.equal(prepared?.[1], rendered?.[1]);
});

test('the preview job turns transparency on, for its own render only', () => {
    assert.match(WORKFLOW, /transparent: 'true'/);
});

test('the chosen tone reaches the job log and the comment', () => {
    assert.match(WORKFLOW, /echo "default tone for this run: \$tone"/);
    // One consumer: the step that posts the comment. A preview whose tone is
    // not named in the comment leaves a reader unable to tell a theme problem
    // from a rendering problem.
    assert.equal(WORKFLOW.match(/TONE: \$\{\{ steps\.prepare\.outputs\.tone \}\}/g)?.length, 1);
    assert.match(WORKFLOW, /defaultTone: \$TONE/);
});

test('the tone is written by the preparation step, not by a second command', () => {
    // The point of one preparation step: the workflow does not copy the fixture
    // and then style the copy. A `set-style` here would be the flow this step
    // replaced, and would leave two places deciding where the rendered data
    // lives.
    assert.ok(!/cp example\/v2-features\.json/.test(WORKFLOW), 'the copy is the script\'s job');
    assert.ok(!/set-style/.test(WORKFLOW), 'the tone is written by prepare-preview.ts');
    assert.match(WORKFLOW, /scripts\/prepare-preview\.ts/);
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
        assert.ok(!literalFlag.test(text), `${name} should pass the drawn tone, not a literal one`);
    }
});
