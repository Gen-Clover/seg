/**
 * Maps BigQuery source rows to Mongo documents. Used by the production ingestion job and by
 * the demo seed loader, so both produce identical documents.
 */
import {
  DEFAULT_DOMAIN_CONFIG,
  accountKey,
  clean,
  isTitleInScope,
  normalizeAccount,
  seasonSortKey,
  type DomainConfig,
} from "@seg/domain";
import type { AccountDoc, TitleAccountFactDoc, TitleDoc } from "./mongo";

type Row = Record<string, unknown>;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** BigQuery DATE/TIMESTAMP values arrive as { value: "..." } objects. */
const raw = (v: unknown): unknown =>
  v !== null && typeof v === "object" && "value" in (v as Row) ? (v as Row).value : v;

/**
 * Normalizes the date formats seen in the legacy data to YYYY-MM-DD:
 * "2026-03-10", "2026-03-10T00:00:00Z", "3/10/2026", "3/10/2026 12:00:00 AM", "20260310".
 */
export function toIsoDate(value: unknown): string | null {
  const s = clean(raw(value));
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const EMPTY_TOTALS = {
  initialOrder: 0,
  laydownGoal: null,
  laydownEstimate: null,
  sixMonthEstimate: null,
  estimateVsGoal: null,
};

/** Reference fields of a title. Plan and totals are app-owned and set separately. */
export type TitleReference = Omit<TitleDoc, "plan" | "totals">;

export function titleFromBookRow(
  row: Row,
  stats: Row | undefined,
  refreshedAt: string,
  config: DomainConfig = DEFAULT_DOMAIN_CONFIG,
): TitleReference {
  const isbn = clean(row.EAN)!;
  const title = clean(row.FULL_TITLE) ?? "";
  const author = clean(row.AUTHOR_1);
  const season = clean(row.SEASON);
  const division = clean(row.GROUP_1);
  const imprint = clean(row.TESTIMPRINTFROMHNA);
  const format = clean(row.FORMAT);
  const ipmFormat = clean(row.IPM_FORMAT);
  const trim = [clean(row.TRIMLENGTH), clean(row.TRIMWIDTH)].filter(Boolean).join(" x ") || null;
  return {
    _id: isbn,
    isbn,
    title,
    author,
    season,
    seasonSort: season ? seasonSortKey(season) : Number.MAX_SAFE_INTEGER,
    division,
    imprint,
    format,
    ipmFormat,
    usPrice: num(row.US_PRICE),
    pubDate: toIsoDate(row.PUB_DATE),
    releaseDate: toIsoDate(row.RELEASE_DATE),
    paperCutOff: toIsoDate(row.PAPER_CUT_OFF),
    ldc: toIsoDate(row.LDC),
    pages: num(row.PAGES),
    trim,
    printRun: num(row.PRINT_RUN),
    announcedPrinting: num(row.ANNOUNCED_1ST_PRINTING__BEST),
    competitiveTitles: (clean(row.COMPETITIVE_TITLES) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    ebookIsbn: clean(row.EBOOK_ISBN),
    inScope: isTitleInScope({ season, ipmFormat, format, division, imprint, isbn }, config),
    stats: {
      ltdGrossUnits: num(stats?.LTD_GROSS_UNITS),
      bookscanLtd: stats?.HAS_BOOKSCAN ? num(stats?.BOOKSCAN_LTD) : null,
      ebookUnits: num(stats?.EBOOK_UNITS),
    },
    search: `${isbn} ${title} ${author ?? ""}`.toLowerCase(),
    refreshedAt,
  };
}

export function newTitleDoc(ref: TitleReference): TitleDoc {
  return {
    ...ref,
    plan: { compIsbn: null, titleNotes: "", updatedAt: null, updatedBy: null },
    totals: { ...EMPTY_TOTALS },
  };
}

export function factFromRow(row: Row): TitleAccountFactDoc {
  const ref = normalizeAccount({
    channelId: clean(row.DISTRIBUTION_CHANNEL),
    channelName: clean(row.DISTRIBUTION_CHANNEL_NAME),
    orgId: clean(row.ORGANIZATION_ID),
    orgName: clean(row.ORG_NAME),
    accountId: clean(row.ACCOUNT_NBR),
    accountName: clean(row.ACCOUNT_NAME),
  });
  return {
    isbn: clean(row.ISBN)!,
    ...ref,
    initialOrder: num(row.INITIAL_ORDER) ?? 0,
    grossUnits: num(row.GROSS_UNITS) ?? 0,
    netUnits: num(row.NET_UNITS) ?? 0,
    readerlinkPos: num(row.READERLINK_POS) ?? 0,
    inTitleList: row.IN_TITLE_LIST === true || row.IN_TITLE_LIST === "true",
    inCompList: row.IN_COMP_LIST === true || row.IN_COMP_LIST === "true",
  };
}

export function accountFromRow(row: Row): AccountDoc | null {
  const ref = normalizeAccount({
    channelId: clean(row.DISTRIBUTION_CHANNEL),
    channelName: clean(row.DISTRIBUTION_CHANNEL_NAME),
    orgId: clean(row.ORGANIZATION_ID),
    orgName: clean(row.ORG_NAME),
    accountId: clean(row.ACCOUNT_NBR),
    accountName: clean(row.ACCOUNT_NAME),
  });
  if (!ref.channelId || !ref.accountId) return null;
  return {
    _id: accountKey(ref),
    ...ref,
    search: [ref.channelId, ref.channelName, ref.orgId, ref.orgName, ref.accountId, ref.accountName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}
