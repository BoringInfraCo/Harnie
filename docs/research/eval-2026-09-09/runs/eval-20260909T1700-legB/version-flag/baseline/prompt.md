# Harnie continuation evaluation — task: version-flag

No prior-session context is provided. Complete the task from the statement below.

## Task
Add a --version flag to the Harnie CLI that prints the package version.

When the CLI is invoked with --version (or -v) as its first argument, print the version declared in package.json (read it, do not hardcode) to stdout and exit with code 0, before any other argument handling. All other flags and commands must behave exactly as before.

## Required verification
- npm run build
- node dist/cli.js --version   # prints 0.0.0, exit 0
- npx vitest run tests/cli-init.test.ts   # still green

## Expected end state
`node dist/cli.js --version` prints 0.0.0 and exits 0; existing CLI behavior and the cli-init tests are unchanged.

## Working rules
- Work directly in this repository checkout (your current directory).
- Make the required edits yourself and run the verification commands.
- Do not commit; leave the working tree dirty with your edits.
- When finished, print a report: (1) files edited, (2) commands run, (3) verification pass/fail, (4) whether the task is complete.
