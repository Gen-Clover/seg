import { accountKey, clean, estimateId, normalizeAccount, refForLevel } from "./identity";
import { parseEstimateInput } from "./numbers";
import {
  ALL_ACCOUNTS,
  SHEET_COLUMNS,
  TOTAL_ACCOUNTS,
  TOTAL_ORGANIZATIONS,
  UPLOAD_REQUIRED_COLUMNS,
  type SheetColumnKey,
} from "./sheet";
import {
  ESTIMATE_NUMBER_FIELDS,
  type AccountRef,
  type EstimateRecord,
  type EstimateValues,
  type Level,
} from "./types";

/** One parsed spreadsheet row, keyed by header text, plus where it came from. */
export interface UploadRow {
  sheet: string;
  rowNumber: number;
  cells: Record<string, unknown>;
}

export interface UploadIssue {
  sheet: string;
  rowNumber: number;
  isbn: string | null;
  message: string;
}

export interface EstimateChange {
  id: string;
  isbn: string;
  level: Level;
  ref: AccountRef;
  /** Only the fields that change. Blank cells never appear here (blank = keep existing). */
  set: Partial<EstimateValues>;
}

export interface UploadPlan {
  changes: EstimateChange[];
  errors: UploadIssue[];
  unchangedRows: number;
  changedRows: number;
  isbns: string[];
}

export interface UploadContext {
  /** ISBNs that exist in the catalog. */
  knownIsbns: ReadonlySet<string>;
  /** Existing estimates, keyed by estimateId(). */
  existingEstimates: ReadonlyMap<string, EstimateRecord>;
  /** Account keys already present on a title's grid (facts, comp or estimates), per ISBN. */
  titleAccountKeys: (isbn: string) => ReadonlySet<string>;
  /** Looks up a valid channel/org/account combination in the reference accounts. */
  findReferenceAccount: (channelId: string | null, orgId: string | null, accountId: string | null) => AccountRef | null;
}

/** Returns the header texts missing from a sheet, or [] when the sheet is valid. */
export function missingUploadColumns(headers: readonly string[]): string[] {
  const present = new Set(headers.map((h) => h.trim()));
  return UPLOAD_REQUIRED_COLUMNS.map((k) => SHEET_COLUMNS[k]).filter((h) => !present.has(h));
}

const labelOf = (v: unknown) => String(v ?? "").trim().replace(/_/g, " ").toLowerCase();

function rowLevel(orgName: unknown, orgId: unknown, accountName: unknown, accountId: unknown): Level {
  const isTotal =
    (labelOf(orgName) === TOTAL_ORGANIZATIONS.toLowerCase() && labelOf(accountName) === TOTAL_ACCOUNTS.toLowerCase()) ||
    (labelOf(orgId) === TOTAL_ORGANIZATIONS.toLowerCase() && labelOf(accountId) === TOTAL_ACCOUNTS.toLowerCase());
  if (isTotal) return "channel";
  if (labelOf(accountName) === ALL_ACCOUNTS.toLowerCase() || labelOf(accountId) === ALL_ACCOUNTS.toLowerCase()) return "org";
  return "account";
}

const cell = (row: UploadRow, key: SheetColumnKey) => row.cells[SHEET_COLUMNS[key]];

/**
 * Turns uploaded rows into estimate changes, following the legacy rules:
 * - "Total Organizations / Total Accounts" rows set channel-level values;
 * - "All Accounts" rows set organization-level values;
 * - other rows set account-level values; a new account must exist in the reference accounts
 *   (its names are then taken from the reference data);
 * - blank cells keep the existing value; numbers are rounded; text in number columns is an error.
 */
export function planUpload(rows: readonly UploadRow[], ctx: UploadContext): UploadPlan {
  const errors: UploadIssue[] = [];
  const changes = new Map<string, EstimateChange>();
  const isbns = new Set<string>();
  let unchangedRows = 0;
  let changedRows = 0;

  for (const row of rows) {
    const isbn = clean(cell(row, "isbn"));
    const issue = (message: string) => errors.push({ sheet: row.sheet, rowNumber: row.rowNumber, isbn, message });

    if (!isbn) {
      issue("ISBN is missing.");
      continue;
    }
    if (!ctx.knownIsbns.has(isbn)) {
      issue(`ISBN ${isbn} was not found in the catalog.`);
      continue;
    }

    const parsed: Partial<EstimateValues> = {};
    let badNumber = false;
    for (const field of ESTIMATE_NUMBER_FIELDS) {
      const raw = cell(row, field);
      if (raw === null || raw === undefined || String(raw).trim() === "") continue;
      const value = parseEstimateInput(raw);
      if (value === undefined) {
        issue(`"${SHEET_COLUMNS[field]}" must be a whole number (found "${String(raw)}").`);
        badNumber = true;
      } else {
        parsed[field] = value;
      }
    }
    if (badNumber) continue;
    const notes = cell(row, "salesNotes");
    if (notes !== null && notes !== undefined && String(notes).trim() !== "") {
      parsed.salesNotes = String(notes).trim();
    }

    const level = rowLevel(cell(row, "orgName"), cell(row, "orgId"), cell(row, "accountName"), cell(row, "accountId"));
    let ref = normalizeAccount({
      channelId: clean(cell(row, "channelId")),
      channelName: clean(cell(row, "channelName")),
      orgId: level === "channel" ? null : clean(cell(row, "orgId")),
      orgName: level === "channel" ? null : clean(cell(row, "orgName")),
      accountId: level === "account" ? clean(cell(row, "accountId")) : null,
      accountName: level === "account" ? clean(cell(row, "accountName")) : null,
    });

    if (level === "account" && !ctx.titleAccountKeys(isbn).has(accountKey(ref))) {
      const reference = ctx.findReferenceAccount(ref.channelId, ref.orgId, ref.accountId);
      if (!reference) {
        issue("This channel, organization and account combination does not exist.");
        continue;
      }
      ref = normalizeAccount(reference);
    }

    ref = refForLevel(level, ref);
    const id = estimateId(isbn, level, ref);
    const existing = ctx.existingEstimates.get(id);
    const pending = changes.get(id);
    const current = { ...(existing ?? {}), ...(pending?.set ?? {}) } as Partial<EstimateValues>;

    const set: Partial<EstimateValues> = {};
    for (const [field, value] of Object.entries(parsed) as [keyof EstimateValues, never][]) {
      const before = current[field] ?? (field === "salesNotes" ? "" : null);
      if (before !== value) (set as Record<string, unknown>)[field] = value;
    }

    if (Object.keys(set).length === 0) {
      unchangedRows++;
      continue;
    }
    changedRows++;
    isbns.add(isbn);
    changes.set(id, { id, isbn, level, ref, set: { ...(pending?.set ?? {}), ...set } });
  }

  return { changes: [...changes.values()], errors, unchangedRows, changedRows, isbns: [...isbns].sort() };
}
