# Pi research fixtures

These JSONL fixtures are sanitized derivatives of real Pi version-3 sessions. They are parser and normalizer evidence, not complete examples of every documented Pi record.

`manifest.json` records source class, capture method, selection boundary, retained features, sanitization transformations, and known limitations for every fixture.

## Public traces (A–D)

Fixtures A–D are sanitized derivatives of sessions published by Pi's maintainer in the `badlogicgames/pi-mono` public trace dataset. They are not locally captured sessions.

The stateful and model-transition fixtures are valid append-only prefixes of longer source sessions. This models what the same persisted file contained at that point in its lifetime without inventing later records.

Do not weaken future sanitization because the upstream dataset is already redacted. Public traces can still contain paths, provider signatures, arbitrary file contents, command output, extension data, and unrelated conversation material.

## Local traces (E–F)

Fixtures E and F are sanitized derivatives of real locally emitted Pi v3 sessions captured read-only on 2026-09-01.

- **E / `trace-a-coding.jsonl`:** sandbox-permission coding probe with write, read, bash, a successful file write, and a denied `.env` write (`isError: true`).
- **F / `trace-b-unfinished.jsonl`:** unfinished investigation with parallel tool calls and a final `read` that has no tool result.

Original private session files were not committed. Local traces are not claimed to be byte-identical to the originals.
