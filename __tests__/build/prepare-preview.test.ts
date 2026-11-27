/**
 * @fileoverview `Render preview`'s preparation step: the tone it draws, the
 * file it writes, what it reports, and the transparent background it asks the
 * action for.
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
 * The file is also the only thing that crosses between the steps - the tone is
 * a field inside it, not a step output to carry - and that is pinned too. The
 * same file feeds the exported page, so the two artifacts a reader is offered
 * describe one map.
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

import { pickTone, writePrepared } from '../../scripts/prepare-preview.ts';
import { JmTone } from '../../src/model/data/style.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = join(ROOT, 'scripts/prepare-preview.ts');
const EXAMPLE = join(ROOT, 'example/v2-features.json');

/** The one source of tone names: the model's own enum, read in order. */
const TONES: readonly string[] = Object.values(JmTone);

const ACTION = readFileSync(join(ROOT, '.github/actions/render-map/action.yml'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const SCRIPT_TEXT = readFileSync(SCRIPT, 'utf8');

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

test('writePrepared: writes the drawn tone to the output and leaves the input alone', () =>
    withTempDir(dir => {
        const output = join(dir, 'preview-data.json');
        const before = readFileSync(EXAMPLE, 'utf8');
        const tone = pickTone(() => 0.99);

        writePrepared(EXAMPLE, output, tone);

        assert.equal(tone, TONES[TONES.length - 1], 'the draw picks the tone');
        assert.equal(readFileSync(EXAMPLE, 'utf8'), before, 'the tracked fixture must not be written');

        const prepared = JSON.parse(readFileSync(output, 'utf8')) as {
            style?: { defaultTone?: string };
        };
        assert.equal(prepared.style?.defaultTone, tone);
    }));

test('writePrepared: keeps the rest of the document', () =>
    withTempDir(dir => {
        const output = join(dir, 'preview-data.json');
        const source = JSON.parse(readFileSync(EXAMPLE, 'utf8')) as {
            nodes: Record<string, unknown>;
            root: string;
        };

        writePrepared(EXAMPLE, output, pickTone(() => 0.5));
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

test('writePrepared: a broken input fails before anything is written', () =>
    withTempDir(dir => {
        const input = join(dir, 'broken.json');
        const output = join(dir, 'preview-data.json');
        writeFileSync(input, '{"format":"not_jsmind_v2"}\n', 'utf8');

        assert.throws(() => writePrepared(input, output, pickTone(() => 0.5)), /does not validate/);
        assert.ok(!existsSync(output), 'nothing should be written from data that failed to load');
    }));

test('the script writes the file, logs the tone, and prints nothing to stdout', () =>
    withTempDir(dir => {
        // What the workflow relies on: `node scripts/prepare-preview.ts in.json
        // out.json`, with nothing captured. stdout stays empty so no caller is
        // invited to read a value off it; stderr carries the one log line that
        // names the tone, and the file is what the render reads.
        const output = join(dir, 'preview-data.json');
        const run = spawnSync(process.execPath, [SCRIPT, EXAMPLE, output], { encoding: 'utf8' });

        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, '', 'nothing is returned on stdout');

        const logged = /defaultTone (\S+)/.exec(run.stderr);
        assert.ok(logged, `stderr should name the tone, got ${JSON.stringify(run.stderr)}`);
        const tone = logged?.[1] ?? '';
        assert.ok(TONES.includes(tone), `${tone} is not one of ${TONES.join(', ')}`);

        const prepared = JSON.parse(readFileSync(output, 'utf8')) as {
            style: { defaultTone: string };
        };
        assert.equal(prepared.style.defaultTone, tone, 'the logged tone is the tone in the file');
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
    // The default belongs to the action, not to its one in-repo caller: a
    // default of "transparent" would hand every caller a transparent image
    // without them asking.
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
    const prepared = /node scripts\/prepare-preview\.ts example\/v2-features\.json (\S+)/.exec(
        WORKFLOW
    );
    const rendered = /data-file: (\S+)/.exec(WORKFLOW);

    assert.ok(prepared, 'prepare should run `node scripts/prepare-preview.ts <in> <out>`');
    assert.ok(rendered, 'the render step should name a data-file');
    assert.equal(prepared?.[1], rendered?.[1]);
});

test('the page is exported from the file the prepare step wrote', () => {
    // The image and the page are two views of one map, and the workflow is the
    // only thing that can make them disagree: a second read of the tracked
    // fixture would carry the tone this run drew into the image and not into
    // the page. Pinned path-to-path rather than each to a literal, for the same
    // reason as the render above - one preparation feeds both.
    const prepared = /node scripts\/prepare-preview\.ts example\/v2-features\.json (\S+)/.exec(
        WORKFLOW
    );
    const exported = /export html (\S+) (\S+) --title/.exec(WORKFLOW);

    assert.ok(exported, 'the preview job should export a page from the prepared data');
    assert.equal(exported?.[1], prepared?.[1]);

    // And the exported file is the one the artifact step uploads. A page
    // written to another path uploads nothing, and the comment would then point
    // at a run with no artifact in a job that stayed green.
    const uploaded = /path: (\S+)/.exec(WORKFLOW);
    assert.ok(uploaded, 'the artifact step should name the file it uploads');
    assert.equal(exported?.[2], uploaded?.[1]);
});

test('the preview job turns transparency on, for its own render only', () => {
    assert.match(WORKFLOW, /transparent: 'true'/);
});

test('the tone travels inside the file, not between the steps', () => {
    // One step writes the file, the next renders it; nothing else is carried.
    // A step output would put the tone in two places - the document and the
    // workflow - and the workflow copy is the one that can go stale.
    assert.ok(!/tone=\$\(/.test(WORKFLOW), 'the prepare command is not captured into a shell variable');
    assert.ok(!/steps\.prepare\.outputs/.test(WORKFLOW), 'the tone is not a step output');
    assert.ok(!/\bTONE\b/.test(WORKFLOW), 'the comment is not built from a tone variable');
    // The job log still names the tone, and the script is the one that says it.
    assert.match(SCRIPT_TEXT, /with defaultTone/);
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
