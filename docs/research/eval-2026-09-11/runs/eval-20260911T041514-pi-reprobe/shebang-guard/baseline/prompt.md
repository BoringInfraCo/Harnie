# Harnie continuation evaluation — task: shebang-guard

No prior-session context is provided. Complete the task from the statement below.

## Task
Make scripts/prepare-bin.mjs fail with a clear message when dist/cli.js lacks a shebang.

Before chmodding dist/cli.js, the script must check that dist/cli.js exists and begins with '#!'. If the file is missing or lacks the shebang, print a clear error to stderr naming dist/cli.js and the missing shebang, and exit non-zero. Otherwise chmod 0o755 and exit 0 as today. Edit only scripts/prepare-bin.mjs.

## Required verification
- npm run build && node scripts/prepare-bin.mjs   # exits 0 (shebang present)
- node -e "const fs=require('fs');const s=fs.readFileSync('dist/cli.js','utf8');fs.writeFileSync('dist/cli.js',s.replace(/^#![^
]*\n/,''))" && node scripts/prepare-bin.mjs   # exits non-zero with the shebang error
- npm run build   # restores dist/cli.js
- npm run test:package   # still green

## Expected end state
prepare-bin.mjs exits 0 when dist/cli.js has a shebang and exits non-zero with a clear stderr message when it does not; the normal build and package smoke test still pass.

## Working rules
- Work directly in this repository checkout (your current directory).
- Make the required edits yourself and run the verification commands.
- Do not commit; leave the working tree dirty with your edits.
- When finished, print a report: (1) files edited, (2) commands run, (3) verification pass/fail, (4) whether the task is complete.
