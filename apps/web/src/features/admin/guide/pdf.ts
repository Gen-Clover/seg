import type { GuideBlock, GuideSection } from "./content";

type RGB = [number, number, number];
const INK: RGB = [28, 25, 22];
const MUTED: RGB = [102, 96, 90];
const BRAND: RGB = [233, 26, 35];
const LINE: RGB = [220, 214, 208];
const TIP_BG: RGB = [236, 246, 247];

/** The standard PDF fonts only cover Latin-1: turn arrows, dashes and quotes into plain equivalents. */
export function pdfText(s: string): string {
  return s
    .replace(/\\\*/g, "*")
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/·/g, "-")
    .replace(/⋯/g, "...")
    .replace(/[^\x20-\x7E\n]/g, "");
}

/** Words with a bold flag and whether a space comes before them, from text using **bold** markers. */
function tokens(text: string): { word: string; bold: boolean; space: boolean }[] {
  const out: { word: string; bold: boolean; space: boolean }[] = [];
  let spaceBefore = false;
  pdfText(text)
    .split("**")
    .forEach((part, i) => {
      for (const piece of part.split(/(\s+)/)) {
        if (!piece) continue;
        if (/^\s+$/.test(piece)) spaceBefore = true;
        else {
          out.push({ word: piece, bold: i % 2 === 1, space: spaceBefore });
          spaceBefore = false;
        }
      }
    });
  return out;
}

/**
 * Builds the guide as a PDF: cover, table of contents (with page numbers and links) and every
 * section, with page numbers in the footer. Runs in the browser.
 */
