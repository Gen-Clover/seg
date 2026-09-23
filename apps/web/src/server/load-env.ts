import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let loaded = false;

/**
 * Loads the repository-root .env.local for local development (the web app lives in apps/web,
 * the shared env file at the repo root). On Vercel / servers, real environment variables are
 * used and no file is needed. Existing variables are never overwritten.
 */
export function loadRootEnv() {
  if (loaded) return;
  loaded = true;
  let dir = /*turbopackIgnore: true*/ process.cwd();
  for (let i = 0; i < 4; i++) {
    for (const name of [".env.local", ".env"]) {
      const file = path.join(/*turbopackIgnore: true*/ dir, name);
      if (existsSync(file)) applyEnvFile(file);
    }
    if (existsSync(path.join(/*turbopackIgnore: true*/ dir, ".env.local"))) return;
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

function applyEnvFile(file: string) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    const [, key, raw] = m as unknown as [string, string, string];
    if (process.env[key] !== undefined && process.env[key] !== "") continue;
    const value = raw.replace(/^(["'])(.*)\1$/, "$2");
    if (value !== "") process.env[key] = value;
  }
}
