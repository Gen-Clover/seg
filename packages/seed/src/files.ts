import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "output");
export const SOURCE_DIR = join(OUTPUT_DIR, "bigquery-source");
export const DERIVED_DIR = join(OUTPUT_DIR, "derived");
export const APP_DIR = join(OUTPUT_DIR, "app");

export function writeNdjson(path: string, rows: readonly object[]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
}

export function readNdjson<T = Record<string, unknown>>(path: string): T[] {
  if (!existsSync(path)) throw new Error(`Missing ${path}. Run "npm run seed:generate" first.`);
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new Error(`Missing ${path}. Run "npm run seed:generate" first.`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Minimal .env loader (no dependency): reads SEG/.env.local then SEG/.env. */
export function loadEnv() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  for (const name of [".env.local", ".env"]) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || process.env[m[1]!] !== undefined) continue;
      process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
    }
  }
  return root;
}
