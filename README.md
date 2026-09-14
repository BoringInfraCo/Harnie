# Harnie

**AI coding work should outlive the agent that performed it.**

Harnie is a local-first work-state layer for coding agents. It reads Pi, OpenCode, Codex, and Grok sessions without mutating them, stores observed work in SQLite, and emits Markdown continuation handoffs.

- **Import once** — archive local sessions into `$HARNIE_HOME/harnie.db`
- **Inspect evidence** — goal, decisions, findings, next steps, all with per-claim provenance
- **Continue anywhere** — hand off to a fresh session in any supported harness
- **Stay local** — no network calls; data leaves only when you paste a handoff artifact

All commands accept `--json` for machine-readable output, built for humans and agents alike.

---

## Quick start

```bash
export HARNIE_HOME="$(mktemp -d)"
harnie init
harnie import pi tests/fixtures/pi/coding.jsonl
harnie show work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8
harnie handoff work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 --to opencode
```

Paste the handoff Markdown into a fresh agent session and tell it to start from **Next steps**. See [docs/FIRST-RUN.md](docs/FIRST-RUN.md) for the full walkthrough.

---

## Commands

| Command | Description |
| --- | --- |
| `harnie sessions [--harness pi\|opencode\|codex\|grok]` | List importable local sessions plus the exact import command |
| `harnie import <harness> <path\|session-id>` | Import a session as observed Work (`--work <id>` attaches as a new execution) |
| `harnie list` / `show <work>` / `executions <work>` / `history <work>` | Inspect observed Work and its executions |
| `harnie diff <work> <a> <b>` | Diff two executions (`+` added / `=` kept / `-` removed) |
| `harnie checkpoint <work> [message]` / `fork <work> [--checkpoint <id>]` | Snapshot and fork observed Work |
| `harnie handoff <work> --to <pi\|opencode\|codex\|grok>` | Write a continuation package to `$HARNIE_HOME/handoffs/` |
| `harnie backup <path>` / `restore <path> [--force]` | Snapshot and restore the SQLite store |

---

## Installation

Requires Node.js **22.23 or newer in the Node 22 line**. Preview support is **macOS and Linux**; Windows is unverified.

```bash
curl -fsSL https://boringinfra.company/harnie/install.sh | sh
```

Or build from source:

```bash
npm ci
npm pack
npm install --global ./harnie-*.tgz
```

The package stays `private: true` and is **not published to npm**; distribution is via the install script, `npm pack` tarballs, and GitHub Release assets.

---

## Harnesses

| Harness | Import | Handoff |
| --- | --- | --- |
| Pi | ✅ Supported | ✅ Supported |
| OpenCode | ✅ Supported | ✅ Supported |
| Codex | 🧪 Experimental | 🧪 Experimental |
| Grok | ✅ Supported | 🧪 Experimental |

Run `harnie import --help` for per-harness input shapes. Source sessions are read read-only and never mutated.

---

## Limitations

- **No native resume.** Harnie does not resume sessions in any harness; it produces a Markdown package you hand to a fresh session.
- **Derived, not true.** Goal, decisions, findings, and next steps are rule-derived claims with per-claim provenance — traceable, but not necessarily true, current, or settled.
- **Experimental edges.** Codex import rests on a single manual gate datapoint; `handoff --to grok` completed one live leg but against a contaminated checkout. See `docs/research/`.
- **Best-effort redaction.** Obvious secrets are replaced with `[REDACTED:<kind>]` at import and as a backstop on output. Store (`0700` / `0600`) and artifacts (`0700` / `0600`) are permission-hardened, but retained history may hold sensitive content.
- **Recorded commands are evidence, not authorization.** Every handoff says so explicitly — do not replay without approval.

---

## Docs

- [docs/FIRST-RUN.md](docs/FIRST-RUN.md) — narrative install → import → inspect → handoff walkthrough
- [docs/SUPPORT-MATRIX.md](docs/SUPPORT-MATRIX.md) — per-harness support status
- [docs/MACHINE-CONTRACT.md](docs/MACHINE-CONTRACT.md) — `--json` envelope, error codes, data shapes
- [docs/BACKUP-RECOVERY.md](docs/BACKUP-RECOVERY.md) — backup/restore details

---

## Development

```bash
npm run typecheck
npm test
npm run check   # typecheck + test + package smoke test
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
