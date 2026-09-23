import { DEFAULT_DOMAIN_CONFIG, isAccountLevelChannel, type DomainConfig } from "./config";
import {
  accountKey,
  channelKey,
  normalizeAccount,
  orgKey,
} from "./identity";
import { sumNullable } from "./numbers";
import {
  ESTIMATE_NUMBER_FIELDS,
  type AccountFact,
  type AccountRef,
  type ChannelRef,
  type CompAccountFact,
  type EstimateRecord,
  type EstimateValues,
  type OrgRef,
  type RolledEstimates,
  type RowMetrics,
} from "./types";

export const EMPTY_ESTIMATE: EstimateValues = {
  laydownGoal: null,
  laydownEstimate: null,
  sixMonthEstimate: null,
  salesNotes: "",
};

export interface AccountNode {
  key: string;
  ref: AccountRef;
  metrics: RowMetrics;
  own: EstimateValues;
  /** True when the account came only from the comparable title (legacy status 2). */
  compOnly: boolean;
}

export interface OrgNode {
  key: string;
  ref: OrgRef;
  metrics: RowMetrics;
  own: EstimateValues;
  /** Own value if set, otherwise the sum of its accounts. */
  rolled: RolledEstimates;
  /** Accounts with a name, sorted. Only rendered for account-level channels. */
  accounts: AccountNode[];
  accountCount: number;
}

export interface ChannelNode {
  key: string;
  ref: ChannelRef;
  metrics: RowMetrics;
  own: EstimateValues;
  /** Own value if set, otherwise the sum of its organizations' rolled values. */
  rolled: RolledEstimates;
  orgs: OrgNode[];
  /** Whether organizations in this channel expand to individual accounts. */
  accountLevel: boolean;
  accountCount: number;
}

export interface TitleGrid {
  channels: ChannelNode[];
  totals: { metrics: RowMetrics; rolled: RolledEstimates };
  hasComp: boolean;
}

export interface BuildGridInput {
  facts: AccountFact[];
  compFacts: CompAccountFact[] | null;
  estimates: EstimateRecord[];
  config?: DomainConfig;
}

interface AccountDraft {
  ref: AccountRef;
  initialOrder: number;
  comp: CompAccountFact | null;
  inMain: boolean;
}

const zeroMetrics = (hasComp: boolean): RowMetrics => ({
  initialOrder: 0,
  compInitialOrder: hasComp ? 0 : null,
  compGross: hasComp ? 0 : null,
  compNet: hasComp ? 0 : null,
  compReaderlinkPos: hasComp ? 0 : null,
});

function addMetrics(a: RowMetrics, b: RowMetrics): RowMetrics {
  const add = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return {
    initialOrder: a.initialOrder + b.initialOrder,
    compInitialOrder: add(a.compInitialOrder, b.compInitialOrder),
    compGross: add(a.compGross, b.compGross),
    compNet: add(a.compNet, b.compNet),
    compReaderlinkPos: add(a.compReaderlinkPos, b.compReaderlinkPos),
  };
}

function ownValues(e: EstimateRecord | undefined): EstimateValues {
  if (!e) return { ...EMPTY_ESTIMATE };
  return {
    laydownGoal: e.laydownGoal,
    laydownEstimate: e.laydownEstimate,
    sixMonthEstimate: e.sixMonthEstimate,
    salesNotes: e.salesNotes ?? "",
  };
}

/** A level's own value wins; otherwise children are summed (nulls ignored). */
export function rollUp(own: EstimateValues, children: RolledEstimates[]): RolledEstimates {
  const out = {} as RolledEstimates;
  for (const f of ESTIMATE_NUMBER_FIELDS) {
    out[f] = own[f] ?? sumNullable(children.map((c) => c[f]));
  }
  return out;
}

const byLabel = (a: string | null, b: string | null) =>
  (a ?? "￿").localeCompare(b ?? "￿", undefined, { sensitivity: "base" });

/**
 * Builds the detail grid for one title.
 *
 * Rows = accounts with initial-order facts ∪ accounts from the comparable title ∪ any
 * level that has a saved estimate (e.g. channel or organization totals from an upload).
 * Nothing about row membership is stored — it is derived on every read.
 */
