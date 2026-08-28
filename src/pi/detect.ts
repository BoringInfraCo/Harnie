import type { JsonObject, PiSourceFamily } from "../types.js";

export const detectPiSourceFamilyFromHeader = (
  header: JsonObject | undefined,
): PiSourceFamily => {
  if (!header) return "unknown";

  if (header.type === "session" && header.version === 3) {
    return "pi-session-v3";
  }

  if (header.kind === "header" && header.version === 4) {
    return "pi-session-v4";
  }

  return "unknown";
};

export const sessionIdFromHeader = (header: JsonObject | undefined): string | undefined => {
  if (!header || typeof header.id !== "string") return undefined;
  return header.id;
};
