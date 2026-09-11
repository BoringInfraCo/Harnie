import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = fileURLToPath(new URL("..", import.meta.url));
const root = process.env.HARNIE_INSTALLER_ROOT
  ? resolve(process.env.HARNIE_INSTALLER_ROOT)
  : defaultRoot;
const check = process.argv.includes("--check");

const fail = (message) => {
  console.error(`sync-installer-version: ${message}`);
  process.exit(1);
};

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = manifest.version;
if (typeof version !== "string" || version.length === 0) {
  console.error("sync-installer-version: package.json does not declare a version");
  process.exit(1);
}

const syncAssignment = (source) => source.replace(/HARNIE_VERSION="[^"]*"/, `HARNIE_VERSION="${version}"`);
const syncRoutes = (source) =>
  source.replace(
    /v[^"/]*\/harnie-[^"]*?\.tgz(\.sha256)?/g,
    (_match, suffix) => `v${version}/harnie-${version}.tgz${suffix ?? ""}`,
  );

const targets = [
  {
    path: "worker/public/harnie/install.sh",
    expectedCount: 1,
    transform: syncAssignment,
    read: (source) => [...source.matchAll(/HARNIE_VERSION="([^"]*)"/g)].map((match) => match[1] ?? ""),
  },
  {
    path: "scripts/prepare-installer-assets.sh",
    expectedCount: 1,
    transform: syncAssignment,
    read: (source) => [...source.matchAll(/HARNIE_VERSION="([^"]*)"/g)].map((match) => match[1] ?? ""),
  },
  {
    path: "wrangler.jsonc",
    expectedCount: 2,
    transform: syncRoutes,
    read: (source) => [...source.matchAll(/v([^"/]*)\/harnie-[^"]*?\.tgz/g)].map((match) => match[1] ?? ""),
  },
];

const changed = [];
const mismatches = [];

for (const target of targets) {
  const file = join(root, target.path);
  const original = readFileSync(file, "utf8");
  const actualVersions = target.read(original);
  const shapeMatches = actualVersions.length === target.expectedCount;
  const versionsMatch = actualVersions.every((actual) => actual === version);

  if (!shapeMatches || !versionsMatch) {
    const actual = actualVersions.join(", ") || "(no version found)";
    const mismatch = `${target.path}: expected ${target.expectedCount} marker(s) for ${version}; found ${actualVersions.length}: ${actual}`;
    if (check) {
      mismatches.push(mismatch);
      continue;
    }
    if (!shapeMatches) fail(mismatch);
  }

  const updated = target.transform(original);
  if (original === updated) continue;
  if (check) {
    mismatches.push(`${target.path}: expected ${version}, found ${actualVersions.join(", ")}`);
    continue;
  }
  writeFileSync(file, updated);
  changed.push(target.path);
}

if (check) {
  if (mismatches.length > 0) {
    console.error("sync-installer-version: installer assets do not match package.json:");
    for (const line of mismatches) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log(`sync-installer-version: all installer assets match package.json ${version}`);
  process.exit(0);
}

if (changed.length === 0) {
  console.log("sync-installer-version: no changes");
} else {
  for (const file of changed) console.log(`sync-installer-version: updated ${file}`);
}
