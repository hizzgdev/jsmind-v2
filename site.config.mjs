/**
 * @fileoverview Where the published site lives: one origin, one mount path.
 *
 * Two facts, everything else derived. Both VitePress configs, the build script
 * and the tests read them from here, so the address of the site has one source
 * instead of a copy per caller.
 *
 * Naming rule, and it is the whole point of this file:
 *
 * - `*_BASE` is a **path** only (`/jsmind-v2/docs/`). It is the only shape a
 *   VitePress `base` accepts — a base that carries a host name is rejected, and
 *   the old `BASE` (a path) sitting next to `SITE_BASE` (origin plus mount
 *   path) in the two configs made that mistake easy to copy.
 * - `*_URL` is an **absolute address** (`https://…/jsmind-v2/docs/`).
 *
 * The suffix tells a caller which one it wants, so the two shapes cannot be
 * confused by name again.
 *
 * Why the absolute addresses exist at all: VitePress's `withBase`
 * (`vitepress/dist/client/app/utils.js`) prefixes only links that start with
 * `/`; a relative link is emitted verbatim. The nav is rendered on pages at
 * several depths, so a cross-site nav entry has to be written out in full —
 * and that full address needs one source.
 *
 * Plain ESM, not TypeScript: the two VitePress configs are loaded by
 * VitePress's own esbuild and the tests run under `node --test` type stripping,
 * so a `.mjs` file is importable from both without touching `tsconfig.json`.
 *
 * The values below describe the site as it is published today. Moving it is a
 * two-value edit here, but nothing in this file is a migration plan: the domain
 * and the mount path change on their own schedule.
 */

/** Host only: no mount path, no trailing slash. */
export const SITE_ORIGIN = 'https://hizzgdev.github.io';

/** Mount path of the site inside the origin. Leading and trailing slash. */
export const SITE_PATH = '/jsmind-v2/';

/** Mount path of the documentation site, a VitePress site. */
export const DOCS_BASE = `${SITE_PATH}docs/`;

/** Mount path of the tutorials column, a second VitePress site. */
export const TUTORIALS_BASE = `${SITE_PATH}tutorials/`;

/** Absolute address of the documentation site. */
export const DOCS_URL = new URL(DOCS_BASE, SITE_ORIGIN).href;

/** Absolute address of the tutorials column. */
export const TUTORIALS_URL = new URL(TUTORIALS_BASE, SITE_ORIGIN).href;
