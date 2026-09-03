# Sprint 008 probe — can OpenCode run a live continuation?

Evidence cutoff: 2026-09-01  
Sprint: 008 — OpenCode Continuation Evaluation  
Scope: local CLI discovery only. No Harnie product changes. No commit. No write to `~/.harnie`. No `opencode run`, `opencode import`, or other session-creating command.

## Result in one sentence

OpenCode **is installed and invokable** on this machine (`1.18.26` on PATH), with a documented non-interactive prompt path (`opencode run [message..]`, optional `-f` file attach), but a **live continuation was not attempted**: it needs provider credentials and a network model call, and it would write OpenCode session state. Sprint 008’s “fresh OpenCode vs Harnie handoff” comparison **cannot be completed** under those constraints.

## Verdict

| Question | Answer |
|---|---|
| OpenCode CLI installed? | **Yes.** PATH binary `/Users/sergio/.opencode/bin/opencode`, version **1.18.26**. |
| `pi` CLI installed? | **Yes.** `/Users/sergio/.local/bin/pi` → `@earendil-works/pi-coding-agent`, version **0.84.4**. |
| Auth present? | **Yes.** `opencode providers list` reports 3 credentials in `~/.local/share/opencode/auth.json`: Anthropic, MiniMax, OpenCode Go. Keys were not read. |
| Safe prompt injection path? | **Documented, not offline-safe.** `opencode run [message..]` and `opencode run -f <file>`. Stdin is not documented as a prompt source. `opencode import` would mutate the native session DB. |
| Live continuation attempted? | **No.** It would spend money, hit the network, and write production OpenCode state. |
| Live Harnie-vs-fresh comparison possible in this probe? | **No.** OpenCode can be invoked, but a real continuation is not a dry-run. |

## What was run

Allowed dry-run only:

- `command -v opencode`, `command -v pi`, `which -a`, common install-path existence checks
- `opencode --version`, `opencode --help`, `opencode run --help`, plus `--help` on `session`, `import`, `db`, `providers`, `debug`, `acp`, `serve`, `models`
- `opencode debug paths`, `opencode debug info`, `opencode debug config`, `opencode db path`
- `opencode providers list` (names only; tokens not printed)
- Isolated-XDG `debug paths` / `db path` under `/tmp/opencode-probe-*`, then that tree was deleted

Not run (would spend money and/or write a session):

- `opencode run …`
- `opencode --prompt …` / default TUI
- `opencode import …`
- `opencode db '<sql>'`
- any model call, including an isolated-XDG `run`

No continuation transcript exists. None is invented here.

## Install discovery

### OpenCode

`command -v opencode` → `/Users/sergio/.opencode/bin/opencode`

| Path | What it is |
|---|---|
| `/Users/sergio/.opencode/bin/opencode` | PATH winner. Mach-O arm64, 144 057 698 bytes, mtime 2026-09-01 17:10. `--version` → **1.18.26**. |
| `/opt/homebrew/bin/opencode` | Homebrew symlink to `Cellar/opencode/0.4.26`. **Shadowed.** `--version` → **0.4.26**. Formula reports bottled stable **1.18.20**; this Cellar copy was not upgraded. |
| `/usr/local/bin/opencode`, `/usr/bin/opencode`, `~/.local/bin/opencode` | Missing |

Sprint 008 should call the PATH binary (or the absolute `~/.opencode/bin/opencode` path). The Homebrew 0.4.26 binary is a different, older CLI.

`opencode debug info`: version 1.18.26, Darwin arm64, plugins none.

### Pi

`command -v pi` → `/Users/sergio/.local/bin/pi`

Symlink to `~/.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`. `--version` → **0.84.4**.

Pi is relevant only as the *source* harness in the IMPLEMENTATION.md protocol. This probe did not start a Pi task.

## How to pass a prompt

From `opencode --help` and `opencode run --help` (1.18.26):

### Non-interactive (the candidate continuation path)

```text
opencode run [message..]
```

Documented inputs:

- positional `message` array — the prompt
- `-f, --file` — attach file(s) to the message (Harnie’s markdown handoff could be passed this way)
- `-m, --model` — `provider/model`
- `--agent`, `--variant`, `--format default|json`
- `-c/--continue`, `-s/--session`, `--fork` — resume/fork existing OpenCode sessions
- `--dir` — working directory
- `--title` — session title
- `-i/--interactive` — not a dry-run
- `--auto` — auto-approve permissions (dangerous)

Stdin is **not** listed as a prompt source. This probe did not pipe text into `opencode run`.

### Interactive

Default command is the TUI: `opencode [project]`. Top-level `--prompt` “prompt to use” starts that UI, not a one-shot print mode.

### Native session import (unsafe for this sprint)

```text
opencode import <file>
```

