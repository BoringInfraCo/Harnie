# Pi research fixtures

These JSONL fixtures are sanitized derivatives of real Pi version-3 sessions published by Pi's maintainer in the `badlogicgames/pi-mono` public trace dataset. They are parser research evidence, not locally captured sessions and not complete examples of every documented Pi record.

`manifest.json` records the pinned dataset revision, source filename, selection boundary, retained features, and sanitization transformations for every fixture.

The stateful and model-transition fixtures are valid append-only prefixes of longer source sessions. This models what the same persisted file contained at that point in its lifetime without inventing later records.

Do not weaken future sanitization because the upstream dataset is already redacted. Public traces can still contain paths, provider signatures, arbitrary file contents, command output, extension data, and unrelated conversation material.
