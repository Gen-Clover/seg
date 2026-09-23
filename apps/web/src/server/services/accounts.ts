import type { Filter } from "mongodb";
import type { AccountDoc } from "@seg/data";
import type { AccountRef } from "@seg/domain";
import { collections } from "../db";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Valid channel / organization / account combinations, for adding rows. */
export async function searchAccounts(params: {
  q?: string;
  channelId?: string;
  orgId?: string;
  limit?: number;
}): Promise<AccountRef[]> {
  const filter: Filter<AccountDoc> = {};
  if (params.channelId) filter.channelId = params.channelId;
  if (params.orgId) filter.orgId = params.orgId;
  const words = (params.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) filter.$and = words.map((w) => ({ search: { $regex: escapeRegex(w) } }));
  const accounts = await collections.accounts();
  return accounts
    .find(filter, { projection: { _id: 0, search: 0 } })
    .sort({ channelName: 1, orgName: 1, accountName: 1 })
    .limit(Math.min(params.limit ?? 50, 200))
    .toArray();
}
