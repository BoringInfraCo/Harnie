# Harnie backup and recovery

## What to back up

The Harnie store is a single SQLite file:

- Default: `~/.harnie/harnie.db` (override with `HARNIE_HOME`, file is `$HARNIE_HOME/harnie.db`)

Home layout:

- `harnie.db` — all persisted Works, executions, events, checkpoints, forks. This is the only file you must back up.
- `handoffs/` — rendered Markdown continuation packages. Regenerable from the database (`harnie handoff <work> --to <target>`); safe to exclude from backups.

The home directory is created `0700` and `harnie.db` (plus backup files written by Harnie) `0600`, re-enforced on every store open. Keep copies equally private: retained history may contain sensitive session content.

## How to back up

Preferred — consistent snapshot of the live store (safe while Harnie is running):

```sh
harnie backup /path/to/harnie-backup.db
```

This runs SQLite `VACUUM INTO`, a transactional read that never modifies the live database. The destination is overwritten if it exists and is written `0600`.

Manual — only with the store closed (no `harnie` command running against that home):

```sh
cp "$HARNIE_HOME/harnie.db" /path/to/harnie-backup.db
chmod 600 /path/to/harnie-backup.db
```

Never copy `harnie.db` while a Harnie command is running; prefer `harnie backup`.

## How to restore

```sh
harnie restore /path/to/harnie-backup.db
```

Restore validates the file before touching the live store and refuses:

- non-Harnie files (missing Harnie tables, unreadable SQLite),
- backups from a newer Harnie schema than this CLI supports,
- overwriting a newer store (higher schema version) with an older backup — unless passed `--force`:

```sh
harnie restore /path/to/older-backup.db --force
```

The replacement is copied to a temp file and renamed, so a failed restore never leaves a half-written live database. Stale `-wal`/`-shm`/`-journal` sidecars next to the live path are removed.

## Version compatibility

- Restoring an older backup then opening it runs pending schema migrations forward automatically. Verify with `harnie list` and `harnie show <work>`.
- Downgrades are unsupported: a store migrated by a newer CLI may not open correctly with an older CLI, and `--force` downgrade-restore is a last resort — re-backup immediately after.
- Migrations are transactional: a failed upgrade rolls back and the pre-migration file is left intact. If open reports `Unsupported legacy store shape`, it names the table and missing columns; back up the file and upgrade the CLI before hand-editing anything.

## Recovery expectations

- A backup is a point-in-time snapshot; writes committed after the backup are not included.
- After restore, confirm the works you need are present (`harnie list`) and spot-check one (`harnie show <work>`).
- Keep at least one last known-good backup separate from the live home; test restores by restoring to an empty `HARNIE_HOME` and listing works.
