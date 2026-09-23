/**
 * Core SEG domain types.
 *
 * Hierarchy: distribution channel → organization → account.
 * Every level is identified by id AND name together (a legacy rule: the same id
 * can appear with different names and must be treated as a different row).
 */

export type Level = "channel" | "org" | "account";

export interface ChannelRef {
  channelId: string | null;
  channelName: string | null;
}

export interface OrgRef extends ChannelRef {
  orgId: string | null;
  orgName: string | null;
}

export interface AccountRef extends OrgRef {
  accountId: string | null;
  accountName: string | null;
}

/** Editable numeric estimate fields. Whole, non-negative numbers; null = not set. */
export const ESTIMATE_NUMBER_FIELDS = [
  "laydownGoal",
  "laydownEstimate",
  "sixMonthEstimate",
] as const;
export type EstimateNumberField = (typeof ESTIMATE_NUMBER_FIELDS)[number];
export type EstimateField = EstimateNumberField | "salesNotes";
export const ESTIMATE_FIELDS: readonly EstimateField[] = [
  ...ESTIMATE_NUMBER_FIELDS,
  "salesNotes",
];

export interface EstimateValues {
  laydownGoal: number | null;
  laydownEstimate: number | null;
  sixMonthEstimate: number | null;
  salesNotes: string;
}

/** One saved estimate row (app-owned data). Channel rows leave org/account null; org rows leave account null. */
export interface EstimateRecord extends AccountRef, EstimateValues {
  isbn: string;
  level: Level;
  updatedAt?: string;
  updatedBy?: string;
}

/** Initial orders for one title at one account (reference data, from BigQuery). */
export interface AccountFact extends AccountRef {
  initialOrder: number;
}

/** Comparable-title figures for one account (reference data, from BigQuery). */
export interface CompAccountFact extends AccountRef {
  initialOrder: number;
  grossUnits: number;
  netUnits: number;
  readerlinkPos: number;
}

/** Per-row read-only figures. Comp figures are null when no comparable title is selected. */
export interface RowMetrics {
  initialOrder: number;
  compInitialOrder: number | null;
  compGross: number | null;
  compNet: number | null;
  compReaderlinkPos: number | null;
}

/** Numeric estimates after the channel > organization > account roll-up. */
export type RolledEstimates = Record<EstimateNumberField, number | null>;
