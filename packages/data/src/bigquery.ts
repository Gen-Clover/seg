/**
 * BigQuery contract.
 *
 * Source tables use the exact names and columns referenced by the legacy app's SQL, so the
 * same ingestion SQL runs on the demo dataset and on the client's
 * BUSINESS_INTELLIGENCE_LAYER_PROD dataset.
 */

export interface BigQueryConfig {
  projectId: string;
  /** Legacy: BUSINESS_INTELLIGENCE_LAYER_PROD. Demo: seg_source. */
  sourceDataset: string;
  /** Legacy: BUSINESS_INTELLIGENCE_WEBAPP_LAYER_PROD. Demo: seg_app. */
  appDataset: string;
  /** BigQuery location, e.g. "US". */
  location: string;
  /** Titles from this season year on get placeholder rows (popular accounts, ReaderLink chains). */
  minSeasonYear: number;
}

export type BqType = "STRING" | "INT64" | "FLOAT64" | "NUMERIC" | "DATE" | "TIMESTAMP" | "BOOL";
export interface BqField {
  name: string;
  type: BqType;
  mode?: "NULLABLE" | "REQUIRED";
}

/** Source tables (read-only for the app). */
export const SOURCE_TABLES: Record<string, BqField[]> = {
  BIL_BOOKATTRIBUTES: [
    { name: "EAN", type: "STRING" },
    { name: "ISBN", type: "STRING" },
    { name: "EBOOK_ISBN", type: "STRING" },
    { name: "FULL_TITLE", type: "STRING" },
    { name: "AUTHOR_1", type: "STRING" },
    { name: "SEASON", type: "STRING" },
    { name: "GROUP_1", type: "STRING" },
    { name: "TESTIMPRINTFROMHNA", type: "STRING" },
    { name: "FORMAT", type: "STRING" },
    { name: "IPM_FORMAT", type: "STRING" },
    { name: "US_PRICE", type: "FLOAT64" },
    { name: "PUB_DATE", type: "STRING" },
    { name: "RELEASE_DATE", type: "STRING" },
    { name: "PAPER_CUT_OFF", type: "STRING" },
    { name: "LDC", type: "STRING" },
    { name: "PAGES", type: "INT64" },
    { name: "TRIMWIDTH", type: "STRING" },
    { name: "TRIMLENGTH", type: "STRING" },
    { name: "PRINT_RUN", type: "STRING" },
    { name: "ANNOUNCED_1ST_PRINTING__BEST", type: "STRING" },
    { name: "COMPETITIVE_TITLES", type: "STRING" },
  ],
  BIL_CUSTOMERS: [
    { name: "STORE_ID", type: "STRING" },
    { name: "DISTRIBUTION_CHANNEL", type: "STRING" },
    { name: "DISTRIBUTION_CHANNEL_NAME", type: "STRING" },
    { name: "ORGANIZATION_ID", type: "STRING" },
    { name: "ORG_NAME", type: "STRING" },
    { name: "ACCOUNT_NBR", type: "STRING" },
    { name: "ACCOUNT_NAME", type: "STRING" },
    { name: "STORE_NAME", type: "STRING" },
    { name: "CLIENT_SALES_REP", type: "STRING" },
  ],
  BIL_MF_FACT_SALES: [
    { name: "STORE_ID", type: "STRING" },
    { name: "EXACT_DATE", type: "DATE" },
    { name: "EISBN", type: "STRING" },
    { name: "UNITS", type: "FLOAT64" },
    { name: "SALES_INDICATOR", type: "STRING" },
    { name: "DATA_TYPE", type: "STRING" },
    { name: "SALES_TYPE", type: "STRING" },
    { name: "SYSTEM_OF_ORIGIN", type: "STRING" },
  ],
  DIL_HBG_ORDERS: [
    { name: "ACCOUNT_STORE", type: "STRING" },
    { name: "ENTRY_DATE", type: "STRING" },
    { name: "ISBN", type: "STRING" },
    { name: "QUANTITY", type: "STRING" },
    { name: "LINE_STATUS", type: "STRING" },
    { name: "CANCEL_DATE", type: "STRING" },
    { name: "REFERENCE_NBR", type: "STRING" },
    { name: "FILEDATE", type: "TIMESTAMP" },
  ],
  DTL_HBG_FINAL: [
    { name: "EISBN", type: "STRING" },
    { name: "STORE_ID", type: "STRING" },
  ],
  BIL_READERLINK_CHAIN: [
    { name: "MASTER_CHAIN", type: "STRING" },
    { name: "CHAIN_ID", type: "STRING" },
    { name: "ORGANIZATION_ID", type: "STRING" },
    { name: "ORG_NAME", type: "STRING" },
    { name: "DISTRIBUTION_CHANNEL", type: "STRING" },
    { name: "DISTRIBUTION_CHANNEL_NAME", type: "STRING" },
  ],
  BIL_READERLINK_POS: [
    { name: "MASTER_CHAIN", type: "STRING" },
    { name: "ITEM_NUMBER", type: "STRING" },
    { name: "UNITS", type: "STRING" },
  ],
  BIL_BOOKSCAN_NPD: [
    { name: "ISBN", type: "STRING" },
    { name: "DATE", type: "STRING" },
    { name: "YTD", type: "STRING" },
  ],
  BIL_BOOKSCAN_NPD_TOP100: [
    { name: "ISBN", type: "STRING" },
    { name: "DATE", type: "STRING" },
    { name: "LTD_2022", type: "STRING" },
  ],
  BIL_SEG_POPULAR_ACCOUNTS: [
    { name: "DISTRIBUTION_CHANNEL", type: "STRING" },
    { name: "DISTRIBUTION_CHANNEL_NAME", type: "STRING" },
    { name: "ORGANIZATION_ID", type: "STRING" },
    { name: "ORG_NAME", type: "STRING" },
    { name: "ACCOUNT_NBR", type: "STRING" },
    { name: "ACCOUNT_NAME", type: "STRING" },
  ],
};

