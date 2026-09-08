# Harnie continuation evaluation — task: help-regression-test

No prior-session context is provided. Complete the task from the statement below.

## Task
Add a regression test that pins the CLI help surface.

Create tests/regression-help.test.ts importing runCli from ../src/cli.js, capturing stdout for a ["--help"] invocation (follow the capture() pattern in tests/cli-init.test.ts), and asserting the help output includes 'backup <path>', 'restore <path> [--force]', 'handoff <work>', and 'import pi <path>'. Do not modify any existing file.

## Required verification
- npx vitest run tests/regression-help.test.ts   # passes
- npm run typecheck   # clean

## Expected end state
A new passing tests/regression-help.test.ts exists pinning the four help strings; no existing file is modified.

## Working rules
- Work directly in this repository checkout (your current directory).
- Make the required edits yourself and run the verification commands.
- Do not commit; leave the working tree dirty with your edits.
- When finished, print a report: (1) files edited, (2) commands run, (3) verification pass/fail, (4) whether the task is complete.
