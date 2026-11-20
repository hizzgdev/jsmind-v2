/**
 * The version `--version` reports.
 *
 * @remarks
 * The version lives in `package.json` and nowhere else — `scripts/
 * check-version-refs.mjs` rejects a second copy of it anywhere under `src/` —
 * so this module reads the manifest instead of carrying a constant that could
 * fall behind a release. The lookup is done on demand rather than at import
 * time: every other invocation would pay for a file read to answer a question
 * it never asked.
 *
 * The manifest sits one level above the published `dist/cli.js`. Running the
 * TypeScript entry directly (tests, `--experimental-strip-types`) puts it two
 * levels up, so the search walks up rather than assuming a depth.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ioError } from './exit.ts';

/** Directory this module lives in, as a filesystem path. */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** How many levels up from this module the manifest can sit. */
const MAX_LEVELS = 3;

/**
 * Reads the version from the package manifest.
 *
 * @returns The `version` string, exactly as the manifest spells it.
 * @throws {@link CliError} With `IoError` when no manifest can be found or read.
 * @remarks
 * A CLI that cannot say what version it is has nothing useful to print, and
 * printing a guess would be worse than failing — the caller asked precisely
 * because it needs to know. So the failure is an IO error with a message naming
 * where the search started.
 */
export function packageVersion(): string {
    let directory = MODULE_DIR;
    for (let level = 0; level < MAX_LEVELS; level += 1) {
        const manifest = join(directory, 'package.json');
        if (existsSync(manifest)) {
            return readVersion(manifest);
        }
        directory = dirname(directory);
    }
    throw ioError(
        `Cannot find package.json to read the version from (searched up from ${MODULE_DIR})`
    );
}

/**
 * Extracts the `version` field from one manifest.
 *
 * @param manifest - Path to the manifest.
 * @returns The version string.
 * @throws {@link CliError} With `IoError` when it cannot be read, parsed, or
 *         does not carry a version.
 */
function readVersion(manifest: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(manifest, 'utf8'));
    } catch (err) {
        throw ioError(`Cannot read the version from ${manifest}: ${(err as Error).message}`);
    }

    const version = (parsed as { version?: unknown }).version;
    if (typeof version !== 'string' || version.length === 0) {
        throw ioError(`${manifest} has no version string`);
    }
    return version;
}
