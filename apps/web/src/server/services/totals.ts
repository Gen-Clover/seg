import { computeTitleTotals } from "@seg/data";
import type { TitleTotals } from "@seg/domain";
import { collections } from "../db";
import { domainConfig } from "./settings";

/** Recomputes and stores a title's summary totals (after edits, uploads or ingestion). */
export async function refreshTitleTotals(isbn: string, compIsbn?: string | null): Promise<TitleTotals> {
  const [titles, facts, estimates] = await Promise.all([collections.titles(), collections.facts(), collections.estimates()]);
  let comp = compIsbn;
  if (comp === undefined) {
    const t = await titles.findOne({ _id: isbn }, { projection: { "plan.compIsbn": 1 } });
    comp = t?.plan?.compIsbn ?? null;
  }
  const [ownFacts, compFacts, estimateDocs] = await Promise.all([
    facts.find({ isbn, inTitleList: true }).toArray(),
    comp ? facts.find({ isbn: comp, inCompList: true }).toArray() : null,
    estimates.find({ isbn }).toArray(),
  ]);
  const totals = computeTitleTotals(ownFacts, compFacts, estimateDocs, await domainConfig());
  await titles.updateOne({ _id: isbn }, { $set: { totals } });
  return totals;
}
