"use client";

import {
  ALL_ACCOUNTS,
  SHEET_COLUMNS,
  TOTAL_ACCOUNTS,
  accountKey,
  clean,
  estimateId,
  missingUploadColumns,
  planUpload,
  type AccountRef,
  type EstimateField,
  type EstimateRecord,
  type Level,
  type UploadIssue,
  type UploadRow,
} from "@seg/domain";
import { api } from "@/lib/api";
import { fetchTitleDetails } from "@/lib/batch";
import { readWorkbook } from "@/lib/sheets";

export interface PreviewChange {
  isbn: string;
  title: string;
  level: Level;
  ref: AccountRef;
  field: EstimateField;
  before: number | string | null;
  after: number | string | null;
}

export interface UploadPreview {
  fileName: string;
  sheets: number;
  rows: number;
  changes: PreviewChange[];
  titles: number;
  changedRows: number;
  unchangedRows: number;
  errors: UploadIssue[];
}

export type Stage = { step: "reading" } | { step: "loading"; done: number; total: number } | { step: "checking" };

const FIELD_ORDER: EstimateField[] = ["laydownGoal", "laydownEstimate", "sixMonthEstimate", "salesNotes"];
const MARKERS = new Set([TOTAL_ACCOUNTS, ALL_ACCOUNTS].map((m) => m.toLowerCase()));

/** Reads a file and works out every change it would make — nothing is saved here. */
export async function previewUpload(file: File, onStage: (s: Stage) => void): Promise<UploadPreview> {
  onStage({ step: "reading" });
  const book = await readWorkbook(file);
  const errors: UploadIssue[] = [];
  const rows: UploadRow[] = [];
  for (const sheet of book.sheets) {
    if (!sheet.rows.length) continue;
    const missing = missingUploadColumns(sheet.headers);
    if (missing.length) {
      errors.push({
        sheet: sheet.name,
        rowNumber: 1,
        isbn: null,
        message: `Sheet skipped: missing column${missing.length > 1 ? "s" : ""} ${missing.map((m) => `"${m}"`).join(", ")}. Use the account-details export as the template.`,
      });
      continue;
    }
    rows.push(...sheet.rows);
  }
  if (!rows.length) {
    return { fileName: file.name, sheets: book.sheets.length, rows: 0, changes: [], titles: 0, changedRows: 0, unchangedRows: 0, errors };
  }

  const isbns = [...new Set(rows.map((r) => clean(r.cells[SHEET_COLUMNS.isbn])).filter((i): i is string => !!i))];
  const { titles } = await fetchTitleDetails(isbns, (done, total) => onStage({ step: "loading", done, total }));
  onStage({ step: "checking" });

  const titleNames = new Map<string, string>();
  const existing = new Map<string, EstimateRecord>();
  const keysByIsbn = new Map<string, Set<string>>();
  for (const d of titles) {
    const isbn = d.title.isbn;
    titleNames.set(isbn, d.title.title);
    const keys = new Set<string>();
    for (const f of d.facts) keys.add(accountKey(f));
    for (const f of d.compFacts ?? []) keys.add(accountKey(f));
    for (const e of d.estimates) {
      existing.set(e._id, e as EstimateRecord);
      if (e.level === "account") keys.add(accountKey(e));
    }
    keysByIsbn.set(isbn, keys);
  }

  // Account rows may name accounts that aren't on the title yet: look those combinations up once.
  const reference = await resolveReferenceAccounts(rows);

  const plan = planUpload(rows, {
    knownIsbns: new Set(titleNames.keys()),
    existingEstimates: existing,
    titleAccountKeys: (isbn) => keysByIsbn.get(isbn) ?? new Set(),
    findReferenceAccount: (channelId, orgId, accountId) => reference.get(refKey(channelId, orgId, accountId)) ?? null,
  });

  const changes: PreviewChange[] = [];
  for (const c of plan.changes) {
    const before = existing.get(estimateId(c.isbn, c.level, c.ref));
    for (const field of FIELD_ORDER) {
      if (!(field in c.set)) continue;
      changes.push({
        isbn: c.isbn,
        title: titleNames.get(c.isbn) ?? c.isbn,
        level: c.level,
        ref: c.ref,
        field,
        before: before ? (before[field] ?? null) : null,
        after: c.set[field] ?? null,
      });
    }
  }

  return {
    fileName: file.name,
    sheets: book.sheets.length,
    rows: rows.length,
    changes,
    titles: plan.isbns.length,
    changedRows: plan.changedRows,
    unchangedRows: plan.unchangedRows,
    errors: [...errors, ...plan.errors],
  };
}

const refKey = (channelId: string | null, orgId: string | null, accountId: string | null) => `${channelId}|${orgId}|${accountId}`;

async function resolveReferenceAccounts(rows: UploadRow[]): Promise<Map<string, AccountRef>> {
  const wanted = new Map<string, { channelId: string; orgId: string; accountId: string }>();
  for (const r of rows) {
    const channelId = clean(r.cells[SHEET_COLUMNS.channelId]);
    const orgId = clean(r.cells[SHEET_COLUMNS.orgId]);
    const accountId = clean(r.cells[SHEET_COLUMNS.accountId]);
    if (!channelId || !orgId || !accountId || MARKERS.has(accountId.toLowerCase())) continue;
    wanted.set(refKey(channelId, orgId, accountId), { channelId, orgId, accountId });
  }
  const keys = [...wanted.values()];
  const found = new Map<string, AccountRef>();
  for (let i = 0; i < keys.length; i += 2000) {
    const { accounts } = await api<{ accounts: AccountRef[] }>("/api/accounts/resolve", {
      method: "POST",
      json: { keys: keys.slice(i, i + 2000) },
    });
    for (const a of accounts) found.set(refKey(a.channelId, a.orgId, a.accountId), a);
  }
  return found;
}

/** Per save request: small enough to finish well inside the function time limit (and the API's 3,000 cap). */
const TITLES_PER_REQUEST = 20;
const CHANGES_PER_REQUEST = 2500;

/** Saves the previewed changes in batches of whole titles, reporting progress in changes. */
export async function applyUpload(
  changes: PreviewChange[],
  onProgress: (done: number, total: number) => void,
): Promise<{ changed: number; failed: { isbn: string; error: string }[] }> {
  const sorted = [...changes].sort((a, b) => a.isbn.localeCompare(b.isbn));
  const batches: PreviewChange[][] = [];
  let current: PreviewChange[] = [];
  let titles = new Set<string>();
  for (const c of sorted) {
    const newTitle = !titles.has(c.isbn);
    if (current.length >= CHANGES_PER_REQUEST || (newTitle && titles.size >= TITLES_PER_REQUEST)) {
      batches.push(current);
      current = [];
      titles = new Set();
    }
    current.push(c);
    titles.add(c.isbn);
  }
  if (current.length) batches.push(current);

  let changed = 0;
  let done = 0;
  const failed: { isbn: string; error: string }[] = [];
  onProgress(0, sorted.length);
  for (const batch of batches) {
    const res = await api<{ changed: number; failed: { isbn: string; error: string }[] }>("/api/estimates/bulk", {
      method: "POST",
      json: { changes: batch.map((c) => ({ isbn: c.isbn, level: c.level, ref: c.ref, field: c.field, value: c.after })) },
    });
    changed += res.changed;
    failed.push(...res.failed);
    done += batch.length;
    onProgress(done, sorted.length);
  }
  return { changed, failed };
}
