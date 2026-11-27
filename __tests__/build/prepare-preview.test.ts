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
 * matters is only that these few strings are present. The deploy step is the
 * one exception - its script is extracted and run against a stub `npx`, because
 * whether a diagnostic prints at all is a property of the shell, not of the
 * text, and a text assertion passes just as happily with the printout
 * unreachable.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
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

/**
 * One step's own text, from its `- name:` to the next step.
 *
 * The whole workflow is one string, so a bare `/--token/` would also match
 * prose in a comment; scoping to the step keeps these assertions about the
 * command that actually runs.
 */
function stepText(name: string): string {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = new RegExp(`- name: ${escaped}[\\s\\S]*?(?=\\n {6}- name: )`).exec(WORKFLOW);
    assert.ok(found, `the preview job should have a \`${name}\` step`);
    return found?.[0] ?? '';
}

function deployStep(): string {
    return stepText('Deploy the preview');
}

/**
 * The comment block immediately above a step.
 *
 * The owner-facing documentation issue #226 asks for lives there: beside the
 * commands it explains, where the person rotating a secret will look.
 */
function stepComment(name: string): string {
    const at = WORKFLOW.indexOf(`      - name: ${name}\n`);
    assert.ok(at >= 0, `the preview job should have a \`${name}\` step`);
    const before = WORKFLOW.slice(0, at).split('\n');
    // The slice ends with the newline that opened the `- name:` line, so the
    // last element is empty and is not part of the comment block.
    if (before[before.length - 1] === '') before.pop();
    const kept: string[] = [];
    for (let i = before.length - 1; i >= 0; i--) {
        const line = before[i] ?? '';
        if (!line.startsWith('      #')) break;
        kept.unshift(line);
    }
    return kept.join('\n');
}

/**
 * A step's `run:` body, dedented, ready to hand to bash.
 *
 * The shell is the only thing that can tell a diagnostic that prints from one
 * that `set -e` skips over, so the deploy script is run here rather than
 * pattern-matched: an assertion on its text would pass just as happily with the
 * printouts unreachable.
 */
function stepScript(name: string): string {
    const body = /^ {8}run: \|\n([\s\S]*)$/m.exec(stepText(name));
    assert.ok(body, `${name} should run a script`);
    return (body?.[1] ?? '')
        .split('\n')
        .map(line => (line.startsWith(' '.repeat(10)) ? line.slice(10) : line.trimStart()))
        .join('\n');
}

/** Runs a step's script in a temp dir with a stub `npx` first on PATH. */
function runDeploy(npxBody: string): { status: number | null; stdout: string; output: string } {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-deploy-'));
    try {
        const bin = join(dir, 'bin');
        mkdirSync(bin);
        writeFileSync(join(bin, 'npx'), `#!/usr/bin/env bash\n${npxBody}\n`, 'utf8');
        chmodSync(join(bin, 'npx'), 0o755);

        const script = join(dir, 'step.sh');
        writeFileSync(script, stepScript('Deploy the preview'), 'utf8');
        const outputFile = join(dir, 'github-output');
        writeFileSync(outputFile, '', 'utf8');

        const run = spawnSync('/bin/bash', [script], {
            cwd: dir,
            encoding: 'utf8',
            env: {
                ...process.env,
                PATH: `${bin}:${process.env.PATH ?? ''}`,
                SURGE_TOKEN: 'stub-token',
                GITHUB_OUTPUT: outputFile,
            },
        });

        return {
            status: run.status,
            stdout: `${run.stdout}${run.stderr}`,
            output: readFileSync(outputFile, 'utf8'),
        };
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

    // And the exported file is the one the deploy publishes. A page written to
    // another path publishes whatever an earlier run left there, or nothing,
    // and the comment then links to a page from another commit in a job that
    // stayed green.
    const published = /npx --yes surge (\S+) \S+ --preview/.exec(deployStep());
    assert.ok(published, 'the deploy step should name the page it publishes');
    assert.equal(exported?.[2], published?.[1]);
});

test('the deploy publishes to the shared domain, and names it once in code', () => {
    // One domain for the whole repository is the design: a domain per pull
    // request would need a teardown nobody runs, and the previews it leaves
    // behind stay readable indefinitely. Code only - the step's comment states
    // the same domain again for whoever has to rotate the token, and counting
    // prose here would make the comment unwritable.
    const code = deployStep()
        .split('\n')
        .filter(line => !line.trimStart().startsWith('#'))
        .join('\n');
    const occurrences = code.match(/jsmind-v2-pr-preview\.surge\.sh/g) ?? [];
    assert.equal(occurrences.length, 1, 'the domain is written once, into $DOMAIN');
    assert.match(code, /DOMAIN=jsmind-v2-pr-preview\.surge\.sh/);
});

