# Data contract

How every field the app shows or stores maps to BigQuery and to the legacy app.
When the live schema is available, compare it column by column with this file and
`SOURCE_TABLES` in `packages/data/src/bigquery.ts`.

## Titles (`titles` collection ← `BIL_BOOKATTRIBUTES`)

| App field | Source column | Legacy Mongo (`bookattributes`) | Notes |
|---|---|---|---|
| `isbn` / `_id` | `EAN` | `EAN` | 13-digit EAN; legacy keyed titles by Mongo `_id` (segId) |
| `title` | `FULL_TITLE` | same | |
| `author` | `AUTHOR_1` | same | |
| `season` | `SEASON` | same | "Spring 2026" / "Fall 2026" |
| `division` | `GROUP_1` | same | |
| `imprint` | `TESTIMPRINTFROMHNA` | same | |
| `format` / `ipmFormat` | `FORMAT` / `IPM_FORMAT` | same | scope: IPM HC/PB/BB; FORMAT not ARC/Catalog/*Display* |
| `usPrice` | `US_PRICE` | same | |
| `pubDate` / `releaseDate` | `PUB_DATE` / `RELEASE_DATE` | same | normalized to YYYY-MM-DD |
| `paperCutOff` / `ldc` | `PAPER_CUT_OFF` / `LDC` | same | legacy text "M/D/YYYY 12:00:00 AM" |
| `pages` | `PAGES` | same | |
| `trim` | `TRIMLENGTH` x `TRIMWIDTH` | same | |
| `printRun` | `PRINT_RUN` | same | |
| `announcedPrinting` | `ANNOUNCED_1ST_PRINTING__BEST` | same | "AFPt" in legacy UI |
| `competitiveTitles` | `COMPETITIVE_TITLES` | same | comma-separated EANs |
| `ebookIsbn` | `EBOOK_ISBN` | same | |
| `stats.ltdGrossUnits` | `SEG_TITLE_STATS.LTD_GROSS_UNITS` | BQ query `ltdGross` | gross units, `BIL_MF_FACT_SALES` |
| `stats.bookscanLtd` | `SEG_TITLE_STATS.BOOKSCAN_LTD` | BQ query on `BIL_BOOKSCAN_NPD(_TOP100)` | year-end YTD per year + TOP100 LTD |
| `stats.ebookUnits` | `SEG_TITLE_STATS.EBOOK_UNITS` | `getDigPos` | ESales gross units for the title's `EBOOK_ISBN` |
| `plan.compIsbn` | app | `dc_ots.eanSelectedValue` (book `_id`) | |
| `plan.titleNotes` | app | `dc_ots.Title` ("Title Notes") | |

## Title × account figures (`title_account_facts` ← `SEG_TITLE_ACCOUNT_FACTS`)

| App field | Source | Legacy |
|---|---|---|
| channel / org / account ids and names | `BIL_CUSTOMERS` (`DISTRIBUTION_CHANNEL[_NAME]`, `ORGANIZATION_ID`, `ORG_NAME`, `ACCOUNT_NBR`, `ACCOUNT_NAME`) and `BIL_READERLINK_CHAIN` (org 90001368) | same |
| `initialOrder` | gross sales before `PUB_DATE` (`BIL_MF_FACT_SALES`) + open orders (`DIL_HBG_ORDERS`, latest file, not deleted/cancelled, not in `DTL_HBG_FINAL`) | `units` |
| `grossUnits` / `netUnits` | `BIL_MF_FACT_SALES` gross / net, sales only | comp `compGross` / `compNet` |
| `readerlinkPos` | `BIL_READERLINK_POS` | comp `Cpos_LTD` |
| `inTitleList` | pre-pub activity, `BIL_SEG_POPULAR_ACCOUNTS`, ReaderLink chains | rows of the legacy "first query" |
| `inCompList` | any activity or ReaderLink POS | rows of the legacy "comp title query" |

Comparable-title columns show the comp title's facts (`initialOrder` → "Comp initial orders").

## Estimates (`estimates` ↔ `SEG_ESTIMATE_EVENTS`)

| App field | Level | Legacy `dc_ots` field | Legacy export / upload column |
|---|---|---|---|
| `laydownGoal` | channel / org / account | `main_pubgoal` / `org_pub_goal` / `pub_goal` | Laydown Goal |
| `laydownEstimate` | channel / org / account | `main_current_estimate` / `org_current_estimate` / `currEst` | Laydown Estimate |
| `sixMonthEstimate` | channel / org / account | `main_supplemental_estimate` / `org_supplemental_estimate` / `suppEst` | 6-month Estimate (incl Laydown) |
| `salesNotes` | channel / org / account | `main_sales_notes` / `org_sales_notes` / `sales_notes` | Sales Notes |

Legacy fields not carried over: `printmtdDate` / `main_print_meeting_date` (removed from the legacy UI),
`retPercentage`, `cpos4wkPOS`, `cpos8wkPOS` (never sourced — "TBD" in the legacy UI).

## BigQuery app tables

| Table | Written by | Purpose |
|---|---|---|
| `SEG_TITLE_ACCOUNT_FACTS` | ingestion SQL | read model input |
| `SEG_TITLE_STATS` | ingestion SQL | read model input |
| `SEG_ESTIMATE_EVENTS` | app write-back (append-only) | every edit, with who and when |
| `SEG_CHAT_ROOMS` | app write-back (append-only) | one row per chat room version; latest row per `room_id` is current. Created automatically on first write |
| `SEG_CHAT_MESSAGES` | app write-back (append-only) | one row per chat message version (posted, edited, deleted). Created automatically on first write |
| `SEG_COMMENTS` | app write-back (append-only) | one row per comment version (posted, deleted); latest row per `comment_id` is current. Created automatically on first write |
| `SEG_ESTIMATES_CURRENT` (view) | — | latest value per title / level / combination / field, for Power BI |
