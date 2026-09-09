import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "harnie-package-"));
const installation = join(temporary, "installation");
const home = join(temporary, "home");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const env = { ...process.env, HARNIE_HOME: home, npm_config_cache: join(temporary, "npm-cache") };
const run = (command, args, cwd) => execFileSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

try {
  mkdirSync(installation);
  run(npm, ["pack", "--pack-destination", temporary], repository);
  const { name, version } = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
  const tarball = join(temporary, `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`);
  run(npm, ["install", "--prefix", installation, "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball], installation);
  const installedPackage = join(installation, "node_modules", name);
  assert.ok(existsSync(join(installedPackage, "dist", "cli.js")));
  assert.equal(existsSync(join(installedPackage, "src")), false, "The installed CLI must not rely on TypeScript sources");
  const docs = join(installedPackage, "docs");
  assert.ok(existsSync(docs), "The installed package must ship its docs");
  const lifecyclePhrases = [/pending tag/i, /prepared, pending/i, /what remains to publish/i];
  for (const entry of readdirSync(docs, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const contents = readFileSync(join(entry.parentPath, entry.name), "utf8");
    for (const phrase of lifecyclePhrases) {
      assert.doesNotMatch(
        contents,
        phrase,
        `Packaged doc ${relative(installedPackage, join(entry.parentPath, entry.name))} must not assert a publish-time state`,
      );
    }
  }
  const executable = join(installation, "node_modules", ".bin", process.platform === "win32" ? "harnie.cmd" : "harnie");
  const cli = (...args) => run(executable, args, installation);
  const attempt = (args) => {
    try {
      return { code: 0, stdout: run(executable, args, installation), stderr: "" };
    } catch (error) {
      return { code: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }
  };
  assert.match(cli("--help"), /Usage: harnie/);
  assert.match(cli("--version"), /^harnie \S+/);
  assert.equal(cli("--version").trim(), `harnie ${version}`);
  assert.equal(cli("-V").trim(), `harnie ${version}`);
  assert.match(cli("init"), /Initialized Harnie/);
  assert.ok(existsSync(join(home, "harnie.db")));
  const bogusInit = attempt(["init", "--bogus"]);
  assert.notEqual(bogusInit.code, 0, "init must reject unknown flags");
  assert.match(bogusInit.stderr, /Unknown flag: --bogus/);
  const bogusBackup = attempt(["backup", "backup.db", "--bogus"]);
  assert.notEqual(bogusBackup.code, 0, "backup must reject unknown flags");
  assert.match(bogusBackup.stderr, /Unknown flag: --bogus/);
  const fixture = join(temporary, "session.jsonl");
  copyFileSync(join(repository, "tests", "fixtures", "pi", "coding.jsonl"), fixture);
  const imported = cli("import", "pi", fixture);
  const workId = /\nWork\n([^\n]+)/.exec(imported)?.[1];
  assert.ok(workId, "Import must return a work ID");
  const handoff = cli("handoff", workId, "--to", "opencode");
  assert.match(handoff, /\S/);
  assert.ok(handoff.includes(workId), "Handoff must identify the imported work");
  const artifacts = readdirSync(join(home, "handoffs"));
  assert.equal(artifacts.length, 1, "Handoff must write one discoverable artifact");
  assert.equal(readFileSync(join(home, "handoffs", artifacts[0]), "utf8"), handoff);
  console.log(
    `Packed CLI smoke passed on ${process.version}: --help, --version, init, strict flags, fixture import, handoff.`,
  );
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
