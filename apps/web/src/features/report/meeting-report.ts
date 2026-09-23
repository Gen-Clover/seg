"use client";

import { buildTitleGrid, meetingReportTable, type EstimateRecord, type ReportRow } from "@seg/domain";
import { fetchTitleDetails } from "@/lib/batch";
import type { TitleDetail } from "@/lib/queries";
import { dateStamp, saveBlob } from "@/lib/sheets";
import { fmtDate, fmtInt, fmtMoney } from "@/lib/utils";

/**
 * SEG Meeting Report (legacy "Meeting Report" PDF), drawn as vector text and tables:
 * a cover page with totals and a title index, then one section per title — title and comparable-title
 * details and the channel table. Sharp at any zoom, and a few hundred KB instead of screenshots.
 */
export async function downloadMeetingReport(
  isbns: string[],
  scope: string,
  onProgress?: (label: string) => void,
): Promise<{ titles: number; pages: number }> {
  const { titles } = await fetchTitleDetails(isbns, (done, total) =>
    onProgress?.(`Loading titles · ${fmtInt(done)} of ${fmtInt(total)}`),
  );
  onProgress?.("Drawing the report…");
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 32;
  const generated = new Date();

  const sections = titles.map((d) => ({ detail: d, table: meetingReportTable(gridOf(d)) }));

  // ---------- Cover ----------
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 118, "F");
  doc.setFillColor(...BRAND);
  doc.rect(0, 118, W, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(24).text("SEG Meeting Report", M, 58);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(200, 204, 214);
  doc.text(`${scope} · ${fmtInt(titles.length)} title${titles.length === 1 ? "" : "s"} · generated ${fmtDate(generated.toISOString())}`, M, 84);

  const sum = (f: (r: ReportRow) => number | null) => sections.reduce((s, x) => s + (f(x.table.total) ?? 0), 0);
  const kpis: [string, string][] = [
    ["Initial orders", fmtInt(sum((r) => r.metrics.initialOrder))],
    ["Laydown goal", fmtInt(sum((r) => r.values.laydownGoal))],
    ["Laydown estimate", fmtInt(sum((r) => r.values.laydownEstimate))],
    ["6-month estimate", fmtInt(sum((r) => r.values.sixMonthEstimate))],
  ];
  const kw = (W - M * 2 - 3 * 12) / 4;
  kpis.forEach(([label, value], i) => {
    const x = M + i * (kw + 12);
    doc.setDrawColor(...LINE).setFillColor(248, 249, 251).roundedRect(x, 142, kw, 58, 6, 6, "FD");
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED).text(label, x + 12, 162);
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...INK).text(value, x + 12, 188);
  });

  autoTable(doc, {
    startY: 222,
    margin: { left: M, right: M, bottom: 36 },
    head: [["ISBN", "Title", "Season", "Pub date", "Comparable title", "Initial orders", "Laydown goal", "Laydown est.", "Est. vs goal"]],
    body: sections.map(({ detail: d, table: t }) => [
      d.title.isbn,
      d.title.title,
      d.title.season ?? "",
      fmtDate(d.title.pubDate, ""),
      d.comp ? d.comp.title : "",
      fmtInt(t.total.metrics.initialOrder),
      fmtInt(t.total.values.laydownGoal),
      fmtInt(t.total.values.laydownEstimate),
      vsGoal(t.total),
    ]),
    ...tableStyle(),
    columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 200 }, 4: { cellWidth: 160 }, 5: RIGHT, 6: RIGHT, 7: RIGHT, 8: RIGHT },
  });

  // ---------- One section per title ----------
  for (const { detail: d, table: t } of sections) {
    doc.addPage();
    let y = sectionHeader(doc, d, W, M);

    const half = (W - M * 2 - 14) / 2;
    const titleRows: [string, string][] = [
      ["ISBN", d.title.isbn],
      ["Author", d.title.author ?? "—"],
      ["Season", d.title.season ?? "—"],
      ["Pub / release date", `${fmtDate(d.title.pubDate)} / ${fmtDate(d.title.releaseDate)}`],
      ["Paper cut-off / LDC", `${fmtDate(d.title.paperCutOff)} / ${fmtDate(d.title.ldc)}`],
      ["Format · price", `${d.title.format ?? "—"} · ${fmtMoney(d.title.usPrice)}`],
      ["Imprint · division", `${d.title.imprint ?? "—"} · ${d.title.division ?? "—"}`],
      ["Print run · pages · trim", `${fmtInt(d.title.printRun)} · ${fmtInt(d.title.pages)} · ${d.title.trim ?? "—"}`],
      ["Title notes", d.title.plan.titleNotes || "—"],
    ];
    const c = d.comp;
    const compRows: [string, string][] = c
      ? [
          ["Title", c.title],
          ["ISBN · author", `${c.isbn} · ${c.author ?? "—"}`],
          ["Season", c.season ?? "—"],
          ["Pub / release date", `${fmtDate(c.pubDate)} / ${fmtDate(c.releaseDate)}`],
          ["Format · price", `${c.format ?? "—"} · ${fmtMoney(c.usPrice)}`],
          ["Imprint · division", `${c.imprint ?? "—"} · ${c.division ?? "—"}`],
          ["LTD gross units", fmtInt(c.stats.ltdGrossUnits)],
          ["BookScan LTD POS", fmtInt(c.stats.bookscanLtd)],
          ["eBook units", fmtInt(c.stats.ebookUnits)],
        ]
      : [["", "No comparable title chosen yet."]];

    const cardY = y;
    const endLeft = card(doc, autoTable, "Title", titleRows, cardY, M, half);
    const endRight = card(doc, autoTable, "Comparable title", compRows, cardY, M + half + 14, half);
    y = Math.max(endLeft, endRight) + 16;

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 70, bottom: 36 },
      head: [[
        "Distribution channel", "Initial orders", "Laydown goal", "Laydown est.", "6-month est.", "Sales notes",
        "Comp initial orders", "Comp gross sales", "Comp net sales", "Comp LTD POS",
      ]],
      body: [t.total, ...t.channels].map((r) => [
        r.label,
        fmtInt(r.metrics.initialOrder),
        fmtInt(r.values.laydownGoal, ""),
        fmtInt(r.values.laydownEstimate, ""),
        fmtInt(r.values.sixMonthEstimate, ""),
        r.notes,
        fmtInt(r.metrics.compInitialOrder, ""),
        fmtInt(r.metrics.compGross, ""),
        fmtInt(r.metrics.compNet, ""),
        fmtInt(r.metrics.compReaderlinkPos, ""),
      ]),
      ...tableStyle(),
      columnStyles: { 0: { cellWidth: 150, fontStyle: "bold" }, 1: RIGHT, 2: RIGHT, 3: RIGHT, 4: RIGHT, 5: { cellWidth: 170 }, 6: RIGHT, 7: RIGHT, 8: RIGHT, 9: RIGHT },
      didParseCell: (cell) => {
        if (cell.section === "body" && cell.row.index === 0) {
          cell.cell.styles.fillColor = [238, 240, 244];
          cell.cell.styles.fontStyle = "bold";
        }
      },
      // Long channel lists continue on the next page with the title repeated.
      didDrawPage: (data) => {
        if (data.pageNumber > 1) sectionHeader(doc, d, W, M, true);
      },
    });
  }

  // ---------- Footers ----------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text("SEG · Sales Estimates · Confidential", M, H - 16);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 16, { align: "right" });
  }

  saveBlob(`SEG Meeting Report ${dateStamp()}.pdf`, doc.output("blob"));
  return { titles: titles.length, pages };
}

