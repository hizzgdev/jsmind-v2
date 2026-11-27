#!/usr/bin/env node
/**
 * Confirm `npm pack` would ship only the 9 published dist files plus
 * package.json, LICENSE, README.md, and README.zh.md.
 * npm always includes both README files even though `files` lists only dist/.
 */
import { execFileSync } from "node:child_process";

const expected = new Set([
    "package.json",
    "README.md",
    "README.zh.md",
    "LICENSE",
    "dist/cli.js",
    "dist/cli.js.map",
    "dist/jsmind.js",
    "dist/jsmind.js.map",
    "dist/jsmind.cjs",
    "dist/jsmind.cjs.map",
    "dist/jsmind.umd.js",
    "dist/jsmind.umd.js.map",
    "dist/jsmind.d.ts",
    "dist/artifact.html",
]);

const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
});

let parsed;
try {
    parsed = JSON.parse(raw);
} catch {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) {
        console.error("Could not parse npm pack --json output:");
        console.error(raw);
        process.exit(1);
    }
    parsed = JSON.parse(raw.slice(start, end + 1));
}

const entry = Array.isArray(parsed) ? parsed[0] : parsed;
const files = (entry?.files ?? []).map((file) => {
    const path = typeof file === "string" ? file : file.path;
    return path.replace(/^package\//, "");
});

const actual = new Set(files);
const missing = [...expected].filter((path) => !actual.has(path)).sort();
const unexpected = [...actual].filter((path) => !expected.has(path)).sort();

if (missing.length || unexpected.length) {
    console.error("npm pack contents do not match the allowed file set.");
    if (missing.length) {
        console.error("Missing:");
        for (const path of missing) {
            console.error(`  ${path}`);
        }
    }
    if (unexpected.length) {
        console.error("Unexpected:");
        for (const path of unexpected) {
            console.error(`  ${path}`);
        }
    }
    process.exit(1);
}

console.log("npm pack contents are as expected:");
for (const path of [...actual].sort()) {
    console.log(`  ${path}`);
}
