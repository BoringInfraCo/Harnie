# Harnie continuation evaluation — task: unrelated-slugify

No prior-session context is provided. Complete the task from the statement below.

## Task
Add a slugify function in src/slugify.ts and a test for it in tests/slugify.test.ts.

Create src/slugify.ts exporting slugify(input: string): string that lowercases, trims, replaces runs of non-alphanumeric characters with single hyphens, and strips leading/trailing hyphens. Create tests/slugify.test.ts with vitest covering empty string, spaces, punctuation, and mixed case. Edit only those two new files; do not modify existing files; do not commit.

## Required verification
- npx vitest run tests/slugify.test.ts   # passes
- git status --short   # only the two new files

## Expected end state
src/slugify.ts and tests/slugify.test.ts exist; the vitest suite passes; no existing file is modified.

## Working rules
- Work directly in this repository checkout (your current directory).
- Make the required edits yourself and run the verification commands.
- Do not commit; leave the working tree dirty with your edits.
- When finished, print a report: (1) files edited, (2) commands run, (3) verification pass/fail, (4) whether the task is complete.