/** Append-only log of user edits (the app's write target). */
export const ESTIMATE_EVENTS_TABLE = "SEG_ESTIMATE_EVENTS";
export const ESTIMATE_EVENTS_SCHEMA: BqField[] = [
  { name: "event_id", type: "STRING", mode: "REQUIRED" },
  { name: "isbn", type: "STRING", mode: "REQUIRED" },
  { name: "level", type: "STRING", mode: "REQUIRED" },
  { name: "distribution_channel", type: "STRING" },
  { name: "distribution_channel_name", type: "STRING" },
  { name: "organization_id", type: "STRING" },
  { name: "organization_name", type: "STRING" },
  { name: "account_number", type: "STRING" },
  { name: "account_name", type: "STRING" },
  { name: "field", type: "STRING", mode: "REQUIRED" },
  { name: "old_value", type: "STRING" },
  { name: "new_value", type: "STRING" },
  { name: "changed_by", type: "STRING" },
  { name: "changed_at", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "source", type: "STRING" },
];

/**
 * Comments on titles and rows. Append-only: every change (post, delete) appends the comment's
 * new version; the latest row per comment_id is the current state.
 */
export const COMMENTS_TABLE = "SEG_COMMENTS";
export const COMMENTS_SCHEMA: BqField[] = [
  { name: "comment_id", type: "STRING", mode: "REQUIRED" },
  { name: "version_at", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "isbn", type: "STRING", mode: "REQUIRED" },
  { name: "thread_key", type: "STRING", mode: "REQUIRED" },
  { name: "level", type: "STRING", mode: "REQUIRED" },
  { name: "distribution_channel", type: "STRING" },
  { name: "distribution_channel_name", type: "STRING" },
  { name: "organization_id", type: "STRING" },
  { name: "organization_name", type: "STRING" },
  { name: "account_number", type: "STRING" },
  { name: "account_name", type: "STRING" },
  { name: "body", type: "STRING" },
  /** Comma-separated e-mails of mentioned users. */
  { name: "mentions", type: "STRING" },
  { name: "author_email", type: "STRING" },
  { name: "author_name", type: "STRING" },
  { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
  { name: "deleted_at", type: "TIMESTAMP" },
];

/** Precomputed outputs of the ingestion SQL (in the app dataset). */
export const FACTS_TABLE = "SEG_TITLE_ACCOUNT_FACTS";
export const STATS_TABLE = "SEG_TITLE_STATS";
/** Latest value per estimate level and field, for Power BI. */
export const CURRENT_ESTIMATES_VIEW = "SEG_ESTIMATES_CURRENT";

const q = (cfg: BigQueryConfig, dataset: "source" | "app", table: string) =>
  `\`${cfg.projectId}.${dataset === "source" ? cfg.sourceDataset : cfg.appDataset}.${table}\``;

/** Legacy transformation of ACCOUNT_STORE into BIL_CUSTOMERS.STORE_ID. */
const STORE_ID_FROM_ACCOUNT_STORE = `CONCAT(IF(LENGTH(ACCOUNT_STORE) > 5, SUBSTR(ACCOUNT_STORE, 1, LENGTH(ACCOUNT_STORE) - 5) || '_', ''), SUBSTR(ACCOUNT_STORE, -5))`;

/**
 * Per title and account figures for EVERY title, in one pass.
 * Ports the legacy per-ISBN "first query" (initial orders) and "comp title query"
 * (gross, net, ReaderLink POS) so the app never runs BigQuery while a user waits.
 */
export function buildFactsSql(cfg: BigQueryConfig): string {
  const src = (t: string) => q(cfg, "source", t);
  return `
CREATE OR REPLACE TABLE ${q(cfg, "app", FACTS_TABLE)}
CLUSTER BY ISBN AS
WITH
ACCOUNT AS (
  SELECT DISTINCT
    NULLIF(TRIM(DISTRIBUTION_CHANNEL), '') AS DISTRIBUTION_CHANNEL,
    NULLIF(TRIM(DISTRIBUTION_CHANNEL_NAME), '') AS DISTRIBUTION_CHANNEL_NAME,
    NULLIF(TRIM(ORGANIZATION_ID), '') AS ORGANIZATION_ID,
    NULLIF(TRIM(ORG_NAME), '') AS ORG_NAME,
    NULLIF(TRIM(ACCOUNT_NBR), '') AS ACCOUNT_NBR,
    NULLIF(TRIM(ACCOUNT_NAME), '') AS ACCOUNT_NAME,
    STORE_ID
  FROM ${src("BIL_CUSTOMERS")}
),
BOOK AS (
  SELECT
    TRIM(EAN) AS EAN,
    SAFE_CAST(NULLIF(TRIM(PUB_DATE), '') AS DATE) AS PUB_DATE,
    SAFE_CAST(SPLIT(TRIM(SEASON), ' ')[SAFE_OFFSET(1)] AS INT64) AS SEASON_YEAR
  FROM ${src("BIL_BOOKATTRIBUTES")}
  WHERE EAN IS NOT NULL AND TRIM(EAN) <> '' AND EAN NOT LIKE 'EISBN%'
),
LATEST_FILE AS (
  SELECT MAX(DATE(FILEDATE)) AS latest_filedate FROM ${src("DIL_HBG_ORDERS")}
),
OPEN_ORDERS AS (
  SELECT
    ${STORE_ID_FROM_ACCOUNT_STORE} AS STORE_ID,
    PARSE_DATE('%Y%m%d', ENTRY_DATE) AS EXACT_DATE,
    O.ISBN AS EISBN,
    SUM(CAST(O.QUANTITY AS NUMERIC)) AS UNITS
  FROM (
    SELECT O.*, ROW_NUMBER() OVER (PARTITION BY ISBN, REFERENCE_NBR ORDER BY FILEDATE DESC) AS rn
    FROM ${src("DIL_HBG_ORDERS")} O
    CROSS JOIN LATEST_FILE L
    WHERE LINE_STATUS != 'DELETED'
      AND DATE(O.FILEDATE) = L.latest_filedate
      AND (CANCEL_DATE = '' OR CANCEL_DATE IS NULL OR SAFE.PARSE_DATE('%Y%m%d', CANCEL_DATE) >= CURRENT_DATE())
  ) O
  WHERE O.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM ${src("DTL_HBG_FINAL")} B
      WHERE B.EISBN = O.ISBN AND ${STORE_ID_FROM_ACCOUNT_STORE} = B.STORE_ID
    )
  GROUP BY 1, 2, 3
),
ACTIVITY AS (
  SELECT STORE_ID, CAST(EXACT_DATE AS DATE) AS EXACT_DATE, EISBN, SALES_INDICATOR, 'SALES' AS SOURCE, CAST(SUM(UNITS) AS NUMERIC) AS UNITS
  FROM ${src("BIL_MF_FACT_SALES")}
  WHERE DATA_TYPE = 'Sales'
  GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT STORE_ID, EXACT_DATE, EISBN, 'Gross Sales', 'ORDER', UNITS FROM OPEN_ORDERS
),
ACCOUNT_ACTIVITY AS (
  SELECT
    A.DISTRIBUTION_CHANNEL, A.DISTRIBUTION_CHANNEL_NAME, A.ORGANIZATION_ID, A.ORG_NAME, A.ACCOUNT_NBR, A.ACCOUNT_NAME,
    X.EISBN,
    SUM(IF(X.SALES_INDICATOR = 'Gross Sales' AND X.EXACT_DATE < B.PUB_DATE, X.UNITS, 0)) AS INITIAL_ORDER,
    SUM(IF(X.SALES_INDICATOR = 'Gross Sales' AND X.SOURCE = 'SALES', X.UNITS, 0)) AS GROSS_UNITS,
    SUM(IF(X.SALES_INDICATOR = 'Net Sales' AND X.SOURCE = 'SALES', X.UNITS, 0)) AS NET_UNITS,
    LOGICAL_OR(X.SALES_INDICATOR = 'Gross Sales' AND X.EXACT_DATE < B.PUB_DATE) AS HAS_PREPUB
  FROM ACCOUNT A
  JOIN ACTIVITY X ON A.STORE_ID = X.STORE_ID
  JOIN BOOK B ON X.EISBN = B.EAN
  GROUP BY 1, 2, 3, 4, 5, 6, 7
),
PLACEHOLDER_BOOK AS (
  SELECT EAN FROM BOOK WHERE SEASON_YEAR >= ${Number(cfg.minSeasonYear)}
),
POPULAR AS (
  SELECT
    NULLIF(TRIM(P.DISTRIBUTION_CHANNEL), '') AS DISTRIBUTION_CHANNEL,
    NULLIF(TRIM(P.DISTRIBUTION_CHANNEL_NAME), '') AS DISTRIBUTION_CHANNEL_NAME,
    NULLIF(TRIM(P.ORGANIZATION_ID), '') AS ORGANIZATION_ID,
    NULLIF(TRIM(P.ORG_NAME), '') AS ORG_NAME,
    NULLIF(TRIM(P.ACCOUNT_NBR), '') AS ACCOUNT_NBR,
    NULLIF(TRIM(P.ACCOUNT_NAME), '') AS ACCOUNT_NAME,
    B.EAN AS EISBN
  FROM ${src("BIL_SEG_POPULAR_ACCOUNTS")} P
  CROSS JOIN PLACEHOLDER_BOOK B
),
RL_CHAIN AS (
  SELECT DISTINCT
    NULLIF(TRIM(DISTRIBUTION_CHANNEL), '') AS DISTRIBUTION_CHANNEL,
    NULLIF(TRIM(DISTRIBUTION_CHANNEL_NAME), '') AS DISTRIBUTION_CHANNEL_NAME,
    ORGANIZATION_ID, ORG_NAME,
    CHAIN_ID AS ACCOUNT_NBR,
    MASTER_CHAIN AS ACCOUNT_NAME,
    MASTER_CHAIN
  FROM ${src("BIL_READERLINK_CHAIN")}
  WHERE ORGANIZATION_ID = '90001368'
),
RL_PLACEHOLDERS AS (
  SELECT C.* EXCEPT (MASTER_CHAIN), B.EAN AS EISBN FROM RL_CHAIN C CROSS JOIN PLACEHOLDER_BOOK B
),
RL_POS AS (
  SELECT C.* EXCEPT (MASTER_CHAIN), P.ITEM_NUMBER AS EISBN, SUM(CAST(P.UNITS AS NUMERIC)) AS READERLINK_POS
  FROM ${src("BIL_READERLINK_POS")} P
  JOIN RL_CHAIN C ON P.MASTER_CHAIN = C.MASTER_CHAIN
  GROUP BY 1, 2, 3, 4, 5, 6, 7
),
UNIONED AS (
  SELECT DISTRIBUTION_CHANNEL, DISTRIBUTION_CHANNEL_NAME, ORGANIZATION_ID, ORG_NAME, ACCOUNT_NBR, ACCOUNT_NAME, EISBN,
    INITIAL_ORDER, GROSS_UNITS, NET_UNITS, CAST(0 AS NUMERIC) AS READERLINK_POS, HAS_PREPUB AS IN_TITLE_LIST, TRUE AS IN_COMP_LIST
  FROM ACCOUNT_ACTIVITY
  UNION ALL
  SELECT *, CAST(0 AS NUMERIC), CAST(0 AS NUMERIC), CAST(0 AS NUMERIC), CAST(0 AS NUMERIC), TRUE, FALSE FROM POPULAR
  UNION ALL
  SELECT *, CAST(0 AS NUMERIC), CAST(0 AS NUMERIC), CAST(0 AS NUMERIC), CAST(0 AS NUMERIC), TRUE, FALSE FROM RL_PLACEHOLDERS
  UNION ALL
  SELECT DISTRIBUTION_CHANNEL, DISTRIBUTION_CHANNEL_NAME, ORGANIZATION_ID, ORG_NAME, ACCOUNT_NBR, ACCOUNT_NAME, EISBN,
    CAST(0 AS NUMERIC), CAST(0 AS NUMERIC), CAST(0 AS NUMERIC), READERLINK_POS, FALSE, TRUE
  FROM RL_POS
)
SELECT
  EISBN AS ISBN,
  DISTRIBUTION_CHANNEL, DISTRIBUTION_CHANNEL_NAME, ORGANIZATION_ID, ORG_NAME, ACCOUNT_NBR, ACCOUNT_NAME,
  CAST(ROUND(SUM(INITIAL_ORDER)) AS INT64) AS INITIAL_ORDER,
  CAST(ROUND(SUM(GROSS_UNITS)) AS INT64) AS GROSS_UNITS,
  CAST(ROUND(SUM(NET_UNITS)) AS INT64) AS NET_UNITS,
  CAST(ROUND(SUM(READERLINK_POS)) AS INT64) AS READERLINK_POS,
  LOGICAL_OR(IN_TITLE_LIST) AS IN_TITLE_LIST,
  LOGICAL_OR(IN_COMP_LIST) AS IN_COMP_LIST
FROM UNIONED
WHERE EISBN IS NOT NULL
GROUP BY 1, 2, 3, 4, 5, 6, 7
`;
}

/** Title-level stats: LTD gross units, BookScan LTD and eBook sales (legacy definitions). */
export function buildStatsSql(cfg: BigQueryConfig): string {
  const src = (t: string) => q(cfg, "source", t);
  return `
CREATE OR REPLACE TABLE ${q(cfg, "app", STATS_TABLE)} AS
WITH
BOOK AS (
  SELECT TRIM(EAN) AS EAN, NULLIF(TRIM(EBOOK_ISBN), '') AS EBOOK_ISBN
  FROM ${src("BIL_BOOKATTRIBUTES")}
  WHERE EAN IS NOT NULL AND TRIM(EAN) <> ''
),
GROSS AS (
  SELECT EISBN, SALES_TYPE, SUM(UNITS) AS UNITS
  FROM ${src("BIL_MF_FACT_SALES")}
  WHERE DATA_TYPE = 'Sales' AND SALES_INDICATOR = 'Gross Sales'
  GROUP BY 1, 2
),
LTD AS (
  SELECT EISBN, SUM(UNITS) AS UNITS FROM GROSS GROUP BY 1
),
EBOOK AS (
  SELECT B.EBOOK_ISBN, SUM(G.UNITS) AS UNITS
  FROM BOOK B JOIN GROSS G ON G.EISBN = B.EAN
  WHERE G.SALES_TYPE = 'ESales' AND B.EBOOK_ISBN IS NOT NULL
  GROUP BY 1
),
NPD AS (
  SELECT ISBN, PARSE_DATE('%Y%m%d', DATE) AS D, SAFE_CAST(YTD AS FLOAT64) AS YTD
  FROM ${src("BIL_BOOKSCAN_NPD")}
),
NPD_YEAR_END AS (
  SELECT ISBN, SUM(YTD) AS YTD
  FROM (
    SELECT ISBN, D, YTD, MAX(D) OVER (PARTITION BY ISBN, EXTRACT(YEAR FROM D)) AS MAX_D FROM NPD
  )
  WHERE D = MAX_D
  GROUP BY 1
),
NPD_TOP100 AS (
  SELECT ISBN, SUM(SAFE_CAST(LTD_2022 AS FLOAT64)) AS LTD FROM ${src("BIL_BOOKSCAN_NPD_TOP100")} GROUP BY 1
)
SELECT
  B.EAN AS ISBN,
  CAST(ROUND(L.UNITS) AS INT64) AS LTD_GROSS_UNITS,
  CAST(ROUND(IFNULL(Y.YTD, 0) + IFNULL(T.LTD, 0)) AS INT64) AS BOOKSCAN_LTD,
  (Y.ISBN IS NOT NULL OR T.ISBN IS NOT NULL) AS HAS_BOOKSCAN,
  CAST(ROUND(E.UNITS) AS INT64) AS EBOOK_UNITS
FROM BOOK B
LEFT JOIN LTD L ON L.EISBN = B.EAN
LEFT JOIN NPD_YEAR_END Y ON Y.ISBN = B.EAN
LEFT JOIN NPD_TOP100 T ON T.ISBN = B.EAN
LEFT JOIN EBOOK E ON E.EBOOK_ISBN = B.EBOOK_ISBN
`;
}

/** Catalog columns read by ingestion. */
export function buildTitlesSql(cfg: BigQueryConfig): string {
  const cols = SOURCE_TABLES.BIL_BOOKATTRIBUTES!.map((f) => f.name).join(", ");
  return `SELECT ${cols} FROM ${q(cfg, "source", "BIL_BOOKATTRIBUTES")} WHERE EAN IS NOT NULL AND TRIM(EAN) <> ''`;
}

/** Valid channel/org/account combinations (customers plus ReaderLink chains). */
export function buildAccountsSql(cfg: BigQueryConfig): string {
  const src = (t: string) => q(cfg, "source", t);
  return `
SELECT DISTINCT DISTRIBUTION_CHANNEL, DISTRIBUTION_CHANNEL_NAME, ORGANIZATION_ID, ORG_NAME, ACCOUNT_NBR, ACCOUNT_NAME
FROM ${src("BIL_CUSTOMERS")}
UNION DISTINCT
SELECT DISTRIBUTION_CHANNEL, DISTRIBUTION_CHANNEL_NAME, ORGANIZATION_ID, ORG_NAME, CHAIN_ID, MASTER_CHAIN
FROM ${src("BIL_READERLINK_CHAIN")}
WHERE ORGANIZATION_ID = '90001368'
`;
}

/** Power BI view: latest value per title, level, combination and field. */
export function buildCurrentEstimatesViewSql(cfg: BigQueryConfig): string {
  return `
CREATE OR REPLACE VIEW ${q(cfg, "app", CURRENT_ESTIMATES_VIEW)} AS
WITH LATEST AS (
  SELECT * EXCEPT (rn) FROM (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY isbn, level, distribution_channel, distribution_channel_name, organization_id, organization_name, account_number, account_name, field
      ORDER BY changed_at DESC, event_id DESC
    ) AS rn
    FROM ${q(cfg, "app", ESTIMATE_EVENTS_TABLE)}
  ) WHERE rn = 1
)
SELECT
  isbn, level,
  distribution_channel, distribution_channel_name, organization_id, organization_name, account_number, account_name,
  SAFE_CAST(MAX(IF(field = 'laydownGoal', new_value, NULL)) AS INT64) AS laydown_goal,
  SAFE_CAST(MAX(IF(field = 'laydownEstimate', new_value, NULL)) AS INT64) AS laydown_estimate,
  SAFE_CAST(MAX(IF(field = 'sixMonthEstimate', new_value, NULL)) AS INT64) AS six_month_estimate,
  MAX(IF(field = 'salesNotes', new_value, NULL)) AS sales_notes,
  MAX(IF(field = 'compIsbn', new_value, NULL)) AS comp_isbn,
  MAX(IF(field = 'titleNotes', new_value, NULL)) AS title_notes,
  MAX(changed_at) AS updated_at,
  ARRAY_AGG(changed_by ORDER BY changed_at DESC LIMIT 1)[OFFSET(0)] AS updated_by
FROM LATEST
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
`;
}

/** Schema object for creating a table with the BigQuery client. */
export const tableSchema = (fields: BqField[]) => ({
  fields: fields.map((f) => ({ name: f.name, type: f.type, mode: f.mode ?? "NULLABLE" })),
});

/** Latest version of every comment (for restoring MongoDB from BigQuery). */
export function buildCurrentCommentsSql(cfg: BigQueryConfig): string {
  return `
SELECT * EXCEPT (rn) FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY comment_id ORDER BY version_at DESC) AS rn
  FROM ${q(cfg, "app", COMMENTS_TABLE)}
) WHERE rn = 1
`;
}