const INK: [number, number, number] = [15, 23, 40];
const BRAND: [number, number, number] = [212, 32, 42];
const MUTED: [number, number, number] = [102, 112, 133];
const LINE: [number, number, number] = [207, 212, 220];
const RIGHT = { halign: "right" as const };

function gridOf(d: TitleDetail) {
  return buildTitleGrid({ facts: d.facts, compFacts: d.compFacts, estimates: d.estimates as EstimateRecord[] });
}

function vsGoal(r: ReportRow) {
  const { laydownGoal: g, laydownEstimate: e } = r.values;
  if (g === null && e === null) return "";
  const diff = (g ?? 0) - (e ?? 0);
  return `${diff > 0 ? "+" : ""}${fmtInt(diff)}`;
}

type Doc = import("jspdf").jsPDF;
type AutoTable = typeof import("jspdf-autotable").autoTable;

function sectionHeader(doc: Doc, d: TitleDetail, W: number, M: number, continued = false) {
  doc.setFillColor(...BRAND);
  doc.rect(M, 28, 4, 26, "F");
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...INK);
  const title = doc.splitTextToSize(d.title.title, W - M * 2 - 220)[0] as string;
  doc.text(title + (continued ? " (continued)" : ""), M + 12, 42);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  doc.text(`${d.title.isbn}${d.title.author ? ` · ${d.title.author}` : ""}${d.title.season ? ` · ${d.title.season}` : ""}`, M + 12, 55);
  doc.text("SEG Meeting Report", W - M, 42, { align: "right" });
  return 72;
}

function card(doc: Doc, autoTable: AutoTable, heading: string, rows: [string, string][], y: number, x: number, width: number) {
  autoTable(doc, {
    startY: y,
    margin: { left: x },
    tableWidth: width,
    head: [[{ content: heading, colSpan: 2 }]],
    body: rows,
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: { top: 2.5, bottom: 2.5, left: 8, right: 8 }, textColor: INK, overflow: "linebreak" },
    headStyles: { fontStyle: "bold", fontSize: 10, textColor: INK, fillColor: [242, 244, 247] },
    columnStyles: { 0: { cellWidth: 118, textColor: MUTED } },
    tableLineColor: LINE,
    tableLineWidth: 0.6,
  });
  return (doc as Doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function tableStyle() {
  return {
    theme: "grid" as const,
    styles: { fontSize: 8, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.5, overflow: "linebreak" as const },
    headStyles: { fillColor: INK, textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const, fontSize: 7.5 },
    alternateRowStyles: { fillColor: [250, 251, 252] as [number, number, number] },
  };
}
