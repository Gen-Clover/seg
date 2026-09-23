import type { AccountRef, ChannelRef, Level, OrgRef } from "./types";

/** Separates id from name inside one level's key. */
const ID_NAME_SEP = "\u001e";
/** Separates levels inside a full key. */
const LEVEL_SEP = "\u001f";

export const NOT_DEFINED_CHANNEL_LABEL = "Not Defined";

/** Trims a value; empty or missing becomes null. */
export function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" || s.toUpperCase() === "NULL" ? null : s;
}

/**
 * Channel names fall back to the channel id (BigQuery rows sometimes have no name).
 * Org and account names never fall back.
 */
export function normalizeChannel<T extends ChannelRef>(ref: T): T {
  const channelId = clean(ref.channelId);
  return { ...ref, channelId, channelName: clean(ref.channelName) ?? channelId };
}

export function normalizeOrg<T extends OrgRef>(ref: T): T {
  return { ...normalizeChannel(ref), orgId: clean(ref.orgId), orgName: clean(ref.orgName) };
}

export function normalizeAccount<T extends AccountRef>(ref: T): T {
  return {
    ...normalizeOrg(ref),
    accountId: clean(ref.accountId),
    accountName: clean(ref.accountName),
  };
}

const part = (id: string | null, name: string | null) =>
  `${id ?? ""}${ID_NAME_SEP}${name ?? ""}`;

export function channelKey(ref: ChannelRef): string {
  const r = normalizeChannel(ref);
  return part(r.channelId, r.channelName);
}

export function orgKey(ref: OrgRef): string {
  const r = normalizeOrg(ref);
  return channelKey(r) + LEVEL_SEP + part(r.orgId, r.orgName);
}

export function accountKey(ref: AccountRef): string {
  const r = normalizeAccount(ref);
  return orgKey(r) + LEVEL_SEP + part(r.accountId, r.accountName);
}

/** Key of a row at the given level. */
export function levelKey(level: Level, ref: AccountRef): string {
  if (level === "channel") return channelKey(ref);
  if (level === "org") return orgKey(ref);
  return accountKey(ref);
}

/** Stable, readable id for an estimate row of a title, e.g. for use as a database _id. */
export function estimateId(isbn: string, level: Level, ref: AccountRef): string {
  return `${isbn}${LEVEL_SEP}${level}${LEVEL_SEP}${levelKey(level, ref)}`;
}

/** Strips a ref down to the fields that identify the given level. */
export function refForLevel(level: Level, ref: AccountRef): AccountRef {
  const r = normalizeAccount(ref);
  return {
    channelId: r.channelId,
    channelName: r.channelName,
    orgId: level === "channel" ? null : r.orgId,
    orgName: level === "channel" ? null : r.orgName,
    accountId: level === "account" ? r.accountId : null,
    accountName: level === "account" ? r.accountName : null,
  };
}

export function channelLabel(ref: ChannelRef): string {
  return normalizeChannel(ref).channelName ?? NOT_DEFINED_CHANNEL_LABEL;
}