export async function downloadGuidePdf(guide: { title: string; subtitle: string; version: string; updated: string }, sections: GuideSection[]) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 54;
  const CW = W - M * 2;
  const BOTTOM = H - 60;
  let y = M;

  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const newPage = () => {
    doc.addPage();
    y = M;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };

  /** Wrapped text with **bold** runs. Returns nothing; advances y. */
  const rich = (text: string, opts: { size?: number; x?: number; width?: number; color?: RGB; lineGap?: number } = {}) => {
    const size = opts.size ?? 10;
    const x = opts.x ?? M;
    const width = opts.width ?? CW;
    const lh = size * (opts.lineGap ?? 1.45);
    doc.setFontSize(size);
    color(opts.color ?? INK);
    const words = tokens(text);
    let line: { word: string; bold: boolean; space: boolean }[] = [];
    let lineW = 0;
    const space = () => doc.getTextWidth(" ");
    const flush = () => {
      ensure(lh);
      let cx = x;
      line.forEach((t, i) => {
        if (i && t.space) cx += space();
        doc.setFont("helvetica", t.bold ? "bold" : "normal");
        doc.text(t.word, cx, y + size);
        cx += doc.getTextWidth(t.word);
      });
      y += lh;
      line = [];
      lineW = 0;
    };
    for (const t of words) {
      doc.setFont("helvetica", t.bold ? "bold" : "normal");
      const w = doc.getTextWidth(t.word);
      const gap = line.length && t.space ? space() : 0;
      if (line.length && lineW + gap + w > width) flush();
      lineW += (line.length ? gap : 0) + w;
      line.push(t);
    }
    if (line.length) flush();
    doc.setFont("helvetica", "normal");
  };

  /* ---------- cover ---------- */
  doc.setFillColor(28, 25, 22);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.rect(M, 210, 56, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(pdfText(guide.title), CW), M, 260);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(15);
  doc.setTextColor(210, 204, 198);
  doc.text(pdfText(guide.subtitle), M, 330);
  doc.setFontSize(10);
  doc.setTextColor(170, 164, 158);
  doc.text(`Version ${guide.version}  -  ${guide.updated}`, M, H - 80);
  doc.text("Abrams", M, H - 64);

  /* ---------- table of contents (filled in at the end) ---------- */
  const parts = [...new Set(sections.map((s) => s.part))];
  const tocLines = parts.length + sections.length;
  const tocPages = Math.max(1, Math.ceil((tocLines * 20 + 80) / (BOTTOM - M)));
  const tocStart = 2;
  for (let i = 0; i < tocPages; i++) doc.addPage();

  /* ---------- content ---------- */
  const starts = new Map<string, number>();
  let lastPart = "";
  newPage();
  for (const s of sections) {
    if (s.part !== lastPart) {
      if (y > M) newPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      color(BRAND);
      doc.text(pdfText(s.part).toUpperCase(), M, y + 9);
      y += 20;
      lastPart = s.part;
    } else {
      ensure(80);
    }
    starts.set(s.id, doc.getNumberOfPages());
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    color(INK);
    doc.text(pdfText(s.title), M, y + 17);
    y += 26;
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.6);
    doc.line(M, y, M + CW, y);
    y += 12;
    for (const b of s.blocks) block(b);
    y += 14;
  }

  function block(b: GuideBlock) {
    switch (b.t) {
      case "p":
        rich(b.text);
        y += 6;
        return;
      case "h":
        ensure(40);
        y += 4;
        rich(`**${b.text}**`, { size: 12 });
        y += 2;
        return;
      case "list":
      case "steps":
        b.items.forEach((item, i) => {
          ensure(16);
          doc.setFont("helvetica", b.t === "steps" ? "bold" : "normal");
          doc.setFontSize(10);
          color(b.t === "steps" ? BRAND : MUTED);
          doc.text(b.t === "steps" ? `${i + 1}.` : "-", M + 4, y + 10);
          rich(item, { x: M + 20, width: CW - 20 });
          y += 3;
        });
        y += 4;
        return;
      case "tip": {
        const lines = doc.setFontSize(10).splitTextToSize(pdfText(b.text.replace(/\*\*/g, "")), CW - 28).length;
        const h = lines * 14.5 + 16;
        ensure(h);
        doc.setFillColor(TIP_BG[0], TIP_BG[1], TIP_BG[2]);
        doc.roundedRect(M, y, CW, h, 4, 4, "F");
        y += 8;
        rich(b.text, { x: M + 14, width: CW - 28 });
        y += 14;
        return;
      }
      case "table":
        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M, bottom: H - BOTTOM },
          head: [b.head.map((h) => pdfText(h))],
          body: b.rows.map((r) => r.map((c) => pdfText(c.replace(/\*\*/g, "")))),
          styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.5, valign: "top" },
          headStyles: { fillColor: [244, 241, 237], textColor: INK, fontStyle: "bold" },
          columnStyles: b.head.length === 2 ? { 0: { cellWidth: CW * 0.32, fontStyle: "bold" } } : {},
          theme: "grid",
          didDrawPage: () => undefined,
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
        return;
    }
  }

  /* ---------- fill the table of contents ---------- */
  doc.setPage(tocStart);
  y = M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  color(INK);
  doc.text("Contents", M, y + 20);
  y += 44;
  let part = "";
  for (const s of sections) {
    if (y > BOTTOM - 20) {
      doc.setPage(doc.getCurrentPageInfo().pageNumber + 1);
      y = M;
    }
    if (s.part !== part) {
      part = s.part;
      y += part === sections[0]!.part ? 0 : 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      color(BRAND);
      doc.text(pdfText(part).toUpperCase(), M, y + 9);
      y += 20;
    }
    const page = starts.get(s.id) ?? 1;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    color(INK);
    doc.textWithLink(pdfText(s.title), M + 8, y + 11, { pageNumber: page });
    color(MUTED);
    doc.text(String(page), M + CW, y + 11, { align: "right" });
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineDashPattern([1, 2], 0);
    doc.line(M + 16 + doc.getTextWidth(pdfText(s.title)), y + 10, M + CW - 20, y + 10);
    doc.setLineDashPattern([], 0);
    y += 20;
  }

  /* ---------- footers ---------- */
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    color(MUTED);
    doc.text(`SEG Product guide - version ${guide.version}`, M, H - 30);
    doc.text(`${p} / ${total}`, M + CW, H - 30, { align: "right" });
  }

  doc.save(`SEG Product guide v${guide.version}.pdf`);
  return { pages: total };
}