test('the deploy step documents the owner-side facts, token rotation included', () => {
    // Issue #226 asks for exactly one piece of documentation in this PR: the
    // comment above this step, carrying the four facts a maintainer needs and
    // cannot read off the commands - the domain, the secret name, how to
    // re-issue a token that expired, and how long a revision lives. Rotation is
    // the one with no other home: the secret is rotated in Settings, and the
    // symptom of forgetting is a green job with a linkless comment, not an
    // error.
    const docs = stepComment('Deploy the preview');
    assert.match(docs, /jsmind-v2-pr-preview\.surge\.sh/, 'the domain is named');
    assert.match(docs, /secret\s+SURGE_TOKEN/, 'the secret is named');
    assert.match(
        docs,
        /surge tokens add --domain jsmind-v2-pr-preview\.surge\.sh -m ci/,
        'the rotation command is written down'
    );
    assert.match(docs, /100 most recent revisions/, 'the retention rule is written down');
});

test('a failed image upload does not take the deploy and the comment with it', () => {
    // Steps do not continue past a failure by default. Without this flag a
    // rejected upload - an expired or revoked PR_PREVIEW_TOKEN - fails the job
    // at this step, so `Deploy the preview` never runs and no comment is
    // posted: the reader loses the link as well, and issue #226's "image failed
    // but the comment still goes out" has no path left in the workflow.
    const upload = stepText('Upload the preview');
    assert.match(upload, /continue-on-error: true/);
    assert.match(upload, /::error::Upload failed/, 'the failure still shows in the log');
    // With `url` empty the comment step still fires on the link alone.
    assert.match(WORKFLOW, /if: steps\.upload\.outputs\.url != '' \|\| steps\.surge\.outputs\.url != ''/);
});

test('the deploy reads the address off a coloured surge line', () => {
    // The measured shape: `CI=true FORCE_COLOR=1` wraps the whole line in
    // escapes, so a pattern applied to the raw output finds nothing.
    const run = runDeploy(
        'printf \'\\033[32mSuccess!\\033[0m - Preview available at \\033[36m1785787164375--jsmind-v2-pr-preview.surge.sh\\033[0m\\n\''
    );
    assert.equal(run.status, 0, run.stdout);
    assert.match(run.output, /^url=https:\/\/1785787164375--jsmind-v2-pr-preview\.surge\.sh$/m);
    assert.match(run.stdout, /published 1785787164375--jsmind-v2-pr-preview\.surge\.sh/);
});

test('a failed deploy prints what surge said before it gives up', () => {
    // `set -e` on a bare `out=$(npx ...)` exits inside the assignment, so the
    // output the step deliberately captured with 2>&1 - the only account of
    // why the deploy failed - never reaches the log. This runs the real script
    // with a failing npx and reads the log: a text assertion would pass with
    // the printout unreachable.
    const run = runDeploy(
        'echo \'Aborted - not logged in and no terminal to ask ... or set SURGE_TOKEN\' >&2\nexit 1'
    );
    assert.equal(run.status, 1);
    assert.match(run.stdout, /Aborted - not logged in/, 'surge\'s own words survive');
    assert.match(run.stdout, /::error::surge exited non-zero/);
    assert.ok(!/^url=/m.test(run.output), 'a failed deploy publishes no address');
});

test('a deploy that publishes no address says so instead of dying in the assignment', () => {
    // The other dead branch: surge exits 0 but the address is missing, `grep`
    // exits 1, and `pipefail` turns that into a failed assignment. The `-z`
    // check that follows has to be reachable, or a green-looking deploy leaves
    // the comment with no link and no explanation.
    const run = runDeploy('echo \'Success! - published somewhere unexpected\'');
    assert.equal(run.status, 1);
    assert.match(run.stdout, /published somewhere unexpected/, 'the output is printed');
    assert.match(run.stdout, /::error::surge published no preview address/);
    assert.ok(!/^url=/m.test(run.output), 'no address means no url output');
});

