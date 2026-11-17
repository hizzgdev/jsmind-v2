#!/usr/bin/env node
/**
 * Before `npm stage publish`, confirm this GitHub Release is safe to stage:
 * - the Release is not a prerelease
 * - package.json version is a 2.x release (no prerelease suffix)
 * - the Release tag is that version, with or without a leading `v`
 *
 * Inputs come from the workflow:
 *   RELEASE_PRERELEASE  github.event.release.prerelease  (must be "false")
 *   RELEASE_TAG         github.event.release.tag_name
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;

const prerelease = process.env.RELEASE_PRERELEASE;
const tag = process.env.RELEASE_TAG ?? "";

if (prerelease !== "false") {
    console.error(`Release must not be a prerelease (github.event.release.prerelease must be false), got ${JSON.stringify(prerelease)}`);
    process.exit(1);
}

if (!/^2\.\d+\.\d+$/.test(version)) {
    console.error(`package.json version must be a 2.x release without a prerelease suffix, got ${version}`);
    process.exit(1);
}

const tagVersion = tag.startsWith("v") ? tag.slice(1) : tag;
if (!tag || tagVersion !== version) {
    console.error(`Release tag ${JSON.stringify(tag)} must be ${version} or v${version}`);
    process.exit(1);
}

console.log(`Release guards passed: tag=${tag}, version=${version}, prerelease=false`);
