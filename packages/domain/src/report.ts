import type { TitleGrid } from "./grid";
import { channelLabel } from "./identity";
import type { RolledEstimates, RowMetrics } from "./types";

export interface ReportRow {
  label: string;
  metrics: RowMetrics;
  /** Rolled values: a level's own value, otherwise the sum of its children (same as the grid). */
  values: RolledEstimates;
  notes: string;
}

export interface MeetingReportTable {
  total: ReportRow;
  channels: ReportRow[];
}

/**
 * Channel-level rows for the meeting report (legacy layout: one row per distribution channel plus a total).
 * Sales notes: the channel's own note, otherwise its organizations' and accounts' notes, de-duplicated.
 */
export function meetingReportTable(grid: TitleGrid): MeetingReportTable {
  const channels = grid.channels.map((ch) => {
    let notes = ch.own.salesNotes.trim();
    if (!notes) {
      const seen = new Set<string>();
      for (const org of ch.orgs) {
        for (const n of [org.own.salesNotes, ...org.accounts.map((a) => a.own.salesNotes)]) {
          const t = n.trim();
          if (t) seen.add(t);
        }
      }
      notes = [...seen].join(" · ");
    }
    return { label: channelLabel(ch.ref), metrics: ch.metrics, values: ch.rolled, notes };
  });
  return {
    total: { label: "Total", metrics: grid.totals.metrics, values: grid.totals.rolled, notes: "" },
    channels,
  };
}
