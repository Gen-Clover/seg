"use client";

import {
  SHEET_COLUMNS,
  SHEET_COLUMN_ORDER,
  buildExportRows,
  buildTitleGrid,
  type EstimateRecord,
} from "@seg/domain";
import { fetchTitleDetails } from "@/lib/batch";
import type { TitleDetail, TitleSummaryRow } from "@/lib/queries";
import { dateStamp, downloadCsv, downloadWorkbook } from "@/lib/sheets";

const usDate = (iso: string | null) => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : "";
};

/** Summary sheet with the legacy "SEG Records" columns. */
export async function exportSummary(rows: TitleSummaryRow[]) {
  const headers = [
    "ISBN", "SEASON", "PAPER CUT OFF DATE", "LDC", "DIVISION", "IMPRINT", "TITLE", "AUTHOR NAME", "PUB DATE",
    "RELEASE DATE", "FORMAT", "US PRICE ($)", "Laydown Goal (TOTAL)", "TOTAL Laydown Estimate",
    "ESTIMATE VS PUB GOAL", "TOTAL INITIAL ORDERS", "6-month Estimate (TOTAL)", "COMP ISBN",
  ];
  const data = rows.map((t) => [
    t.isbn, t.season, usDate(t.paperCutOff), usDate(t.ldc), t.division, t.imprint, t.title, t.author, usDate(t.pubDate),
    usDate(t.releaseDate), t.format, t.usPrice, t.totals.laydownGoal, t.totals.laydownEstimate,
    t.totals.estimateVsGoal, t.totals.initialOrder, t.totals.sixMonthEstimate, t.compIsbn,
  ]);
  await downloadWorkbook(`SEG Summary ${dateStamp()}.xlsx`, [
    { name: "SEG Records", headers, rows: data, widths: [15, 12, 12, 12, 16, 22, 40, 22, 12, 12, 8, 10, 14, 14, 14, 14, 14, 15] },
  ]);
}

const ACCOUNT_WIDTHS: Partial<Record<(typeof SHEET_COLUMN_ORDER)[number], number>> = {
  isbnTitle: 35, compTitle: 35, channelName: 25, orgName: 28, accountName: 32, salesNotes: 30,
};

function accountDetailRows(details: TitleDetail[]) {
  const out: (string | number | null)[][] = [];
  for (const d of details) {
    const grid = buildTitleGrid({ facts: d.facts, compFacts: d.compFacts, estimates: d.estimates as EstimateRecord[] });
    const rows = buildExportRows(
      { isbn: d.title.isbn, title: d.title.title, compIsbn: d.comp?.isbn ?? null, compTitle: d.comp?.title ?? null },
      grid,
    );
    for (const r of rows) out.push(SHEET_COLUMN_ORDER.map((k) => r[k]));
  }
  return out;
}

/**
 * Account-detail export for the given titles (legacy "SEG Account Details").
 * The layout is the upload template: edit it in Excel and upload it back.
 */
export async function exportAccountDetails(
  isbns: string[],
  format: "xlsx" | "csv",
  onProgress?: (done: number, total: number) => void,
): Promise<{ rows: number; titles: number; missing: string[] }> {
  const { titles, missing } = await fetchTitleDetails(isbns, onProgress);
  const rows = accountDetailRows(titles);
  const headers = SHEET_COLUMN_ORDER.map((k) => SHEET_COLUMNS[k]);
  const name = `SEG Account Details - ${titles.length === 1 ? titles[0]!.title.isbn : "Multiple_ISBNs"} ${dateStamp()}`;
  if (format === "csv") downloadCsv(`${name}.csv`, headers, rows);
  else {
    await downloadWorkbook(`${name}.xlsx`, [
      { name: "SEG Records", headers, rows, widths: SHEET_COLUMN_ORDER.map((k) => ACCOUNT_WIDTHS[k] ?? 15) },
    ]);
  }
  return { rows: rows.length, titles: titles.length, missing };
}
