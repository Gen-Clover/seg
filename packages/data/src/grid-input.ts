import {
  buildTitleGrid,
  titleTotals,
  type AccountFact,
  type BuildGridInput,
  type CompAccountFact,
  type DomainConfig,
  type EstimateRecord,
  type TitleTotals,
} from "@seg/domain";
import type { EstimateDoc, TitleAccountFactDoc } from "./mongo";

const ref = (d: TitleAccountFactDoc) => ({
  channelId: d.channelId,
  channelName: d.channelName,
  orgId: d.orgId,
  orgName: d.orgName,
  accountId: d.accountId,
  accountName: d.accountName,
});

/** Title's own grid rows. */
export function toAccountFacts(docs: readonly TitleAccountFactDoc[]): AccountFact[] {
  return docs.filter((d) => d.inTitleList).map((d) => ({ ...ref(d), initialOrder: d.initialOrder }));
}

/** Figures of a title when used as a comparable title. */
export function toCompFacts(docs: readonly TitleAccountFactDoc[]): CompAccountFact[] {
  return docs
    .filter((d) => d.inCompList)
    .map((d) => ({
      ...ref(d),
      initialOrder: d.initialOrder,
      grossUnits: d.grossUnits,
      netUnits: d.netUnits,
      readerlinkPos: d.readerlinkPos,
    }));
}

export function toEstimateRecords(docs: readonly EstimateDoc[]): EstimateRecord[] {
  return docs.map(({ _id: _ignored, ...rest }) => rest);
}

export function gridInput(
  facts: readonly TitleAccountFactDoc[],
  compFacts: readonly TitleAccountFactDoc[] | null,
  estimates: readonly EstimateDoc[],
  config?: DomainConfig,
): BuildGridInput {
  return {
    facts: toAccountFacts(facts),
    compFacts: compFacts ? toCompFacts(compFacts) : null,
    estimates: toEstimateRecords(estimates),
    config,
  };
}

export function computeTitleTotals(
  facts: readonly TitleAccountFactDoc[],
  compFacts: readonly TitleAccountFactDoc[] | null,
  estimates: readonly EstimateDoc[],
  config?: DomainConfig,
): TitleTotals {
  return titleTotals(buildTitleGrid(gridInput(facts, compFacts, estimates, config)));
}