test('the comment links the revision the deploy step reports', () => {
    // The revision id is a timestamp surge picks, so there is nothing local to
    // assemble the address from. The deploy reads it off surge's own output and
    // the comment reads the step; a link built from the domain instead would
    // name a host that does not exist.
    assert.match(WORKFLOW, /PAGE_URL: \$\{\{ steps\.surge\.outputs\.url \}\}/);
    assert.match(WORKFLOW, /\[Open the exported page\]\(\$PAGE_URL\)/);
    assert.ok(
        !/https:\/\/\$\{?[A-Za-z_]+\}?\.surge\.sh/.test(WORKFLOW),
        'the address is read off surge, not assembled from the domain'
    );
});

test('the deploy step claims the id and output the comment reads', () => {
    // `id: surge` and `url` are the contract between two steps in this job, the
    // same kind of name as the secret and just as silent when it drifts: a
    // rename leaves the comment with no link and CI green.
    const deploy = deployStep();
    assert.match(deploy, /id: surge/);
    assert.match(deploy, /echo "url=https:\/\/\$host" >> "\$GITHUB_OUTPUT"/);
});

test('the deploy hands the token to the environment, never to argv', () => {
    // `--token` would put the credential in the log, which is the one thing
    // SURGE_TOKEN exists to prevent. Step-scoped rather than a job-level env:
    // this job already holds two credentials, and a third readable by every
    // step buys nothing.
    const deploy = deployStep();
    assert.match(deploy, /SURGE_TOKEN: \$\{\{ secrets\.SURGE_TOKEN \}\}/);
    assert.ok(!/--token/.test(deploy), 'the token travels in the environment, not on the command line');

    // Read in exactly one place: a second reference is either a copy that can
    // drift or a job-level `env:` that hands this credential to every step in a
    // job which already holds two others.
    const refs = WORKFLOW.match(/secrets\.SURGE_TOKEN/g) ?? [];
    assert.equal(refs.length, 1, 'only the deploy step reads the surge secret');

    // `--yes` because npx otherwise waits on a prompt no runner can answer, and
    // `continue-on-error` because a deploy having a bad day is not a test
    // failing - the comment simply loses its link.
    assert.match(deploy, /npx --yes surge /);
    assert.match(deploy, /continue-on-error: true/);
});

test('the comment is posted while either half of it exists', () => {
    // The condition used to be the image alone, so a failed upload took the
    // link down with it and a fork could never comment at all.
    assert.match(
        WORKFLOW,
        /if: steps\.upload\.outputs\.url != '' \|\| steps\.surge\.outputs\.url != ''/
    );

    // Each paragraph is built from its own value and interpolated into the
    // body, so a comment carrying one of the two never claims the other. The
    // body lines are pinned as bare variables: an image line written straight
    // into the heredoc would stay correct while the value that feeds it stops
    // being used.
    //
    // The `<sub>` splits on the same line: "transparent background" and
    // "uploaded as a comment attachment" are image-only claims, and a comment
    // whose image upload failed would otherwise make them.
    assert.match(
        WORKFLOW,
        /if \[ -n "\$\{PREVIEW_URL:-\}" \]; then\s*\n\s*image_line=[^\n]*\n\s*image_note=/
    );
    assert.match(WORKFLOW, /if \[ -n "\$\{PAGE_URL:-\}" \]; then\s*\n\s*page_line=/);
    assert.match(WORKFLOW, /^ {10}\$image_line$/m);
    assert.match(WORKFLOW, /^ {10}\$page_line$/m);
    assert.match(WORKFLOW, /^ {10}<sub>.*\$\{image_note\}\$\{page_note\}<\/sub>$/m);
});

test('a failed deploy says so, instead of dropping the link silently', () => {
    // The other half of "CI stays green when surge fails": a comment with no
    // link and no word about it reads as if this repository has no live preview
    // at all, so the absent link has to be stated rather than omitted.
    assert.match(WORKFLOW, /page_line='_The live preview could not be published for this run\._'/);
});

test('the page is published, not shipped through the artifact store', () => {
    // The artifact route is what this replaced: its download asks the reader to
    // sign in first and arrives as a file, so "open it" was a detour. A
    // leftover upload would still be green and unused, which is why its absence
    // is asserted rather than left to review.
    assert.ok(!/upload-artifact/.test(WORKFLOW), 'the page is published, not uploaded as an artifact');
    assert.ok(!/upload-html/.test(WORKFLOW), 'the artifact step is gone, and nothing reads its output');
    assert.ok(!/ARTIFACT_URL/.test(WORKFLOW), 'the comment does not take an artifact address');
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
