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

/** Returns the reference accounts matching the given combinations (unknown ones are left out). */
export async function resolveAccounts(
  keys: { channelId: string | null; orgId: string | null; accountId: string | null }[],
): Promise<AccountRef[]> {
  const wanted = keys.filter((k) => k.channelId && k.orgId && k.accountId);
  if (!wanted.length) return [];
  const accounts = await collections.accounts();
  return accounts
    .find(
      { $or: wanted.map((k) => ({ channelId: k.channelId, orgId: k.orgId, accountId: k.accountId })) },
      { projection: { _id: 0, search: 0 } },
    )
    .toArray();
}