export function buildTitleGrid(input: BuildGridInput): TitleGrid {
  const config = input.config ?? DEFAULT_DOMAIN_CONFIG;
  const hasComp = input.compFacts !== null;

  const channelRefs = new Map<string, ChannelRef>();
  const orgRefs = new Map<string, OrgRef>();
  const accounts = new Map<string, AccountDraft>();

  const registerOrg = (ref: OrgRef) => {
    channelRefs.set(channelKey(ref), { channelId: ref.channelId, channelName: ref.channelName });
    const hasOrg = ref.orgId !== null || ref.orgName !== null;
    if (hasOrg) orgRefs.set(orgKey(ref), { channelId: ref.channelId, channelName: ref.channelName, orgId: ref.orgId, orgName: ref.orgName });
  };

  for (const fact of input.facts) {
    const ref = normalizeAccount(fact);
    registerOrg(ref);
    const key = accountKey(ref);
    const existing = accounts.get(key);
    if (existing) {
      existing.initialOrder += fact.initialOrder;
      existing.inMain = true;
    } else {
      accounts.set(key, { ref, initialOrder: fact.initialOrder, comp: null, inMain: true });
    }
  }

  for (const fact of input.compFacts ?? []) {
    const ref = normalizeAccount(fact);
    registerOrg(ref);
    const key = accountKey(ref);
    const existing = accounts.get(key);
    const comp = existing?.comp
      ? {
          ...existing.comp,
          initialOrder: existing.comp.initialOrder + fact.initialOrder,
          grossUnits: existing.comp.grossUnits + fact.grossUnits,
          netUnits: existing.comp.netUnits + fact.netUnits,
          readerlinkPos: existing.comp.readerlinkPos + fact.readerlinkPos,
        }
      : fact;
    if (existing) existing.comp = comp;
    else accounts.set(key, { ref, initialOrder: 0, comp, inMain: false });
  }

  const estimatesByKey = new Map<string, EstimateRecord>();
  for (const e of input.estimates) {
    const ref = normalizeAccount(e);
    registerOrg(ref);
    if (e.level === "account") {
      const key = accountKey(ref);
      estimatesByKey.set(`account|${key}`, e);
      if (!accounts.has(key)) accounts.set(key, { ref, initialOrder: 0, comp: null, inMain: true });
    } else if (e.level === "org") {
      estimatesByKey.set(`org|${orgKey(ref)}`, e);
    } else {
      estimatesByKey.set(`channel|${channelKey(ref)}`, e);
    }
  }

  // Group accounts under their organization.
  const accountsByOrg = new Map<string, AccountDraft[]>();
  const orphanAccountsByChannel = new Map<string, AccountDraft[]>();
  for (const draft of accounts.values()) {
    const hasOrg = draft.ref.orgId !== null || draft.ref.orgName !== null;
    const bucket = hasOrg ? accountsByOrg : orphanAccountsByChannel;
    const k = hasOrg ? orgKey(draft.ref) : channelKey(draft.ref);
    const list = bucket.get(k);
    if (list) list.push(draft);
    else bucket.set(k, [draft]);
  }

  const toAccountNode = (d: AccountDraft): AccountNode => {
    const key = accountKey(d.ref);
    return {
      key,
      ref: d.ref,
      own: ownValues(estimatesByKey.get(`account|${key}`)),
      compOnly: !d.inMain,
      metrics: {
        initialOrder: d.initialOrder,
        compInitialOrder: hasComp ? d.comp?.initialOrder ?? 0 : null,
        compGross: hasComp ? d.comp?.grossUnits ?? 0 : null,
        compNet: hasComp ? d.comp?.netUnits ?? 0 : null,
        compReaderlinkPos: hasComp ? d.comp?.readerlinkPos ?? 0 : null,
      },
    };
  };

  const channels: ChannelNode[] = [];
  for (const [cKey, cRef] of channelRefs) {
    const accountLevel = isAccountLevelChannel(cRef.channelId, config);
    const orgs: OrgNode[] = [];
    let channelMetrics = zeroMetrics(hasComp);
    let channelAccountCount = 0;
    const orgRolled: RolledEstimates[] = [];

    for (const [oKey, oRef] of orgRefs) {
      if (channelKey(oRef) !== cKey) continue;
      const allAccounts = (accountsByOrg.get(oKey) ?? []).map(toAccountNode);
      const metrics = allAccounts.reduce((m, a) => addMetrics(m, a.metrics), zeroMetrics(hasComp));
      const own = ownValues(estimatesByKey.get(`org|${oKey}`));
      const rolled = rollUp(own, allAccounts.map((a) => ({
        laydownGoal: a.own.laydownGoal,
        laydownEstimate: a.own.laydownEstimate,
        sixMonthEstimate: a.own.sixMonthEstimate,
      })));
      const named = allAccounts
        .filter((a) => a.ref.accountName !== null)
        .sort((a, b) => byLabel(a.ref.accountName, b.ref.accountName));
      channelMetrics = addMetrics(channelMetrics, metrics);
      channelAccountCount += named.length;
      orgRolled.push(rolled);
      orgs.push({ key: oKey, ref: oRef, metrics, own, rolled, accounts: named, accountCount: named.length });
    }

    // Accounts with no organization still count toward the channel.
    for (const a of (orphanAccountsByChannel.get(cKey) ?? []).map(toAccountNode)) {
      channelMetrics = addMetrics(channelMetrics, a.metrics);
      orgRolled.push({ laydownGoal: a.own.laydownGoal, laydownEstimate: a.own.laydownEstimate, sixMonthEstimate: a.own.sixMonthEstimate });
    }

    orgs.sort((a, b) => byLabel(a.ref.orgName, b.ref.orgName));
    const own = ownValues(estimatesByKey.get(`channel|${cKey}`));
    channels.push({
      key: cKey,
      ref: cRef,
      metrics: channelMetrics,
      own,
      rolled: rollUp(own, orgRolled),
      orgs,
      accountLevel,
      accountCount: channelAccountCount,
    });
  }

  channels.sort((a, b) => byLabel(a.ref.channelName, b.ref.channelName));

  return {
    channels,
    hasComp,
    totals: {
      metrics: channels.reduce((m, c) => addMetrics(m, c.metrics), zeroMetrics(hasComp)),
      rolled: rollUp({ ...EMPTY_ESTIMATE }, channels.map((c) => c.rolled)),
    },
  };
}

/** Title-level totals stored for the summary page. */
export interface TitleTotals {
  initialOrder: number;
  laydownGoal: number | null;
  laydownEstimate: number | null;
  sixMonthEstimate: number | null;
  /** Laydown Goal minus Laydown Estimate (legacy "Estimate vs Pub Goal"). */
  estimateVsGoal: number | null;
}

export function titleTotals(grid: TitleGrid): TitleTotals {
  const { rolled, metrics } = grid.totals;
  return {
    initialOrder: metrics.initialOrder,
    laydownGoal: rolled.laydownGoal,
    laydownEstimate: rolled.laydownEstimate,
    sixMonthEstimate: rolled.sixMonthEstimate,
    estimateVsGoal:
      rolled.laydownGoal === null && rolled.laydownEstimate === null
        ? null
        : (rolled.laydownGoal ?? 0) - (rolled.laydownEstimate ?? 0),
  };
}
