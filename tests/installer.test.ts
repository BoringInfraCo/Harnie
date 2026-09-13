import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repository = fileURLToPath(new URL("..", import.meta.url));
const installSh = join(repository, "worker", "public", "harnie", "install.sh");
const installPs1 = join(repository, "worker", "public", "harnie", "install.ps1");
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

interface PowerShellHarness {
  root: string;
  binDir: string;
  downloadLog: string;
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
    "worker/public/harnie/install.ps1",
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

const createPowerShellHarness = (): PowerShellHarness => {
  const root = mkdtempSync(join(tmpdir(), "harnie-powershell-installer-"));
  temporaryRoots.push(root);
  const binDir = join(root, "bin");
  mkdirSync(binDir);

  writeFileSync(
    join(binDir, "node.cmd"),
    "@echo off\r\necho %FAKE_NODE_VERSION%\r\nexit /b 0\r\n",
  );
  writeFileSync(join(binDir, "npm.cmd"), "@echo off\r\nexit /b %FAKE_NPM_STATUS%\r\n");
  writeFileSync(
    join(binDir, "harnie.cmd"),
    "@echo off\r\necho harnie %FAKE_INSTALLED_VERSION%\r\nexit /b 0\r\n",
  );

  const downloadLog = join(root, "downloads.log");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir};${process.env.PATH ?? ""}`,
    TEMP: root,
    TMP: root,
    FAKE_NODE_VERSION: "22.23.0",
    FAKE_NPM_STATUS: "0",
    FAKE_INSTALLED_VERSION: version,
    FAKE_DOWNLOAD_LOG: downloadLog,
    FAKE_EXPECTED_HASH: "a".repeat(64),
    FAKE_ACTUAL_HASH: "a".repeat(64),
    HARNIE_INSTALL_PS1: installPs1,
  };

  return { root, binDir, downloadLog, env };
};

const runPowerShellInstaller = (harness: PowerShellHarness, overrides: NodeJS.ProcessEnv = {}) => {
  const wrapper = join(harness.root, "invoke-installer.ps1");
  writeFileSync(
    wrapper,
    `function Invoke-WebRequest {
  param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile)
  Add-Content -LiteralPath $env:FAKE_DOWNLOAD_LOG -Value $Uri
  if ($Uri.EndsWith('.sha256')) {
    Set-Content -LiteralPath $OutFile -NoNewline -Value "$env:FAKE_EXPECTED_HASH  harnie-${version}.tgz"
  } else {
    Set-Content -LiteralPath $OutFile -NoNewline -Value 'fake archive'
  }
}
function Get-FileHash {
  param([string]$LiteralPath, [string]$Algorithm)
  [PSCustomObject]@{ Hash = $env:FAKE_ACTUAL_HASH }
}
& $env:HARNIE_INSTALL_PS1
exit $LASTEXITCODE
`,
  );

  return spawnSync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", wrapper],
    { encoding: "utf8", env: { ...harness.env, ...overrides } },
  );
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("harnie curl installer", () => {
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
      name: "missing PowerShell version assignment",
      path: "worker/public/harnie/install.ps1",
      mutate: (source: string) => source.replace(/^\$HarnieVersion =.*$/m, ""),
    },
    {
      name: "duplicate PowerShell version assignment",
      path: "worker/public/harnie/install.ps1",
      mutate: (source: string) =>
        source.replace(
          /^\$HarnieVersion =.*$/m,
          `$HarnieVersion = "${version}"\n$HarnieVersion = "${version}"`,
        ),
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

describe("harnie PowerShell installer source", () => {
  it("is routed as a Worker asset and verifies SHA-256 before the global install", () => {
    const source = readFileSync(installPs1, "utf8");
    const wrangler = readFileSync(join(repository, "wrangler.jsonc"), "utf8");
    const headers = readFileSync(join(repository, "worker", "public", "_headers"), "utf8");
    expect(source).toContain(`$HarnieVersion = "${version}"`);
    expect(source).toContain("Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256");
    expect(source.indexOf("checksum verification failed")).toBeLessThan(
      source.indexOf("install --global $ArchivePath"),
    );
    expect(wrangler).toContain('"pattern": "https://boringinfra.company/harnie/install.ps1"');
    expect(headers).toContain("/harnie/install.ps1");
  });
});

describe.skipIf(process.platform !== "win32")("harnie PowerShell installer behavior", () => {
  it("installs and verifies the expected version", () => {
    const harness = createPowerShellHarness();
    const result = runPowerShellInstaller(harness);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Harnie ${version} installed successfully.`);
    expect(readFileSync(harness.downloadLog, "utf8")).toContain(`harnie-${version}.tgz.sha256`);
  });

  it("rejects a checksum mismatch", () => {
    const harness = createPowerShellHarness();
    const result = runPowerShellInstaller(harness, { FAKE_ACTUAL_HASH: "b".repeat(64) });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("checksum verification failed");
  });

  it("rejects a malformed checksum file", () => {
    const harness = createPowerShellHarness();
    const result = runPowerShellInstaller(harness, { FAKE_EXPECTED_HASH: "not-a-sha256" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("checksum file is malformed");
  });

  it("rejects unsupported Node versions", () => {
    const harness = createPowerShellHarness();
    const result = runPowerShellInstaller(harness, { FAKE_NODE_VERSION: "22.22.0" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("22.23 or newer");
  });

  it("reports npm installation failures", () => {
    const harness = createPowerShellHarness();
    const result = runPowerShellInstaller(harness, { FAKE_NPM_STATUS: "1" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("npm failed to install Harnie");
  });

  it("rejects an unexpected installed version", () => {
    const harness = createPowerShellHarness();
    const result = runPowerShellInstaller(harness, { FAKE_INSTALLED_VERSION: "9.9.9" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`expected harnie ${version}`);
  });
});
