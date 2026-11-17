#!/usr/bin/env node
/**
 * After `npm stage publish`, the new version is not public yet.
 * Only confirm that `latest` is still 0.9.x (it must not have been moved).
 * Do not treat `v2-preview` as already pointing at this version.
 *
 * After a maintainer approves the staged package, run:
 *   npm dist-tag ls jsmind
 * and confirm `v2-preview` points at the published version.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
const name = pkg.name;

const raw = execFileSync("npm", ["dist-tag", "ls", name], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
});
console.log(raw.trimEnd());

const tags = {};
for (const line of raw.split("\n")) {
    const match = line.match(/^([^:]+):\s*(\S+)\s*$/);
    if (match) {
        tags[match[1]] = match[2];
    }
}

if (!tags.latest) {
    console.error("missing dist-tag `latest`");
    process.exit(1);
}
if (!/^0\.9\./.test(tags.latest)) {
    console.error(`expected latest to remain 0.9.x, got ${tags.latest}`);
    process.exit(1);
}

console.log(`latest is still ${tags.latest} (0.9.x), unchanged by staging.`);
if (tags["v2-preview"]) {
    console.log(`current v2-preview tag: ${tags["v2-preview"]} (may not include ${version} until the staged package is approved).`);
} else {
    console.log("v2-preview is not set yet; it will be applied when the staged package is approved.");
}
console.log(`After approval, run \`npm dist-tag ls ${name}\` and confirm v2-preview points at ${version}.`);
