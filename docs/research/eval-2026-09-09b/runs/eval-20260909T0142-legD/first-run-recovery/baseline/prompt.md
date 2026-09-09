# Harnie continuation evaluation — task: first-run-recovery

No prior-session context is provided. Complete the task from the statement below.

## Task
Document backup/restore recovery in the first-run walkthrough.

Add a short '## Recovery' section to docs/internal/FIRST-RUN.md covering: `harnie backup <path>` writes a consistent SQLite snapshot (0600), `harnie restore <path> --force` validates the backup and then overwrites the live store, and restore has no undo. Edit only that file; no code changes.

## Required verification
- grep -n '^## Recovery' docs/internal/FIRST-RUN.md   # section exists
- git diff --stat   # only docs/internal/FIRST-RUN.md modified

## Expected end state
docs/internal/FIRST-RUN.md has a Recovery section with backup/restore usage and the no-undo caveat; no other file is modified.

## Working rules
- Work directly in this repository checkout (your current directory).
- Make the required edits yourself and run the verification commands.
- Do not commit; leave the working tree dirty with your edits.
- When finished, print a report: (1) files edited, (2) commands run, (3) verification pass/fail, (4) whether the task is complete.
