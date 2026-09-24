import { NOT_YOURS, canSeeTitle, titleScopeFilter } from "../auth/scope";
import type { Session } from "../auth/session";
import type { EstimateDoc, TitleAccountFactDoc, TitleDoc } from "@seg/data";
import type { AccountFact, CompAccountFact } from "@seg/domain";
import { collections } from "../db";
import { HttpError } from "../http";
import { getSettings } from "./settings";

/** One row of the summary page. Kept small: the whole in-scope catalog is sent at once. */
export interface TitleSummaryRow {
  isbn: string;
  title: string;
  author: string | null;
  season: string | null;
  seasonSort: number;
  division: string | null;
  imprint: string | null;
  format: string | null;
  usPrice: number | null;
  pubDate: string | null;
  releaseDate: string | null;
  paperCutOff: string | null;
  ldc: string | null;
  totals: TitleDoc["totals"];
  compIsbn: string | null;
  updatedAt: string | null;
}

export async function getSummary(who?: Pick<Session, "role" | "scope">): Promise<TitleSummaryRow[]> {
  const titles = await collections.titles();
  const docs = await titles
    .find(
      { inScope: true, ...titleScopeFilter(who) },
      {
        projection: {
          _id: 0, isbn: 1, title: 1, author: 1, season: 1, seasonSort: 1, division: 1, imprint: 1, format: 1,
          usPrice: 1, pubDate: 1, releaseDate: 1, paperCutOff: 1, ldc: 1, totals: 1, "plan.compIsbn": 1, "plan.updatedAt": 1,
        },
      },
    )
    .sort({ seasonSort: 1, isbn: 1 })
    .toArray();
  return docs.map((d) => ({
    isbn: d.isbn,
    title: d.title,
    author: d.author,
    season: d.season,
    seasonSort: d.seasonSort,
    division: d.division,
    imprint: d.imprint,
    format: d.format,
    usPrice: d.usPrice,
    pubDate: d.pubDate,
    releaseDate: d.releaseDate,
    paperCutOff: d.paperCutOff,
    ldc: d.ldc,
    totals: d.totals,
    compIsbn: d.plan?.compIsbn ?? null,
    updatedAt: d.plan?.updatedAt ?? null,
  }));
}

export type TitleInfo = Omit<TitleDoc, "_id" | "search">;

export interface TitleDetail {
  title: TitleInfo;
  comp: TitleInfo | null;
  facts: AccountFact[];
  compFacts: CompAccountFact[] | null;
  estimates: EstimateDoc[];
  /** Names of the catalog's competitive titles (unknown ISBNs are left out). */
  competitive: { isbn: string; title: string }[];
}

const ref = (d: TitleAccountFactDoc) => ({
  channelId: d.channelId,
  channelName: d.channelName,
  orgId: d.orgId,
  orgName: d.orgName,
  accountId: d.accountId,
  accountName: d.accountName,
});

/** Drops the Mongo _id (the ISBN is already in the document). */
function withoutId<T extends { _id: unknown }>(doc: T): Omit<T, "_id"> {
  const copy: Partial<T> = { ...doc };
  delete copy._id;
  return copy as Omit<T, "_id">;
}

const factProjection = { _id: 0, isbn: 0 } as const;

export async function getTitleDetail(isbn: string, who?: Pick<Session, "role" | "scope">): Promise<TitleDetail> {
  const [titles, facts, estimates] = await Promise.all([collections.titles(), collections.facts(), collections.estimates()]);
  const title = await titles.findOne({ _id: isbn }, { projection: { search: 0 } });
  if (!title) throw new HttpError(404, `Title ${isbn} was not found.`);
  // The comparable title's figures stay visible: they are part of planning this title.
  if (!canSeeTitle(who, title)) throw new HttpError(403, NOT_YOURS);
  const compIsbn = title.plan?.compIsbn ?? null;

  const [ownFacts, comp, compFacts, estimateDocs, competitive] = await Promise.all([
    facts.find({ isbn, inTitleList: true }, { projection: factProjection }).toArray(),
    compIsbn ? titles.findOne({ _id: compIsbn }, { projection: { search: 0 } }) : null,
    compIsbn ? facts.find({ isbn: compIsbn, inCompList: true }, { projection: factProjection }).toArray() : null,
    estimates.find({ isbn }).toArray(),
    title.competitiveTitles.length
      ? titles.find({ _id: { $in: title.competitiveTitles } }, { projection: { _id: 0, isbn: 1, title: 1 } }).toArray()
      : [],
  ]);

  const titleInfo = withoutId(title);
  const compInfo = comp ? withoutId(comp) : null;
  return {
    title: titleInfo,
    comp: compInfo,
    facts: ownFacts.map((f) => ({ ...ref(f), initialOrder: f.initialOrder })),
    compFacts: compFacts
      ? compFacts.map((f) => ({ ...ref(f), initialOrder: f.initialOrder, grossUnits: f.grossUnits, netUnits: f.netUnits, readerlinkPos: f.readerlinkPos }))
      : null,
    estimates: estimateDocs,
    competitive,
  };
}

