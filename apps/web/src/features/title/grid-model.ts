import {
  estimateId,
  refForLevel,
  type AccountNode,
  type AccountRef,
  type ChannelNode,
  type EstimateField,
  type EstimateNumberField,
  type EstimateValues,
  type Level,
  type OrgNode,
  type RolledEstimates,
  type RowMetrics,
  type TitleGrid,
} from "@seg/domain";

export type GridRow =
  | { kind: "total"; key: string; depth: 0; metrics: RowMetrics; rolled: RolledEstimates }
  | { kind: "channel"; key: string; depth: 0; node: ChannelNode }
  | { kind: "org"; key: string; depth: 1; node: OrgNode; channel: ChannelNode }
  | { kind: "account"; key: string; depth: 2; node: AccountNode; channel: ChannelNode; org: OrgNode };

export type ColKind = "name" | "metric" | "estimate" | "notes";

export interface GridCol {
  key: string;
  label: string;
  short?: string;
  width: number;
  kind: ColKind;
  field?: EstimateField;
  metric?: keyof RowMetrics;
  comp?: boolean;
}

export const GRID_COLS: GridCol[] = [
  { key: "name", label: "Channel / Organization / Account", width: 320, kind: "name" },
  { key: "initialOrder", label: "Initial orders", width: 100, kind: "metric", metric: "initialOrder" },
  { key: "laydownGoal", label: "Laydown goal", width: 112, kind: "estimate", field: "laydownGoal" },
  { key: "laydownEstimate", label: "Laydown est.", short: "Laydown estimate", width: 112, kind: "estimate", field: "laydownEstimate" },
  { key: "sixMonthEstimate", label: "6-month est.", short: "6-month estimate (incl. laydown)", width: 108, kind: "estimate", field: "sixMonthEstimate" },
  { key: "salesNotes", label: "Sales notes", width: 230, kind: "notes", field: "salesNotes" },
  { key: "compInitialOrder", label: "Initial orders", width: 96, kind: "metric", metric: "compInitialOrder", comp: true },
  { key: "compGross", label: "Gross sales", width: 96, kind: "metric", metric: "compGross", comp: true },
  { key: "compNet", label: "Net sales", width: 96, kind: "metric", metric: "compNet", comp: true },
  { key: "compReaderlinkPos", label: "LTD POS", short: "ReaderLink LTD point-of-sale", width: 96, kind: "metric", metric: "compReaderlinkPos", comp: true },
];

export const rowLevel = (row: GridRow): Level | null =>
  row.kind === "channel" ? "channel" : row.kind === "org" ? "org" : row.kind === "account" ? "account" : null;

export function rowRef(row: GridRow): AccountRef | null {
  if (row.kind === "channel") return { ...row.node.ref, orgId: null, orgName: null, accountId: null, accountName: null };
  if (row.kind === "org") return { ...row.node.ref, accountId: null, accountName: null };
  if (row.kind === "account") return row.node.ref;
  return null;
}

export function rowOwn(row: GridRow): EstimateValues | null {
  return row.kind === "total" ? null : row.node.own;
}

export function rowRolled(row: GridRow): RolledEstimates {
  if (row.kind === "total") return row.rolled;
  if (row.kind === "account") {
    const o = row.node.own;
    return { laydownGoal: o.laydownGoal, laydownEstimate: o.laydownEstimate, sixMonthEstimate: o.sixMonthEstimate };
  }
  return row.node.rolled;
}

export function rowMetrics(row: GridRow): RowMetrics {
  return row.kind === "total" ? row.metrics : row.node.metrics;
}

/** Id used to key a cell for dirty/saved highlighting (matches useAutosave). */
export function cellId(isbn: string, row: GridRow, field: EstimateField): string | null {
  const level = rowLevel(row);
  const ref = rowRef(row);
  if (!level || !ref) return null;
  return `${estimateId(isbn, level, refForLevel(level, ref))}|${field}`;
}

/** Sum of the children's rolled values, used to flag overrides. */
export function childSum(row: GridRow, field: EstimateNumberField): number | null {
  let values: (number | null)[] = [];
  if (row.kind === "channel") values = row.node.orgs.map((o) => o.rolled[field]);
  else if (row.kind === "org") values = row.node.accounts.map((a) => a.own[field]);
  else return null;
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

const matches = (text: string, words: string[]) => words.every((w) => text.includes(w));
const labelOf = (id: string | null, name: string | null) => `${name ?? ""} ${id ?? ""}`.toLowerCase();

/** Flattens the tree into visible rows, honoring expansion and the row filter. */
export function flattenGrid(grid: TitleGrid, expanded: ReadonlySet<string>, filter: string): GridRow[] {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const rows: GridRow[] = [{ kind: "total", key: "__total", depth: 0, metrics: grid.totals.metrics, rolled: grid.totals.rolled }];

  for (const ch of grid.channels) {
    const chText = labelOf(ch.ref.channelId, ch.ref.channelName);
    const chMatch = !words.length || matches(chText, words);
    const orgRows: GridRow[] = [];
    for (const org of ch.orgs) {
      const orgText = `${chText} ${labelOf(org.ref.orgId, org.ref.orgName)}`;
      const orgMatch = !words.length || matches(orgText, words);
      const accRows: GridRow[] = ch.accountLevel
        ? org.accounts
            .filter((a) => orgMatch || matches(`${orgText} ${labelOf(a.ref.accountId, a.ref.accountName)}`, words))
            .map((a) => ({ kind: "account", key: a.key, depth: 2, node: a, channel: ch, org }) as GridRow)
        : [];
      if (!orgMatch && !accRows.length) continue;
      orgRows.push({ kind: "org", key: org.key, depth: 1, node: org, channel: ch });
      // While filtering, accounts that match on their own are shown even if the org is collapsed.
      const accountOnlyMatch = words.length > 0 && !orgMatch && accRows.length > 0;
      const showAccounts = accountOnlyMatch || expanded.has(org.key);
      if (showAccounts) orgRows.push(...accRows);
    }
    if (!chMatch && !orgRows.length) continue;
    rows.push({ kind: "channel", key: ch.key, depth: 0, node: ch });
    if (expanded.has(ch.key) || (words.length > 0 && !chMatch)) rows.push(...orgRows);
  }
  return rows;
}

/** Every expandable key (for "expand all"). */
export function allExpandableKeys(grid: TitleGrid): string[] {
  const keys: string[] = [];
  for (const ch of grid.channels) {
    if (ch.orgs.length) keys.push(ch.key);
    if (ch.accountLevel) for (const o of ch.orgs) if (o.accounts.length) keys.push(o.key);
  }
  return keys;
}
