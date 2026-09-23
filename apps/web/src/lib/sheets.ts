"use client";

import type { UploadRow } from "@seg/domain";

/** Spreadsheet read/write in the browser. SheetJS is loaded on first use to keep pages light. */
const loadXlsx = () => import("xlsx");

export interface SheetSpec {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
  widths?: number[];
}

/** Excel's row limit is 1,048,576; long exports are split into numbered sheets well before that. */
const MAX_ROWS_PER_SHEET = 100_000;

export async function downloadWorkbook(fileName: string, sheets: SheetSpec[]) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const parts = Math.max(1, Math.ceil(sheet.rows.length / MAX_ROWS_PER_SHEET));
    for (let p = 0; p < parts; p++) {
      const rows = sheet.rows.slice(p * MAX_ROWS_PER_SHEET, (p + 1) * MAX_ROWS_PER_SHEET);
      const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...rows]);
      if (sheet.widths) ws["!cols"] = sheet.widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, parts === 1 ? sheet.name : `${sheet.name} ${p + 1}`);
    }
  }
  XLSX.writeFile(wb, fileName, { compression: true });
}

export function downloadCsv(fileName: string, headers: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens UTF-8 correctly.
  const text = "﻿" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  saveBlob(fileName, new Blob([text], { type: "text/csv;charset=utf-8" }));
}

export function saveBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ParsedWorkbook {
  sheets: { name: string; headers: string[]; rows: UploadRow[] }[];
}

/** Reads every sheet of an .xlsx / .xls / .csv file into header-keyed rows (blank rows skipped). */
export async function readWorkbook(file: File): Promise<ParsedWorkbook> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: true });
  return {
    sheets: wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name]!;
      const firstRow = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r : 0;
      const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
      const headers = (grid[0] ?? []).map((h) => String(h ?? "").trim());
      const rows: UploadRow[] = [];
      for (let i = 1; i < grid.length; i++) {
        const values = grid[i] ?? [];
        if (values.every((v) => v === null || String(v).trim() === "")) continue;
        const cells: Record<string, unknown> = {};
        headers.forEach((h, c) => {
          if (h) cells[h] = values[c] ?? null;
        });
        // Row number as the user sees it in Excel.
        rows.push({ sheet: name, rowNumber: firstRow + i + 1, cells });
      }
      return { name, headers, rows };
    }),
  };
}

export const dateStamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
