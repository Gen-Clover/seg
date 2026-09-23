import { buildTitleGrid, channelKey, channelLabel, type EstimateRecord } from "@seg/domain";
import { toAccountFacts, type EstimateDoc, type TitleAccountFactDoc } from "@seg/data";
import { collections } from "../db";
import { domainConfig } from "../env";

export interface ChannelInsights {
  channels: { key: string; name: string }[];
  /** Per ISBN: [initial orders, laydown goal, laydown estimate] for each channel (same order as `channels`). */
  rows: Record<string, [number, number | null, number | null][]>;
  computedAt: string;
}

const TTL_MS = 60_000;
const cache = globalThis as unknown as { __segInsights?: { at: number; value: ChannelInsights } };

/**
 * Channel breakdown of every in-scope title, computed with the normal roll-up rules
 * (a channel's own value, otherwise its organizations'). The browser sums the titles in view.
 * Cached for a minute per server instance.
 */
export async function channelInsights(): Promise<ChannelInsights> {
  if (cache.__segInsights && Date.now() - cache.__segInsights.at < TTL_MS) return cache.__segInsights.value;

  const [titlesCol, factsCol, estimatesCol] = await Promise.all([collections.titles(), collections.facts(), collections.estimates()]);
  const isbns = (await titlesCol.find({ inScope: true }, { projection: { _id: 1 } }).toArray()).map((t) => t._id);
  const [facts, estimates] = await Promise.all([
    factsCol.find({ isbn: { $in: isbns }, inTitleList: true }).toArray(),
    estimatesCol.find({ isbn: { $in: isbns } }).toArray(),
  ]);
  const factsBy = group(facts, (f) => f.isbn);
  const estimatesBy = group(estimates, (e) => e.isbn);
  const config = domainConfig();

  const channelIndex = new Map<string, number>();
  const channels: ChannelInsights["channels"] = [];
  const perTitle = new Map<string, Map<number, [number, number | null, number | null]>>();
  for (const isbn of isbns) {
    const grid = buildTitleGrid({
      facts: toAccountFacts(factsBy.get(isbn) ?? ([] as TitleAccountFactDoc[])),
      compFacts: null,
      estimates: (estimatesBy.get(isbn) ?? ([] as EstimateDoc[])) as EstimateRecord[],
      config,
    });
    const byChannel = new Map<number, [number, number | null, number | null]>();
    for (const ch of grid.channels) {
      const key = channelKey(ch.ref);
      let i = channelIndex.get(key);
      if (i === undefined) {
        i = channels.length;
        channelIndex.set(key, i);
        channels.push({ key, name: channelLabel(ch.ref) });
      }
      byChannel.set(i, [ch.metrics.initialOrder, ch.rolled.laydownGoal, ch.rolled.laydownEstimate]);
    }
    perTitle.set(isbn, byChannel);
  }

  const rows: ChannelInsights["rows"] = {};
  for (const [isbn, byChannel] of perTitle) {
    rows[isbn] = channels.map((_, i) => byChannel.get(i) ?? [0, null, null]);
  }
  const value = { channels, rows, computedAt: new Date().toISOString() };
  cache.__segInsights = { at: Date.now(), value };
  return value;
}

function group<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
