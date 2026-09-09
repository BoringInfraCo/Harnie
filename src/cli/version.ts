import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

export const packageVersion = (): string => {
  cached ??= findPackageVersion();
  return cached;
};

const findPackageVersion = (): string => {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
        name?: unknown;
        version?: unknown;
      };
      if (manifest.name === "harnie" && typeof manifest.version === "string") {
        return manifest.version;
      }
    } catch {
      // Keep walking up: the manifest is not at this level.
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return "unknown";
    }
    directory = parent;
  }
};
