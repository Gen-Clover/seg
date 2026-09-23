/**
 * JavaScript port of the ingestion SQL in @seg/data (buildFactsSql / buildStatsSql / buildAccountsSql).
 * Output rows have the same shape as the BigQuery results, so they go through the same mapping.
 *
 * Used to load MongoDB without BigQuery (local development) and to cross-check the SQL.
 */
import type { Row, SourceTables } from "./build";

const nn = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const storeFromAccountStore = (s: string) => (s.length > 5 ? `${s.slice(0, -5)}_${s.slice(-5)}` : s);
const parseYmd = (s: unknown) => {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s ?? "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

type AccountTuple = [string | null, string | null, string | null, string | null, string | null, string | null];
const tupleKey = (t: AccountTuple, isbn: string) => JSON.stringify([...t, isbn]);

interface Acc {
  tuple: AccountTuple;
  isbn: string;
  initial: number;
  gross: number;
  net: number;
  rl: number;
  inTitle: boolean;
  inComp: boolean;
}

export function deriveFacts(src: SourceTables, options: { today: string; minSeasonYear: number }): Row[] {
  const accountsByStore = new Map<string, AccountTuple[]>();
  const seen = new Set<string>();
  for (const c of src.BIL_CUSTOMERS ?? []) {
    const tuple: AccountTuple = [
      nn(c.DISTRIBUTION_CHANNEL), nn(c.DISTRIBUTION_CHANNEL_NAME), nn(c.ORGANIZATION_ID), nn(c.ORG_NAME), nn(c.ACCOUNT_NBR), nn(c.ACCOUNT_NAME),
    ];
    const key = JSON.stringify([...tuple, c.STORE_ID]);
    if (seen.has(key)) continue;
    seen.add(key);
    const list = accountsByStore.get(String(c.STORE_ID)) ?? [];
    list.push(tuple);
    accountsByStore.set(String(c.STORE_ID), list);
  }

  const books = new Map<string, { pub: string | null; seasonYear: number | null }>();
  for (const b of src.BIL_BOOKATTRIBUTES ?? []) {
    const ean = nn(b.EAN);
    if (!ean || ean.startsWith("EISBN")) continue;
    const year = Number(String(b.SEASON ?? "").trim().split(" ")[1]);
    books.set(ean, { pub: nn(b.PUB_DATE)?.slice(0, 10) ?? null, seasonYear: Number.isFinite(year) ? year : null });
  }

  // Open orders from the latest order file.
  const orders = src.DIL_HBG_ORDERS ?? [];
  const latest = orders.reduce((m, o) => (String(o.FILEDATE).slice(0, 10) > m ? String(o.FILEDATE).slice(0, 10) : m), "");
  const invoiced = new Set((src.DTL_HBG_FINAL ?? []).map((r) => `${r.EISBN}|${r.STORE_ID}`));
  const byRef = new Map<string, Row>();
  for (const o of orders) {
    if (o.LINE_STATUS === "DELETED" || String(o.FILEDATE).slice(0, 10) !== latest) continue;
    const cancel = nn(o.CANCEL_DATE);
    if (cancel && (parseYmd(cancel) ?? "9999") < options.today) continue;
    const key = `${o.ISBN}|${o.REFERENCE_NBR}`;
    const prev = byRef.get(key);
    if (!prev || String(o.FILEDATE) > String(prev.FILEDATE)) byRef.set(key, o);
  }

  interface Activity { store: string; date: string; isbn: string; indicator: string; source: "SALES" | "ORDER"; units: number }
  const activity: Activity[] = [];
  for (const o of byRef.values()) {
    const store = storeFromAccountStore(String(o.ACCOUNT_STORE));
    if (invoiced.has(`${o.ISBN}|${store}`)) continue;
    activity.push({ store, date: parseYmd(o.ENTRY_DATE)!, isbn: String(o.ISBN), indicator: "Gross Sales", source: "ORDER", units: n(o.QUANTITY) });
  }
  for (const s of src.BIL_MF_FACT_SALES ?? []) {
    if (s.DATA_TYPE !== "Sales") continue;
    activity.push({ store: String(s.STORE_ID), date: String(s.EXACT_DATE).slice(0, 10), isbn: String(s.EISBN), indicator: String(s.SALES_INDICATOR), source: "SALES", units: n(s.UNITS) });
  }

  const acc = new Map<string, Acc>();
  const get = (tuple: AccountTuple, isbn: string) => {
    const key = tupleKey(tuple, isbn);
    let a = acc.get(key);
    if (!a) {
      a = { tuple, isbn, initial: 0, gross: 0, net: 0, rl: 0, inTitle: false, inComp: false };
      acc.set(key, a);
    }
    return a;
  };

  for (const x of activity) {
    const book = books.get(x.isbn);
    const tuples = accountsByStore.get(x.store);
    if (!book || !tuples) continue;
    const prepub = x.indicator === "Gross Sales" && book.pub !== null && x.date < book.pub;
    for (const t of tuples) {
      const a = get(t, x.isbn);
      a.inComp = true;
      if (prepub) {
        a.initial += x.units;
        a.inTitle = true;
      }
      if (x.indicator === "Gross Sales" && x.source === "SALES") a.gross += x.units;
      if (x.indicator === "Net Sales" && x.source === "SALES") a.net += x.units;
    }
  }

  const placeholderBooks = [...books].filter(([, b]) => b.seasonYear !== null && b.seasonYear >= options.minSeasonYear).map(([ean]) => ean);
  for (const p of src.BIL_SEG_POPULAR_ACCOUNTS ?? []) {
    const t: AccountTuple = [nn(p.DISTRIBUTION_CHANNEL), nn(p.DISTRIBUTION_CHANNEL_NAME), nn(p.ORGANIZATION_ID), nn(p.ORG_NAME), nn(p.ACCOUNT_NBR), nn(p.ACCOUNT_NAME)];
    for (const ean of placeholderBooks) get(t, ean).inTitle = true;
  }
  const chains = (src.BIL_READERLINK_CHAIN ?? []).filter((c) => c.ORGANIZATION_ID === "90001368");
  const chainTuple = (c: Row): AccountTuple => [nn(c.DISTRIBUTION_CHANNEL), nn(c.DISTRIBUTION_CHANNEL_NAME), c.ORGANIZATION_ID as string, c.ORG_NAME as string, c.CHAIN_ID as string, c.MASTER_CHAIN as string];
  for (const c of chains) for (const ean of placeholderBooks) get(chainTuple(c), ean).inTitle = true;
  for (const p of src.BIL_READERLINK_POS ?? []) {
    for (const c of chains.filter((x) => x.MASTER_CHAIN === p.MASTER_CHAIN)) {
      const a = get(chainTuple(c), String(p.ITEM_NUMBER));
      a.rl += n(p.UNITS);
      a.inComp = true;
    }
  }

  return [...acc.values()].map((a) => ({
    ISBN: a.isbn,
    DISTRIBUTION_CHANNEL: a.tuple[0],
    DISTRIBUTION_CHANNEL_NAME: a.tuple[1],
    ORGANIZATION_ID: a.tuple[2],
    ORG_NAME: a.tuple[3],
    ACCOUNT_NBR: a.tuple[4],
    ACCOUNT_NAME: a.tuple[5],
    INITIAL_ORDER: Math.round(a.initial),
    GROSS_UNITS: Math.round(a.gross),
    NET_UNITS: Math.round(a.net),
    READERLINK_POS: Math.round(a.rl),
    IN_TITLE_LIST: a.inTitle,
    IN_COMP_LIST: a.inComp,
  }));
}

export function deriveStats(src: SourceTables): Row[] {
  const gross = new Map<string, number>();
  const ebookByEan = new Map<string, number>();
  for (const s of src.BIL_MF_FACT_SALES ?? []) {
    if (s.DATA_TYPE !== "Sales" || s.SALES_INDICATOR !== "Gross Sales") continue;
    gross.set(String(s.EISBN), (gross.get(String(s.EISBN)) ?? 0) + n(s.UNITS));
    if (s.SALES_TYPE === "ESales") ebookByEan.set(String(s.EISBN), (ebookByEan.get(String(s.EISBN)) ?? 0) + n(s.UNITS));
  }
  const books = (src.BIL_BOOKATTRIBUTES ?? []).filter((b) => nn(b.EAN));
  const ebookTotals = new Map<string, number>();
  for (const b of books) {
    const eb = nn(b.EBOOK_ISBN);
    const units = ebookByEan.get(String(b.EAN));
    if (eb && units !== undefined) ebookTotals.set(eb, (ebookTotals.get(eb) ?? 0) + units);
  }

  const npd = new Map<string, { year: number; date: string; ytd: number }[]>();
  for (const r of src.BIL_BOOKSCAN_NPD ?? []) {
    const list = npd.get(String(r.ISBN)) ?? [];
    list.push({ year: Number(String(r.DATE).slice(0, 4)), date: String(r.DATE), ytd: n(r.YTD) });
    npd.set(String(r.ISBN), list);
  }
  const top100 = new Map<string, number>();
  for (const r of src.BIL_BOOKSCAN_NPD_TOP100 ?? []) top100.set(String(r.ISBN), (top100.get(String(r.ISBN)) ?? 0) + n(r.LTD_2022));

  return books.map((b) => {
    const ean = String(b.EAN).trim();
    const rows = npd.get(ean) ?? [];
    const maxByYear = new Map<number, string>();
    for (const r of rows) if ((maxByYear.get(r.year) ?? "") < r.date) maxByYear.set(r.year, r.date);
    const yearEnd = rows.filter((r) => maxByYear.get(r.year) === r.date).reduce((s, r) => s + r.ytd, 0);
    const hasBookscan = rows.length > 0 || top100.has(ean);
    const eb = nn(b.EBOOK_ISBN);
    return {
      ISBN: ean,
      LTD_GROSS_UNITS: gross.has(ean) ? Math.round(gross.get(ean)!) : null,
      BOOKSCAN_LTD: Math.round(yearEnd + (top100.get(ean) ?? 0)),
      HAS_BOOKSCAN: hasBookscan,
      EBOOK_UNITS: eb && ebookTotals.has(eb) ? Math.round(ebookTotals.get(eb)!) : null,
    };
  });
}

export function deriveAccounts(src: SourceTables): Row[] {
  const out = new Map<string, Row>();
  const add = (r: Row) => out.set(JSON.stringify(Object.values(r)), r);
  for (const c of src.BIL_CUSTOMERS ?? []) {
    add({
      DISTRIBUTION_CHANNEL: c.DISTRIBUTION_CHANNEL ?? null,
      DISTRIBUTION_CHANNEL_NAME: c.DISTRIBUTION_CHANNEL_NAME ?? null,
      ORGANIZATION_ID: c.ORGANIZATION_ID ?? null,
      ORG_NAME: c.ORG_NAME ?? null,
      ACCOUNT_NBR: c.ACCOUNT_NBR ?? null,
      ACCOUNT_NAME: c.ACCOUNT_NAME ?? null,
    });
  }
  for (const c of src.BIL_READERLINK_CHAIN ?? []) {
    if (c.ORGANIZATION_ID !== "90001368") continue;
    add({
      DISTRIBUTION_CHANNEL: c.DISTRIBUTION_CHANNEL ?? null,
      DISTRIBUTION_CHANNEL_NAME: c.DISTRIBUTION_CHANNEL_NAME ?? null,
      ORGANIZATION_ID: c.ORGANIZATION_ID ?? null,
      ORG_NAME: c.ORG_NAME ?? null,
      ACCOUNT_NBR: c.CHAIN_ID ?? null,
      ACCOUNT_NAME: c.MASTER_CHAIN ?? null,
    });
  }
  return [...out.values()];
}
