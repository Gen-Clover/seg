"use client";

import type { TitleDetail } from "@/lib/queries";
import { api } from "./api";

/** Matches MAX_BATCH_TITLES on the server. */
const BATCH = 60;
const PARALLEL = 3;

/** Loads details for any number of titles in parallel batches, reporting progress (0–1). */
export async function fetchTitleDetails(
  isbns: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ titles: TitleDetail[]; missing: string[] }> {
  const unique = [...new Set(isbns)];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH) batches.push(unique.slice(i, i + BATCH));
  const results: { titles: TitleDetail[]; missing: string[] }[] = new Array(batches.length);
  let next = 0;
  let done = 0;
  onProgress?.(0, unique.length);
  const worker = async () => {
    while (next < batches.length) {
      const i = next++;
      results[i] = await api("/api/titles/batch", { method: "POST", json: { isbns: batches[i] } });
      done += batches[i]!.length;
      onProgress?.(done, unique.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker));
  return { titles: results.flatMap((r) => r.titles), missing: results.flatMap((r) => r.missing) };
}
