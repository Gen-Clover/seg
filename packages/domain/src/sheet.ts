/**
 * Column layout shared by the account-detail export and the bulk upload.
 * Header names match the legacy export exactly, so users can export, edit and re-upload.
 */

export const SHEET_COLUMNS = {
  isbn: "ISBN",
  isbnTitle: "ISBN TITLE",
  compIsbn: "COMP ISBN",
  compTitle: "COMP TITLE",
  channelId: "DISTRIBUTION CHANNEL",
  channelName: "DISTRIBUTION CHANNEL NAME",
  orgName: "Organization Name",
  orgId: "Organization ID",
  accountName: "Account Name",
  accountId: "Account ID",
  initialOrder: "INITIAL ORDER",
  salesNotes: "Sales Notes",
  laydownGoal: "Laydown Goal",
  laydownEstimate: "Laydown Estimate",
  sixMonthEstimate: "6-month Estimate (incl Laydown)",
  compInitialOrder: "COMP_TITLE INITIAL ORDER",
  compGross: "COMP_TITLE GROSS SALES",
  compNet: "COMP_TITLE NET SALES",
  compReturnsPct: "COMP_TITLE % RETURNS",
  comp4wkPos: "COMP_TITLE 4wk POS",
  comp8wkPos: "COMP_TITLE 8wk POS",
  compLtdPos: "COMP_TITLE LTD POS",
} as const;

export type SheetColumnKey = keyof typeof SHEET_COLUMNS;
export const SHEET_COLUMN_ORDER = Object.keys(SHEET_COLUMNS) as SheetColumnKey[];

/** Columns an upload must contain. */
export const UPLOAD_REQUIRED_COLUMNS: SheetColumnKey[] = [
  "isbn",
  "channelId",
  "channelName",
  "orgName",
  "orgId",
  "accountName",
  "accountId",
  "salesNotes",
  "laydownGoal",
  "laydownEstimate",
  "sixMonthEstimate",
];

/** Marker labels used in place of names on summary rows. */
export const TOTAL_ORGANIZATIONS = "Total Organizations";
export const TOTAL_ACCOUNTS = "Total Accounts";
export const ALL_ACCOUNTS = "All Accounts";
