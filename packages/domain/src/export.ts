import type { TitleGrid } from "./grid";
import {
  ALL_ACCOUNTS,
  TOTAL_ACCOUNTS,
  TOTAL_ORGANIZATIONS,
  type SheetColumnKey,
} from "./sheet";
import type { EstimateValues, RowMetrics } from "./types";

export type SheetRow = Record<SheetColumnKey, string | number | null>;

export interface ExportTitleInfo {
  isbn: string;
  title: string;
  compIsbn: string | null;
  compTitle: string | null;
}

function valuesFor(own: EstimateValues, metrics: RowMetrics, hasComp: boolean) {
  return {
    initialOrder: metrics.initialOrder,
    salesNotes: own.salesNotes || null,
    laydownGoal: own.laydownGoal,
    laydownEstimate: own.laydownEstimate,
    sixMonthEstimate: own.sixMonthEstimate,
    compInitialOrder: hasComp ? metrics.compInitialOrder : null,
    compGross: hasComp ? metrics.compGross : null,
    compNet: hasComp ? metrics.compNet : null,
    // Not yet sourced (shown as "TBD" in the legacy app).
    compReturnsPct: null,
    comp4wkPos: null,
    comp8wkPos: null,
    compLtdPos: hasComp ? metrics.compReaderlinkPos : null,
  };
}

/**
 * Export rows for one title: a channel total row, one "All Accounts" row per organization,
 * and account rows only for account-level channels (legacy layout).
 * Estimate columns hold each level's OWN value, so re-uploading the file is lossless.
 */
export function buildExportRows(info: ExportTitleInfo, grid: TitleGrid): SheetRow[] {
  const rows: SheetRow[] = [];
  const base = {
    isbn: info.isbn,
    isbnTitle: info.title,
    compIsbn: info.compIsbn,
    compTitle: info.compTitle,
  };

  for (const ch of grid.channels) {
    const channel = { channelId: ch.ref.channelId, channelName: ch.ref.channelName };
    rows.push({
      ...base,
      ...channel,
      orgName: TOTAL_ORGANIZATIONS,
      orgId: TOTAL_ORGANIZATIONS,
      accountName: TOTAL_ACCOUNTS,
      accountId: TOTAL_ACCOUNTS,
      ...valuesFor(ch.own, ch.metrics, grid.hasComp),
    });

    for (const org of ch.orgs) {
      rows.push({
        ...base,
        ...channel,
        orgName: org.ref.orgName,
        orgId: org.ref.orgId,
        accountName: ALL_ACCOUNTS,
        accountId: ALL_ACCOUNTS,
        ...valuesFor(org.own, org.metrics, grid.hasComp),
      });

      if (!ch.accountLevel) continue;
      for (const acc of org.accounts) {
        rows.push({
          ...base,
          ...channel,
          orgName: org.ref.orgName,
          orgId: org.ref.orgId,
          accountName: acc.ref.accountName,
          accountId: acc.ref.accountId,
          ...valuesFor(acc.own, acc.metrics, grid.hasComp),
        });
      }
    }
  }
  return rows;
}
