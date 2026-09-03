import { homedir } from "node:os";
import { join } from "node:path";

export const HARNIE_HOME_ENV = "HARNIE_HOME";

export const resolveHarnieHome = (override?: string): string =>
  override ?? process.env[HARNIE_HOME_ENV] ?? join(homedir(), ".harnie");

export const databasePath = (home: string): string => join(home, "harnie.db");