/** Most titles one batch request may ask for (keeps responses well under the platform payload limit). */
export const MAX_BATCH_TITLES = 60;

/**
 * Details for many titles in four queries (exports, uploads, reports).
 * `missing` lists requested ISBNs that are not in the catalog.
 */
export async function getTitleDetails(isbns: string[], who?: Pick<Session, "role" | "scope">): Promise<{ titles: TitleDetail[]; missing: string[] }> {
  const wanted = [...new Set(isbns)];
  const [titlesCol, factsCol, estimatesCol] = await Promise.all([collections.titles(), collections.facts(), collections.estimates()]);
  // Titles outside the person's access are reported as missing.
  const titleDocs = await titlesCol.find({ _id: { $in: wanted }, ...titleScopeFilter(who) }, { projection: { search: 0 } }).toArray();
  const byIsbn = new Map(titleDocs.map((t) => [t._id, t]));
  const compIsbns = [...new Set(titleDocs.map((t) => t.plan?.compIsbn).filter((c): c is string => !!c))];

  const [compDocs, factDocs, estimateDocs] = await Promise.all([
    compIsbns.length ? titlesCol.find({ _id: { $in: compIsbns } }, { projection: { search: 0 } }).toArray() : [],
    factsCol
      .find({ $or: [{ isbn: { $in: titleDocs.map((t) => t._id) }, inTitleList: true }, { isbn: { $in: compIsbns }, inCompList: true }] })
      .toArray(),
    estimatesCol.find({ isbn: { $in: titleDocs.map((t) => t._id) } }).toArray(),
  ]);
  const compByIsbn = new Map(compDocs.map((t) => [t._id, t]));
  const own = new Map<string, TitleAccountFactDoc[]>();
  const asComp = new Map<string, TitleAccountFactDoc[]>();
  for (const f of factDocs) {
    if (f.inTitleList && byIsbn.has(f.isbn)) push(own, f.isbn, f);
    if (f.inCompList && compByIsbn.has(f.isbn)) push(asComp, f.isbn, f);
  }
  const estimates = new Map<string, EstimateDoc[]>();
  for (const e of estimateDocs) push(estimates, e.isbn, e);

  const titles: TitleDetail[] = [];
  for (const isbn of wanted) {
    const title = byIsbn.get(isbn);
    if (!title) continue;
    const compIsbn = title.plan?.compIsbn ?? null;
    const comp = compIsbn ? compByIsbn.get(compIsbn) : undefined;
    titles.push({
      title: withoutId(title),
      comp: comp ? withoutId(comp) : null,
      facts: (own.get(isbn) ?? []).map((f) => ({ ...ref(f), initialOrder: f.initialOrder })),
      compFacts: comp
        ? (asComp.get(comp._id) ?? []).map((f) => ({ ...ref(f), initialOrder: f.initialOrder, grossUnits: f.grossUnits, netUnits: f.netUnits, readerlinkPos: f.readerlinkPos }))
        : null,
      estimates: estimates.get(isbn) ?? [],
      competitive: [],
    });
  }
  return { titles, missing: wanted.filter((i) => !byIsbn.has(i)) };
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export interface TitleSearchHit {
  isbn: string;
  title: string;
  author: string | null;
  season: string | null;
  format: string | null;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Any catalog title (including backlist) — used to pick comparable titles and for global search. */
export async function searchTitles(query: string, limit = 20, who?: Pick<Session, "role" | "scope">): Promise<TitleSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const titles = await collections.titles();
  const rules = (await getSettings()).rules;
  const words = rules.compExcludedFormatWords.map(escapeRegex).join("|");
  const docs = await titles
    .find(
      {
        search: { $regex: escapeRegex(q) },
        ...titleScopeFilter(who),
        ...(rules.compExcludedIpmFormats.length ? { ipmFormat: { $nin: rules.compExcludedIpmFormats } } : {}),
        ...(words ? { format: { $not: new RegExp(words, "i") } } : {}),
      },
      { projection: { _id: 0, isbn: 1, title: 1, author: 1, season: 1, format: 1 } },
    )
    .limit(limit)
    .toArray();
  return docs;
}