Imports session JSON into OpenCode’s database. Harnie V0 explicitly does not do this (Sprint 007 freeze: no OpenCode SQLite mutation, no Pi → OpenCode session translation). Do not use `import` to “inject” a Harnie handoff.

### Harnie side (already shipped, not invoked here)

`harnie handoff <work> --to opencode` writes markdown to stdout and to `$HARNIE_HOME/handoffs/<work>.md`. The renderer’s first lines are “Continue this work…”. The IMPLEMENTATION.md dogfood step is then to ask OpenCode only “Continue the work.” The supported consumption path, given this CLI, is:

1. paste the markdown into the TUI, or
2. `opencode run -f ~/.harnie/handoffs/<work>.md "Continue the work."`

Both are live agent sessions. Neither is a dry-run.

## Auth and production state

OpenCode global paths (`opencode debug paths`, no XDG override):

| Role | Path |
|---|---|
| data | `/Users/sergio/.local/share/opencode` |
| db | `/Users/sergio/.local/share/opencode/opencode.db` |
| auth | `/Users/sergio/.local/share/opencode/auth.json` (mode 0600) |
| account | `/Users/sergio/.local/share/opencode/account.json` |
| config | `/Users/sergio/.config/opencode` (`opencode.jsonc` is schema-only) |
| cache | `/Users/sergio/.cache/opencode` |
| state | `/Users/sergio/.local/state/opencode` |

`opencode providers list` (credential *names* only):

- Anthropic api
- MiniMax (minimax.io) api
- OpenCode Go api
- 3 credentials

Auth JSON top-level keys (names only, values not read beyond type): `anthropic`, `minimax`, `opencode-go`, each a `{type, key}` object.

There is no OpenCode equivalent of Pi’s `--offline` or `--no-session` in `run --help`. `OPENCODE_DB` (including `:memory:`) and `XDG_DATA_HOME` exist in the binary and can redirect the database, but they do not remove the need for a provider call.

`~/.harnie` does not exist. This probe did not create it.

## Isolation experiment (non-run)

With `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, and `XDG_CACHE_HOME` pointed at a throwaway `/tmp/opencode-probe-*` tree:

- `debug paths` reported data under that temp tree
- `db path` reported `/tmp/.../data/opencode/opencode.db`
- OpenCode **created** that SQLite file (plus WAL/SHM and log) just from `db path`

The temp tree was deleted. Redirecting XDG avoids the production DB for *those* commands. It does **not** make `opencode run` free, offline, or authless: credentials still live in the production auth file unless that is also redirected, and a `run` still calls a model.

## Why a live continuation was not started

A non-interactive continuation is *possible on this machine* in the ordinary sense: the CLI exists, auth exists, and `opencode run` accepts a message. It is **not** possible **without** network/API keys and **without** writing OpenCode state.

`opencode run` has no documented dry-run, offline, or no-session flag. Any real `run`:

1. uses provider credentials
2. performs a paid/network completion
3. opens/writes `opencode.db` (session row), unless XDG/`OPENCODE_DB` is redirected — and even then it still does (1) and (2)

Per probe rules: say so and stop. Do not fake a transcript.

## Side effect of this probe

Several production-path commands (`debug paths`, `db path`, `debug info`, `debug config`, `providers list`) were run **before** XDG isolation. OpenCode appears to mkdir its data dirs and open SQLite on those commands. Observed production DB size/mtime:

- first listing: `opencode.db` 594 989 056 bytes, mtime 2026-09-01 20:21; WAL 2 500 872 bytes
- after those commands: `opencode.db` 595 320 832 bytes, mtime 2026-09-01 23:54; WAL 32 768 bytes

That is consistent with a WAL checkpoint from opening the production DB. No `run`, `import`, or SQL write was issued. Later `--help` calls did not change those mtimes. Subsequent path probes used isolated XDG.

This is not a continuation session. It is still a production-DB open that this probe should have avoided. Further Sprint 008 work should prefix OpenCode invocations with XDG overrides (or not touch the CLI beyond `--help`) unless the operator explicitly accepts a live session.

## Implication for Sprint 008

IMPLEMENTATION.md steps 19–20 need a real unfinished Pi task, `harnie import pi`, `harnie handoff --to opencode`, then OpenCode asked only “Continue the work,” scored against a fresh OpenCode session with no Harnie context.

This probe establishes:

- OpenCode **can** be invoked.
- The safest *supported* input is markdown via `opencode run` message and/or `-f`, or paste into the TUI — not `opencode import`.
- A live comparison **was not executed** and **cannot be executed** under no-network / no-spend / no-production-state rules.
- Completing Sprint 008 therefore requires an explicit operator decision to run a paid OpenCode session (preferably with isolated `XDG_*` so it does not land in the user’s existing `opencode.db`).

Until that happens, the Sprint 007 freeze still holds: Harnie has a handoff artifact, not a scored continuation.
)
