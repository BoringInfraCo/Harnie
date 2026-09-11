import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repository = fileURLToPath(new URL("..", import.meta.url));
const installSh = join(repository, "worker", "public", "harnie", "install.sh");
const syncScript = join(repository, "scripts", "sync-installer-version.mjs");
const manifest = JSON.parse(readFileSync(join(repository, "package.json"), "utf8")) as { version: string };
const version = manifest.version;

const temporaryRoots: string[] = [];

const writeExecutable = (path: string, contents: string): void => {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
};

interface Harness {
  root: string;
  binDir: string;
  toolsDir: string;
  curlLog: string;
  fullPath: string;
  restrictedPath: string;
  env: NodeJS.ProcessEnv;
}

const createHarness = (): Harness => {
  const root = mkdtempSync(join(tmpdir(), "harnie-installer-"));
  temporaryRoots.push(root);
  const toolsDir = join(root, "tools");
  const binDir = join(root, "bin");
  mkdirSync(toolsDir);
  mkdirSync(binDir);

  writeExecutable(join(toolsDir, "node"), `#!/bin/sh\nprintf '%s\\n' "$FAKE_NODE_VERSION"\n`);
  writeExecutable(
    join(toolsDir, "curl"),
    `#!/bin/sh
set -eu
printf '%s\n' "$@" >> "$FAKE_CURL_LOG"
url=""
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    -*)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
if [ -n "$out" ]; then
  printf 'fake-download %s\n' "$url" > "$out"
fi
`,
  );
  writeExecutable(
    join(toolsDir, "sha256sum"),
    `#!/bin/sh
if [ "$FAKE_SHA256SUM_STATUS" = "0" ]; then
  exit 0
fi
printf 'harnie installer: checksum verification failed\n' >&2
exit "$FAKE_SHA256SUM_STATUS"
`,
  );
  writeExecutable(
    join(toolsDir, "npm"),
    `#!/bin/sh
set -eu
mkdir -p "$FAKE_BIN_DIR"
cat > "$FAKE_BIN_DIR/harnie" <<'HARNIE'
#!/bin/sh
printf 'harnie ${version}\\n'
HARNIE
chmod +x "$FAKE_BIN_DIR/harnie"
`,
  );

  const curlLog = join(root, "curl.log");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: root,
    TMPDIR: root,
    FAKE_NODE_VERSION: "22.23.0",
    FAKE_SHA256SUM_STATUS: "0",
    FAKE_BIN_DIR: binDir,
    FAKE_HARNIE_VERSION: version,
    FAKE_CURL_LOG: curlLog,
  };

  return {
    root,
    binDir,
    toolsDir,
    curlLog,
    fullPath: `${toolsDir}:${binDir}:/usr/bin:/bin`,
    restrictedPath: `${toolsDir}:${binDir}`,
    env,
  };
};

const runInstaller = (harness: Harness, path: string, overrides: NodeJS.ProcessEnv = {}) =>
  spawnSync("/bin/sh", [installSh], {
    encoding: "utf8",
    env: { ...harness.env, PATH: path, ...overrides },
  });

const createSyncFixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "harnie-installer-sync-"));
  temporaryRoots.push(root);
  for (const path of [
    "package.json",
    "worker/public/harnie/install.sh",
    "scripts/prepare-installer-assets.sh",
    "wrangler.jsonc",
  ]) {
    const destination = join(root, path);
    mkdirSync(join(destination, ".."), { recursive: true });
    cpSync(join(repository, path), destination);
  }
  return root;
};

const runSyncCheck = (root: string) =>
  spawnSync(process.execPath, [syncScript, "--check"], {
    encoding: "utf8",
    env: { ...process.env, HARNIE_INSTALLER_ROOT: root },
  });

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("harnie curl installer", () => {
  it("installs the expected version when node, checksum, and npm succeed", () => {
    const harness = createHarness();
    const result = runInstaller(harness, harness.fullPath);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Harnie ${version} installed successfully.`);
    const log = readFileSync(harness.curlLog, "utf8");
    expect(log).toContain(`harnie-${version}.tgz`);
    expect(log).toContain(`harnie-${version}.tgz.sha256`);
  });

  it("fails when the checksum does not match", () => {
    const harness = createHarness();
    const result = runInstaller(harness, harness.fullPath, { FAKE_SHA256SUM_STATUS: "1" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("harnie installer:");
  });

  it("rejects Node 22 versions below 22.23", () => {
    const harness = createHarness();
    const result = runInstaller(harness, harness.fullPath, { FAKE_NODE_VERSION: "22.22.0" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("22.23");
  });

  it("rejects Node majors other than 22", () => {
    const harness = createHarness();
    const result = runInstaller(harness, harness.fullPath, { FAKE_NODE_VERSION: "20.11.0" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("22.23");
  });

  it("requires curl", () => {
    const harness = createHarness();
    rmSync(join(harness.toolsDir, "curl"));
    const result = runInstaller(harness, harness.restrictedPath);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("curl is required");
  });

  it("requires node", () => {
    const harness = createHarness();
    rmSync(join(harness.toolsDir, "node"));
    const result = runInstaller(harness, harness.restrictedPath);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Node.js 22.23");
  });

  it("keeps installer assets in sync with package.json", () => {
    const result = spawnSync(process.execPath, [syncScript, "--check"], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(version);
  });

  it.each([
    {
      name: "missing version assignment",
      path: "worker/public/harnie/install.sh",
      mutate: (source: string) => source.replace(/^HARNIE_VERSION=.*$/m, ""),
    },
    {
      name: "duplicate version assignment",
      path: "scripts/prepare-installer-assets.sh",
      mutate: (source: string) =>
        source.replace(
          /^HARNIE_VERSION=.*$/m,
          `HARNIE_VERSION="${version}"\nHARNIE_VERSION="${version}"`,
        ),
    },
    {
      name: "malformed version assignment",
      path: "worker/public/harnie/install.sh",
      mutate: (source: string) => source.replace(/^HARNIE_VERSION=.*$/m, `HARNIE_VERSION='${version}'`),
    },
    {
      name: "missing release route",
      path: "wrangler.jsonc",
      mutate: (source: string) =>
        source.replace(
          /\s*\{\s*"pattern": "https:\/\/boringinfra\.company\/harnie\/releases\/[^}]+?\.sha256",\s*"zone_name": "boringinfra\.company"\s*\},?/s,
          "",
        ),
    },
  ])("rejects a $name", ({ path, mutate }) => {
    const root = createSyncFixture();
    const file = join(root, path);
    writeFileSync(file, mutate(readFileSync(file, "utf8")));
    const result = runSyncCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("expected");
  });

  it("rejects a mismatched installer version", () => {
    const root = createSyncFixture();
    const file = join(root, "worker/public/harnie/install.sh");
    writeFileSync(file, readFileSync(file, "utf8").replace(version, "9.9.9"));
    const result = runSyncCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("9.9.9");
  });
});
