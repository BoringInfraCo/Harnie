# Release notes — harnie 0.1.0-rc.8 (limited developer preview)

Date: 2026-09-11. RC8 carries forward RC7 and adds a production curl-install
path plus the final re-audit corrections. This note is lifecycle-neutral so
it remains accurate inside the immutable package.

## Preview promise

Import supported local coding sessions, inspect evidence-backed work history,
and prepare Markdown continuation packages. Harnie stores its SQLite database
and generated handoffs locally. It does not natively resume sessions, accept
every session format, or claim measured productivity savings.

Preview platform support is macOS and Linux. Windows is unverified.

## New in RC8

- The macOS/Linux installer is available as
  `curl -fsSL https://boringinfra.company/harnie/install.sh | sh`. It checks
  the supported Node.js line, downloads the version-pinned tarball and SHA-256
  sidecar, verifies the checksum, installs with npm, and verifies the installed
  CLI version.
- Installer version synchronization is fail-closed. The checker rejects
  missing, duplicated, malformed, or mismatched version markers across the
  installer, asset-preparation script, and Cloudflare routes. The deployment
  command synchronizes and checks those markers before deployment.
- Automated checks include mocked installer behavior and installer-asset
  consistency. A separate post-deployment smoke installs from the public URL
  into an isolated prefix and verifies `harnie --version`.
- The evaluation task for `--version` now derives its expectation from
  `package.json`; it no longer embeds the obsolete `0.0.0` value.
- The 2026-09-11 OpenRouter probe evidence is sanitized to remove its
  account-specific key-management identifier while preserving the provider
  status, limits, timestamps, and error chain.

## Release qualification

This is a limited developer preview under an explicit waiver of the full
continuation-matrix gate. Verdict A, safety among completed receiver runs,
is PASS. Verdict B, the complete cross-harness matrix, remains
PARTIAL/INCONCLUSIVE because the remaining Pi-receiver conditions could not
run within the available OpenRouter quota and paid balance.

That limitation concerns evaluation coverage, not a known defect in Harnie's
import, storage, inspection, handoff, backup, packaging, or installer paths.
It means only that we do not claim every cross-harness route is fully
qualified or that Harnie measurably reduces developer re-explanation.

## Known limitations

- Redaction is best-effort. Stores created before ingestion redaction may
  retain raw values; display and handoff redaction does not rewrite the
  database.
- The preview supports one writer at a time. Concurrent commands against one
  Harnie home are not supported.
- Codex import support remains experimental, and the successful receiver
  sample is limited.
- Pi/OpenCode evaluation drivers are synthetic, successful directed legs have
  small samples, and the Pi-receiver matrix conditions remain incomplete.
- Windows has not been exercised by the automated or live installer checks.

See `docs/internal/SUPPORT-MATRIX.md` for capability-level scope and evidence,
and `docs/internal/BACKUP-RECOVERY.md` for recovery procedures.

## Install

Requires Node.js 22.23 or newer within the Node 22 release line and npm:

```sh
curl -fsSL https://boringinfra.company/harnie/install.sh | sh
```

Verify without using a real Harnie home:

```sh
export HARNIE_HOME="$(mktemp -d)"
harnie --version
harnie --help
harnie init
harnie init --bogus
harnie backup x.db --help --bogus
```

The two commands containing `--bogus` must fail with an unknown-flag error.
The repository's offline equivalent is `npm run check`; installer consistency
is checked with `npm run check:installer`.

## Evaluation disclosure

Verdict A remains PASS across the completed runs. Verdict B remains
PARTIAL/INCONCLUSIVE: OpenCode→Pi baseline and additional trials plus
Codex→Pi handoff and baseline are not run. The 2026-09-11 attempt shows Pi
made the correct benchmark edit before the shared free-tier cap interrupted
verification. A funded provider or a fresh, uncontested quota window is needed
to complete those conditions.

No productivity-saving claim is made. Existing paired measurements are too
small and mixed to establish substantially reduced re-explanation.
