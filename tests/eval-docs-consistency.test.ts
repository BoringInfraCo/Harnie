import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Documentation consistency (2026-09-10 re-audit P2): the curated eval
// directories must agree with themselves — no stale references to corrected
// directory names, README-claimed dates must cover the run manifests they
// describe, and no manifest may claim a time in the future relative to the
// files it sits with. Deterministic: no clock, no network; the only
// time-dependent input is file mtime in rule (c), which grows monotonically
// with checkouts/edits, so the invariant is stable across runs.

const ROOT = join(import.meta.dirname, "..");

// (a) Scope: documentation files only. Raw evidence (logs, probes, driver
// fixtures) is never rewritten and may quote machine paths that happen to
// contain the old name — those are not docs.
const DOC_ROOTS = ["docs/internal", "docs/research"];

const listMdFiles = (dir: string): string[] => {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listMdFiles(p));
    else if (ent.isFile() && ent.name.endsWith(".md")) out.push(p);
  }
  return out;
};

const evalDirs = () =>
  readdirSync(join(ROOT, "docs/research"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^eval-\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort();

describe("eval docs consistency", () => {
  it("no doc references the corrected-away eval-2026-09-10 directory name", () => {
    const offenders: string[] = [];
    for (const file of [...DOC_ROOTS.flatMap((d) => listMdFiles(join(ROOT, d))), join(ROOT, "README.md")]) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (line.includes("eval-2026-09-10")) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(
      offenders,
      `stale references to the corrected-away dir name remain (the dir was renamed eval-2026-09-09b; docs must not cite the old name): ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("each eval-*/README.md claims every run manifest's createdAt date", () => {
    const mismatches: string[] = [];
    for (const dir of evalDirs()) {
      const readmePath = join(ROOT, "docs/research", dir, "README.md");
      if (!existsSync(readmePath)) {
        mismatches.push(`${dir}: missing README.md`);
        continue;
      }
      const claimed = new Set(readFileSync(readmePath, "utf8").match(/20\d{2}-\d{2}-\d{2}/g) ?? []);
      const runsDir = join(ROOT, "docs/research", dir, "runs");
      if (!existsSync(runsDir)) continue;
      for (const ent of readdirSync(runsDir, { withFileTypes: true })) {
        const manifest = join(runsDir, ent.name, "run.json");
        if (!ent.isDirectory() || !existsSync(manifest)) continue;
        let createdAt: unknown = null;
        try {
          createdAt = JSON.parse(readFileSync(manifest, "utf8")).createdAt;
        } catch {
          mismatches.push(`${dir}/runs/${ent.name}/run.json: unparseable JSON`);
          continue;
        }
        const t = typeof createdAt === "string" ? Date.parse(createdAt) : Number.NaN;
        if (Number.isNaN(t)) {
          mismatches.push(`${dir}/runs/${ent.name}/run.json: createdAt missing or not an ISO timestamp`);
          continue;
        }
        const date = new Date(t).toISOString().slice(0, 10);
        if (!claimed.has(date)) {
          mismatches.push(
            `${dir}/runs/${ent.name}/run.json: createdAt date ${date} is not claimed anywhere in ${dir}/README.md`,
          );
        }
      }
    }
    expect(mismatches, `README/manifest date disagreement: ${mismatches.join("; ")}`).toEqual([]);
  });

  it("no run manifest's createdAt is in the future relative to the newest file in its run dir", () => {
    // 1h tolerance, matching the harness chronology rule (a manifest may sit
    // slightly ahead of file writes within the same run; anything LONGER than
    // 1h past every file's last write is future-dated).
    const TOLERANCE_MS = 60 * 60 * 1000;
    const offenders: string[] = [];
    for (const dir of evalDirs()) {
      const runsDir = join(ROOT, "docs/research", dir, "runs");
      if (!existsSync(runsDir)) continue;
      for (const ent of readdirSync(runsDir, { withFileTypes: true })) {
        const runDir = join(runsDir, ent.name);
        const manifest = join(runDir, "run.json");
        if (!ent.isDirectory() || !existsSync(manifest)) continue;
        const createdAt = JSON.parse(readFileSync(manifest, "utf8")).createdAt;
        const t = typeof createdAt === "string" ? Date.parse(createdAt) : Number.NaN;
        if (Number.isNaN(t)) continue; // covered by the date-agreement test
        let newest = 0;
        const walk = (d: string): void => {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, e.name);
            if (e.isSymbolicLink()) continue;
            if (e.isDirectory()) walk(p);
            else newest = Math.max(newest, statSync(p).mtimeMs);
          }
        };
        walk(runDir);
        if (newest > 0 && t > newest + TOLERANCE_MS) {
          offenders.push(
            `${dir}/runs/${ent.name}/run.json: createdAt ${createdAt} is in the future relative to the newest file in the run dir`,
          );
        }
      }
    }
    expect(offenders, `future-dated run manifests: ${offenders.join("; ")}`).toEqual([]);
  });
});
