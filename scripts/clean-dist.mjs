import { rmSync } from "node:fs";

// Only generated output lives here; remove modules deleted or renamed since the last build.
rmSync(new URL("../dist/", import.meta.url), { recursive: true, force: true });
