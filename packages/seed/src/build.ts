/**
 * Builds the demo dataset in memory: source tables in the legacy BigQuery layout, plus
 * app-owned seed data (estimates, title plans, users).
 *
 * The data deliberately covers every rule the app implements — see docs/demo-data.md.
 */
import { refForLevel, type AccountRef, type EstimateRecord, type Level } from "@seg/domain";
import {
  CHANNELS,
  CITIES,
  DIVISIONS,
  FORMAT_LABEL,
  ORG_FIRST,
  ORG_SUFFIX,
  READERLINK_CHAINS,
  SALES_NOTES,
  TITLE_NOTES,
  personName,
  titleName,
} from "./names";
import { Rng, addDays, ean13, isoDate, legacyDateTime, yyyymmdd } from "./random";

export type Row = Record<string, string | number | boolean | null>;
export type SourceTables = Record<string, Row[]>;

export interface SeedPlan {
  isbn: string;
  compIsbn: string | null;
  titleNotes: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SeedUser {
  email: string;
  name: string;
  role: "admin" | "editor" | "viewer";
}

export interface DemoDataset {
  asOf: string;
  source: SourceTables;
  estimates: EstimateRecord[];
  plans: SeedPlan[];
  users: SeedUser[];
}

export const DEMO_USERS: SeedUser[] = [
  { email: "admin@seg-demo.com", name: "Alex Morgan", role: "admin" },
  { email: "editor@seg-demo.com", name: "Jordan Lee", role: "editor" },
  { email: "viewer@seg-demo.com", name: "Sam Rivera", role: "viewer" },
];

const READERLINK_ORG = { id: "90001368", name: "ReaderLink Distribution" };

interface Account extends AccountRef {
  stores: string[];
  weight: number;
}

interface Title {
  ean: string;
  division: (typeof DIVISIONS)[number];
  season: string;
  seasonYear: number;
  pub: Date;
  ipmFormat: string;
  demand: number;
  published: boolean;
  inScopeCandidate: boolean;
  ebookEan: string | null;
}

export function buildDataset(options: { asOf: Date; seed?: number }): DemoDataset {
  const rng = new Rng(options.seed ?? 20260923);
  const asOf = new Date(Date.UTC(options.asOf.getUTCFullYear(), options.asOf.getUTCMonth(), options.asOf.getUTCDate()));
  const asOfIso = isoDate(asOf);
  const source: SourceTables = {
    BIL_BOOKATTRIBUTES: [],
    BIL_CUSTOMERS: [],
    BIL_MF_FACT_SALES: [],
    DIL_HBG_ORDERS: [],
    DTL_HBG_FINAL: [],
    BIL_READERLINK_CHAIN: [],
    BIL_READERLINK_POS: [],
    BIL_BOOKSCAN_NPD: [],
    BIL_BOOKSCAN_NPD_TOP100: [],
    BIL_SEG_POPULAR_ACCOUNTS: [],
  };

  // ---------------------------------------------------------------- customers
  let orgSeq = 10_000_100;
  let accountSeq = 400_100;
  const accounts: Account[] = [];
  const usedOrgNames = new Set<string>();

  const addAccount = (ref: AccountRef, storeCount: number, weight: number) => {
    const stores: string[] = [];
    for (let s = 0; s < storeCount; s++) {
      const storeId = `${ref.accountId}_${String(rng.int(1, 99_999)).padStart(5, "0")}`;
      stores.push(storeId);
      source.BIL_CUSTOMERS!.push({
        STORE_ID: storeId,
        DISTRIBUTION_CHANNEL: ref.channelId ?? "",
        DISTRIBUTION_CHANNEL_NAME: ref.channelName ?? "",
        ORGANIZATION_ID: ref.orgId ?? "",
        ORG_NAME: ref.orgName ?? "",
        ACCOUNT_NBR: ref.accountId,
        ACCOUNT_NAME: ref.accountName,
        STORE_NAME: `${ref.accountName} #${s + 1}`,
        CLIENT_SALES_REP: `REP${rng.int(10, 40)}`,
      });
    }
    const account = { ...ref, stores, weight };
    accounts.push(account);
    return account;
  };

  for (const ch of CHANNELS) {
    for (let o = 0; o < ch.orgs; o++) {
      let orgName: string;
      do orgName = `${rng.pick(ORG_FIRST)} ${rng.pick(ORG_SUFFIX[ch.id]!)}`;
      while (usedOrgNames.has(orgName));
      usedOrgNames.add(orgName);
      const orgId = String(orgSeq++);
      const n = rng.int(ch.accounts[0], ch.accounts[1]);
      const cities = rng.sample(CITIES, n);
      for (let a = 0; a < n; a++) {
        const accountName = n === 1 ? orgName : `${orgName} - ${cities[a] ?? `Store ${a + 1}`}`;
        addAccount(
          { channelId: ch.id, channelName: ch.name, orgId, orgName, accountId: String(accountSeq++), accountName },
          rng.int(1, ch.id === "RETINDEP" ? 1 : 4),
          ch.weight * rng.skewed(1, 1),
        );
      }
    }
  }

  // Edge cases: accounts with no channel ("Not Defined"), an account with no organization,
  // and one account number reused under a different name (id + name identity rule).
  for (let i = 0; i < 3; i++) {
    addAccount(
      { channelId: null, channelName: null, orgId: String(orgSeq), orgName: "Unassigned Customers", accountId: String(accountSeq++), accountName: `Legacy Account ${i + 1}` },
      1,
      1,
    );
  }
  orgSeq++;
  addAccount({ channelId: "SMIND", channelName: "Special Markets", orgId: null, orgName: null, accountId: String(accountSeq++), accountName: "Corporate Gift Program" }, 1, 2);
  const renamed = accounts.find((a) => a.channelId === "RETINDEP")!;
  addAccount({ ...renamed, accountName: `${renamed.accountName} (Annex)` }, 1, renamed.weight);

  // ReaderLink chains live only in the chain table (legacy placeholder rows use them).
  const rlChains = READERLINK_CHAINS.map((name, i) => {
    const row = {
      MASTER_CHAIN: name,
      CHAIN_ID: String(700_000 + i * 7),
      ORGANIZATION_ID: READERLINK_ORG.id,
      ORG_NAME: READERLINK_ORG.name,
      DISTRIBUTION_CHANNEL: "MASSMER",
      DISTRIBUTION_CHANNEL_NAME: "Mass Merchandise",
    };
    source.BIL_READERLINK_CHAIN!.push(row);
    return row;
  });

  // Popular accounts get a zero row on every current title.
  for (const acc of rng.sample(accounts.filter((a) => a.channelId && a.orgId), 14)) {
    source.BIL_SEG_POPULAR_ACCOUNTS!.push({
      DISTRIBUTION_CHANNEL: acc.channelId,
      DISTRIBUTION_CHANNEL_NAME: acc.channelName,
      ORGANIZATION_ID: acc.orgId,
      ORG_NAME: acc.orgName,
      ACCOUNT_NBR: acc.accountId,
      ACCOUNT_NAME: acc.accountName,
    });
  }

  // ---------------------------------------------------------------- catalog
  let eanSeq = 0;
  const nextEan = () => ean13(`9781955${String(eanSeq++).padStart(5, "0")}`);
  const titles: Title[] = [];
  const usedTitleNames = new Set<string>();

  const seasonPub = (name: string, year: number) => {
    const start = name === "Spring" ? Date.UTC(year, 0, 13) : name === "Fall" ? Date.UTC(year, 7, 4) : Date.UTC(year, 5, 2);
    const d = new Date(start + rng.int(0, 16) * 7 * 86_400_000);
    return addDays(d, (9 - d.getUTCDay()) % 7); // Tuesday on-sale
  };

  const addTitle = (season: string, opts: { ipmFormat?: string; format?: string; imprint?: string | null; ebook?: boolean; inScopeCandidate?: boolean } = {}) => {
    const [seasonName, yearText] = season.split(" ") as [string, string];
    const seasonYear = Number(yearText);
    const division = rng.weighted(DIVISIONS, (d) => d.share);
    const ipmFormat = opts.ipmFormat ?? rng.pick(division.formats);
    const pub = seasonPub(seasonName, seasonYear);
    let name: string;
    do name = titleName((a) => rng.pick(a));
    while (usedTitleNames.has(name));
    usedTitleNames.add(name);

    const ean = nextEan();
    const hasEbook = opts.ebook ?? (ipmFormat !== "BB" && rng.chance(0.45));
    const ebookEan = hasEbook ? nextEan() : null;
    const price = ipmFormat === "BB" ? rng.pick([8.99, 9.99, 12.99]) : ipmFormat === "PB" ? rng.pick([14.99, 16.99, 18.99, 19.99, 24.99]) : rng.pick([19.99, 24.99, 29.99, 35, 40, 45]);
    const demand = Math.round(rng.skewed(ipmFormat === "BB" ? 2500 : 3500, 1.2));
    const paperCutOff = rng.chance(0.9) ? addDays(pub, -rng.int(150, 210)) : null;
    const ldc = rng.chance(0.88) ? addDays(pub, -rng.int(80, 120)) : null;
    const printRun = Math.round((demand * rng.int(12, 25)) / 10 / 500) * 500;
    const comps = rng.chance(0.35) && titles.length > 5 ? rng.sample(titles, rng.int(1, 3)).map((t) => t.ean) : [];

    source.BIL_BOOKATTRIBUTES!.push({
      EAN: ean,
      ISBN: ean.slice(3, 12),
      EBOOK_ISBN: ebookEan,
      FULL_TITLE: name,
      AUTHOR_1: personName((a) => rng.pick(a)),
      SEASON: season,
      GROUP_1: division.name,
      TESTIMPRINTFROMHNA: opts.imprint === undefined ? rng.pick(division.imprints) : opts.imprint,
      FORMAT: opts.format ?? rng.pick(FORMAT_LABEL[ipmFormat] ?? ["Hardcover"]),
      IPM_FORMAT: ipmFormat,
      US_PRICE: price,
      PUB_DATE: isoDate(pub),
      RELEASE_DATE: isoDate(addDays(pub, -rng.int(7, 14))),
      PAPER_CUT_OFF: paperCutOff ? legacyDateTime(paperCutOff) : null,
      LDC: ldc ? legacyDateTime(ldc) : null,
      PAGES: ipmFormat === "BB" ? rng.pick([12, 16, 20, 24]) : rng.int(6, 50) * 8,
      TRIMWIDTH: ipmFormat === "BB" ? "6" : rng.pick(["6", "7", "8", "9", "10"]),
      TRIMLENGTH: ipmFormat === "BB" ? "6" : rng.pick(["8", "9", "10", "11", "12"]),
      PRINT_RUN: String(Math.max(2000, printRun)),
      ANNOUNCED_1ST_PRINTING__BEST: rng.chance(0.7) ? String(Math.max(2000, printRun - 500 * rng.int(0, 4))) : " ",
      COMPETITIVE_TITLES: comps.join(","),
    });
    if (ebookEan) {
      const print = source.BIL_BOOKATTRIBUTES!.at(-1)!;
      source.BIL_BOOKATTRIBUTES!.push({ ...print, EAN: ebookEan, ISBN: ebookEan.slice(3, 12), EBOOK_ISBN: ebookEan, IPM_FORMAT: "EB", FORMAT: "eBook", US_PRICE: Math.round((price * 0.6) * 100) / 100, COMPETITIVE_TITLES: "" });
    }
    const t: Title = { ean, division, season, seasonYear, pub, ipmFormat, demand, published: pub < asOf, inScopeCandidate: opts.inScopeCandidate ?? true, ebookEan };
    titles.push(t);
    return t;
  };

  // Backlist (possible comparable titles, not shown on the summary page).
  for (const year of [2021, 2022, 2023, 2024]) for (const s of ["Spring", "Fall"]) for (let i = 0; i < 20; i++) addTitle(`${s} ${year}`, { inScopeCandidate: false });
  // Current and upcoming seasons (the summary page).
  for (const year of [2025, 2026, 2027]) for (const s of ["Spring", "Fall"]) for (let i = 0; i < 95; i++) addTitle(`${s} ${year}`);
  // Titles the scope rules must exclude.
  const excluded = [
    addTitle("Fall 2026", { format: "ARC", inScopeCandidate: false }),
    addTitle("Fall 2026", { format: "Catalog", inScopeCandidate: false }),
    addTitle("Spring 2026", { format: "Floor Display (12-copy)", inScopeCandidate: false }),
    addTitle("Fall 2026", { imprint: " ", inScopeCandidate: false }),
    addTitle("Summer 2026", { inScopeCandidate: false }),
    addTitle("Fall 2024", { inScopeCandidate: false }),
  ];
  void excluded;

  // ---------------------------------------------------------------- activity
  const fileDate = `${asOfIso}T06:00:00Z`;
  let refSeq = 5_000_000;
  const orderRow = (store: string, isbn: string, entry: Date, qty: number, status = "OPEN", cancel = "") =>
    source.DIL_HBG_ORDERS!.push({
      ACCOUNT_STORE: store.replace("_", ""),
      ENTRY_DATE: yyyymmdd(entry),
      ISBN: isbn,
      QUANTITY: String(qty),
      LINE_STATUS: status,
      CANCEL_DATE: cancel,
      REFERENCE_NBR: String(refSeq++),
      FILEDATE: fileDate,
    });
  const saleRow = (store: string, isbn: string, date: Date, units: number, indicator: "Gross Sales" | "Net Sales", salesType = "Print") =>
    source.BIL_MF_FACT_SALES!.push({
      STORE_ID: store,
      EXACT_DATE: isoDate(date),
      EISBN: isbn,
      UNITS: units,
      SALES_INDICATOR: indicator,
      DATA_TYPE: "Sales",
      SALES_TYPE: salesType,
      SYSTEM_OF_ORIGIN: "HBG",
    });

  const onlineStores = accounts.filter((a) => a.channelId === "ONLRET").flatMap((a) => a.stores);

  for (const t of titles) {
    const accountCount = Math.min(accounts.length, Math.round(20 + Math.min(110, t.demand / 90) + rng.int(0, 25)));
    const chosen = new Set<Account>();
    while (chosen.size < accountCount) chosen.add(rng.weighted(accounts, (a) => a.weight));
    const list = [...chosen];
    const totalWeight = list.reduce((s, a) => s + a.weight, 0);

    for (const acc of list) {
      const qty = Math.max(1, Math.round((t.demand * acc.weight) / totalWeight * (0.6 + rng.next() * 0.8)));
      const store = rng.pick(acc.stores);
      const entry = addDays(t.pub, -rng.int(45, 330));
      const ship = addDays(t.pub, -rng.int(7, 21));

      if (entry > asOf) continue; // not ordered yet
      if (ship < asOf) {
        // Shipped before on-sale: counts as initial order through the sales facts.
        saleRow(store, t.ean, ship, qty, "Gross Sales");
        saleRow(store, t.ean, ship, qty, "Net Sales");
        // Some shipped orders still sit in the order file but are already invoiced (must not double count).
        if (rng.chance(0.3)) {
          orderRow(store, t.ean, entry, qty);
          source.DTL_HBG_FINAL!.push({ EISBN: t.ean, STORE_ID: store });
        }
      } else {
        // Still open: counts as initial order through the order file.
        const roll = rng.next();
        if (roll < 0.06) orderRow(store, t.ean, entry, qty, "DELETED");
        else if (roll < 0.1) orderRow(store, t.ean, entry, qty, "OPEN", yyyymmdd(addDays(asOf, -rng.int(3, 40))));
        else if (roll < 0.2) orderRow(store, t.ean, entry, qty, "OPEN", yyyymmdd(addDays(t.pub, rng.int(30, 90))));
        else orderRow(store, t.ean, entry, qty);
      }

      // After on-sale: reorders and returns, at a few points in time up to today.
      if (t.published) {
        const checkpoints = [30, 60, 90, 180, 270, 365, 540, 730].map((d) => addDays(t.pub, d)).filter((d) => d < asOf);
        let sold = qty;
        for (const cp of checkpoints) {
          const reorder = Math.round(qty * rng.next() * 0.5);
          if (reorder <= 0) continue;
          sold += reorder;
          const returns = Math.round(reorder * rng.next() * 0.3);
          saleRow(store, t.ean, cp, reorder, "Gross Sales");
          saleRow(store, t.ean, cp, reorder - returns, "Net Sales");
        }
        void sold;
      }
    }

    // eBook sales are recorded against the print EAN with SALES_TYPE = ESales (legacy query).
    if (t.ebookEan && t.published && onlineStores.length) {
      for (const d of [14, 90, 200].map((x) => addDays(t.pub, x)).filter((x) => x < asOf)) {
        saleRow(rng.pick(onlineStores), t.ean, d, Math.round(t.demand * 0.05 * rng.next()), "Gross Sales", "ESales");
      }
    }

    if (t.published) {
      // ReaderLink point-of-sale for some chains.
      for (const chain of rng.sample(rlChains, rng.int(0, 6))) {
        source.BIL_READERLINK_POS!.push({ MASTER_CHAIN: chain.MASTER_CHAIN, ITEM_NUMBER: t.ean, UNITS: String(rng.int(5, Math.max(10, Math.round(t.demand / 30)))) });
      }
      // BookScan: year-to-date snapshots per year.
      if (rng.chance(0.7)) {
        for (let y = t.pub.getUTCFullYear(); y <= asOf.getUTCFullYear(); y++) {
          let ytd = 0;
          for (const month of [3, 6, 9, 12]) {
            const d = new Date(Date.UTC(y, month - 1, 28));
            if (d < t.pub || d > asOf) continue;
            ytd += Math.round(t.demand * 0.15 * rng.next());
            source.BIL_BOOKSCAN_NPD!.push({ ISBN: t.ean, DATE: yyyymmdd(d), YTD: String(ytd) });
          }
        }
      }
      if (t.seasonYear <= 2022 && rng.chance(0.25)) {
        source.BIL_BOOKSCAN_NPD_TOP100!.push({ ISBN: t.ean, DATE: "20221231", LTD_2022: String(Math.round(t.demand * rng.next())) });
      }
    }
  }

  // ---------------------------------------------------------------- app seed data
  const estimates: EstimateRecord[] = [];
  const plans: SeedPlan[] = [];
  const editors = DEMO_USERS.filter((u) => u.role !== "viewer").map((u) => u.email);
  const stamp = () => ({
    updatedAt: addDays(asOf, -rng.int(0, 60)).toISOString(),
    updatedBy: rng.pick(editors),
  });
  const backlist = titles.filter((t) => !t.inScopeCandidate && t.seasonYear <= 2024);
  const published = titles.filter((t) => t.published);

  // Per title: which accounts have pre-pub activity (approximation used only to pick realistic seed rows).
  const accountByStore = new Map(accounts.flatMap((a) => a.stores.map((s) => [s, a] as const)));
  const titleAccounts = new Map<string, Account[]>();
  for (const row of source.BIL_MF_FACT_SALES!) {
    const acc = accountByStore.get(String(row.STORE_ID));
    if (!acc) continue;
    const list = titleAccounts.get(String(row.EISBN)) ?? [];
    if (!list.includes(acc)) list.push(acc);
    titleAccounts.set(String(row.EISBN), list);
  }

  const push = (isbn: string, level: Level, ref: AccountRef, values: Partial<EstimateRecord>) =>
    estimates.push({
      isbn,
      level,
      ...refForLevel(level, ref),
      laydownGoal: null,
      laydownEstimate: null,
      sixMonthEstimate: null,
      salesNotes: "",
      ...stamp(),
      ...values,
    });

  const numbers = (base: number) => {
    const goal = Math.max(10, Math.round((base * (1.1 + rng.next() * 0.5)) / 10) * 10);
    const estimate = Math.max(10, Math.round((goal * (0.7 + rng.next() * 0.5)) / 10) * 10);
    return { laydownGoal: goal, laydownEstimate: estimate, sixMonthEstimate: Math.round((estimate * (1.4 + rng.next() * 0.8)) / 10) * 10 };
  };

  for (const t of titles.filter((x) => x.inScopeCandidate)) {
    if (!rng.chance(0.68)) continue;
    const accs = titleAccounts.get(t.ean) ?? rng.sample(accounts, 30);
    const perChannel = new Map<string, Account[]>();
    for (const a of accs) {
      const key = a.channelId ?? "";
      perChannel.set(key, [...(perChannel.get(key) ?? []), a]);
    }
    const allWeight = accs.reduce((s, a) => s + a.weight, 0) || 1;
    for (const [channel, list] of perChannel) {
      if (!channel) continue;
      // The channel's share of the title's demand.
      const base = Math.max(20, (t.demand * list.reduce((s, a) => s + a.weight, 0)) / allWeight);
      if (channel === "MASSMER" || channel === "RETINDEP") {
        // Account-level entry on account-level channels.
        const picked = rng.sample(list, Math.min(list.length, rng.int(3, 10)));
        for (const a of picked) {
          push(t.ean, "account", a, { ...numbers(base / list.length), salesNotes: rng.chance(0.25) ? rng.pick(SALES_NOTES) : "" });
        }
        // Sometimes an organization-level override on top of its accounts.
        if (rng.chance(0.3)) push(t.ean, "org", rng.pick(list), numbers(base / 3));
      } else if (channel === "NATCHAIN" || channel === "ONLRET") {
        const orgs = [...new Map(list.map((a) => [a.orgId, a])).values()];
        for (const a of rng.sample(orgs, Math.min(orgs.length, rng.int(1, 3)))) {
          push(t.ean, "org", a, { ...numbers(base / orgs.length), salesNotes: rng.chance(0.3) ? rng.pick(SALES_NOTES) : "" });
        }
      } else {
        // Channel total (as uploaded from a "Total Organizations" row).
        push(t.ean, "channel", list[0]!, { ...numbers(base), salesNotes: rng.chance(0.2) ? rng.pick(SALES_NOTES) : "" });
      }
    }
    // A channel-level override on a channel that also has lower-level values.
    if (rng.chance(0.15)) {
      const a = accs.find((x) => x.channelId === "MASSMER");
      if (a) push(t.ean, "channel", a, numbers(t.demand / 4));
    }
    // An organization estimate for an organization with no activity on this title.
    if (rng.chance(0.08)) {
      const idle = accounts.find((a) => a.channelId === "EDULIB" && !accs.includes(a));
      if (idle) push(t.ean, "org", idle, { laydownEstimate: rng.int(2, 30) * 10 });
    }
  }

  for (const t of titles.filter((x) => x.inScopeCandidate)) {
    const hasComp = rng.chance(0.55);
    const hasNotes = rng.chance(0.3);
    if (!hasComp && !hasNotes) continue;
    const pool = backlist.filter((b) => b.division.name === t.division.name);
    const comp = hasComp ? rng.pick(pool.length ? pool : published) : null;
    plans.push({ isbn: t.ean, compIsbn: comp?.ean ?? null, titleNotes: hasNotes ? rng.pick(TITLE_NOTES) : "", ...stamp() });
  }

  return { asOf: asOfIso, source, estimates, plans, users: DEMO_USERS };
}
