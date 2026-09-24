/**
 * SEG Product guide — the product description and user guide shown in the admin console
 * (and downloadable as a PDF).
 *
 * Written by hand on purpose: it is NOT regenerated when the app changes. Update it (and bump
 * GUIDE.version / GUIDE.updated, and add a release-notes entry) only when asked to.
 *
 * Text may use **bold** for emphasis.
 */

export type GuideBlock =
  | { t: "p"; text: string }
  | { t: "h"; text: string }
  | { t: "list"; items: string[] }
  | { t: "steps"; items: string[] }
  | { t: "tip"; text: string; tone?: "tip" | "note" | "warn" }
  | { t: "table"; head: string[]; rows: string[][] };

export interface GuideSection {
  id: string;
  title: string;
  /** Part of the guide the section belongs to (table of contents grouping). */
  part: string;
  blocks: GuideBlock[];
}

export const GUIDE = {
  title: "SEG — Seasonal Estimate Grid",
  subtitle: "Product guide and user manual",
  version: "1.0",
  updated: "2026-09-24",
};

export const GUIDE_SECTIONS: GuideSection[] = [
  /* ============================ Introduction ============================ */
  {
    id: "about",
    part: "Introduction",
    title: "What SEG is",
    blocks: [
      {
        t: "p",
        text: "SEG — the **Seasonal Estimate Grid** — is where Abrams plans every front-list launch. For each title it brings together the initial orders already placed, the sales of a comparable title, and the team's **laydown goal**, **laydown estimate** and **6-month estimate**, broken down by **distribution channel → organization → account**.",
      },
      {
        t: "p",
        text: "SEG is a complete rebuild of the original SEG application. Every business rule of the original was kept; the application around it was redesigned for speed, teamwork and control.",
      },
      { t: "h", text: "What it gives the team" },
      {
        t: "list",
        items: [
          "**Speed** — nothing waits on BigQuery while you work. Figures are pre-computed every night, pages open immediately and totals recalculate as you type.",
          "**Working together** — several people can plan the same title at once, see each other's changes within seconds, never overwrite each other silently, and discuss numbers where they are (comments and team chat).",
          "**A clear daily focus** — My Desk lists what needs attention today: deadlines, titles below goal, titles without a comparable, changes by colleagues, mentions and admin-defined work groups.",
          "**Control** — administrators manage people, access, business rules, locks, data jobs, audit and communication from one console, without code changes.",
          "**Accountability** — every change is recorded with who, when, the old and the new value, and can be restored.",
        ],
      },
      { t: "h", text: "Screens at a glance" },
      {
        t: "table",
        head: ["Screen", "What it is for"],
        rows: [
          ["Sign-in", "Secure sign-in (demo accounts in the demo; company accounts in production)."],
          ["My Desk", "Home page: what needs your attention today, including your work groups."],
          ["Summary", "The whole in-scope catalog: filter, sort, search, export, upload and the meeting report."],
          ["Summary → Dashboard", "The season at a glance: goal vs estimate, coverage, trends, channel mix, movers."],
          ["Title workspace", "Plan one title: details, cover, comparable title and the estimates grid (with full screen)."],
          ["Ask Abrams", "Team chat, title conversations and the Abrams Assistant."],
          ["Admin console", "Everything administrators control, grouped in six modules (admins only)."],
        ],
      },
    ],
  },
  {
    id: "roles",
    part: "Introduction",
    title: "Roles and access",
    blocks: [
      {
        t: "table",
        head: ["Role", "Can do"],
        rows: [
          ["Viewer", "See everything they have access to; search, export and download reports. Cannot change estimates, notes or comparable titles."],
          ["Editor", "Everything a viewer can, plus enter estimates and notes, choose comparable titles, upload spreadsheets and comment."],
          ["Admin", "Everything an editor can, plus the Admin console. Admins always see every title."],
        ],
      },
      { t: "h", text: "Division and imprint access" },
      {
        t: "p",
        text: "By default everyone sees **all divisions and imprints (\\*)**. An admin can restrict a person to some divisions and/or imprints; that person then only **sees and changes** titles in those divisions/imprints — on My Desk, Summary, title pages, exports, search, the dashboard and the assistant. When both divisions and imprints are set, a title must match both.",
      },
      { t: "h", text: "When a title is read-only" },
      {
        t: "list",
        items: [
          "**View only** — you have the Viewer role.",
          "**Locked** — an admin locked the title or its season. The banner shows who locked it, when and why.",
          "**Maintenance** — an admin switched on maintenance mode; the banner shows their message. Admins can still make changes.",
          "**Outside your access** — the title is not in your divisions/imprints.",
        ],
      },
    ],
  },

  /* ============================ Using SEG ============================ */
  {
    id: "getting-started",
    part: "Using SEG",
    title: "Getting started",
    blocks: [
      { t: "h", text: "Signing in" },
      {
        t: "steps",
        items: [
          "Open SEG in your browser.",
          "Sign in with your account. In the demo, choose one of the demo accounts (Admin, Editor or Viewer) and press **Sign in**.",
          "You land on **My Desk**.",
        ],
      },
      {
        t: "p",
        text: "A sign-in lasts 12 hours by default (admins can change this). If an admin signs you out or deactivates your account, you are taken back to the sign-in page on your next click.",
      },
      { t: "h", text: "Finding your way around" },
      {
        t: "list",
        items: [
          "**Sidebar** — My Desk, Summary, Title workspace, Ask Abrams, Notifications and (admins) Admin console. **Collapse** makes it icon-only.",
          "**Search (Ctrl K)** — from any page, type an ISBN, title or author and press Enter to open the title. Older catalog titles are listed separately.",
          "**Title workspace** in the sidebar reopens the title you worked on last.",
          "**Notifications (bell)** — unread @mentions, replies and direct messages; click one to jump to the exact comment or conversation.",
          "**Theme** — Light, Dark or System, at the bottom of the sidebar (also on the sign-in page).",
          "**Banners** — announcements and maintenance notices from admins appear at the top of every page. Announcements can be dismissed.",
          "**Main menu** — a link back to the company BI portal, when an admin has set it.",
        ],
      },
    ],
  },
  {
    id: "my-desk",
    part: "Using SEG",
    title: "My Desk",
    blocks: [
      { t: "p", text: "My Desk is the home page. It answers \"what needs my attention today?\" with a set of lists, each shown as a card with a count and as a tab." },
      {
        t: "table",
        head: ["List", "What it contains"],
        rows: [
          ["Due soon", "Titles whose paper cut-off or LDC falls within the chosen window (7, 14 or 30 days) and that still miss a goal, estimate or 6-month estimate. Overdue titles (up to the look-back period) are flagged."],
          ["Below goal", "Titles whose laydown estimate is short of the laydown goal, biggest gap first, with the total units short."],
          ["No comparable", "Upcoming titles that still have no comparable title."],
          ["Changed by others", "Titles colleagues changed since you last opened them, with who and how many changes."],
          ["Mentions", "Unread @mentions and replies to you."],
          ["Work groups", "Extra tabs an admin set up for you — each a named collection of titles picked by rules (for example \"Spring 2027 · Adult Trade\")."],
        ],
      },
      { t: "h", text: "Using the lists" },
      {
        t: "list",
        items: [
          "**Division / Imprint** filters at the top narrow every list (they are remembered on your computer).",
          "**7 / 14 / 30 days** changes the Due soon window. The default is set by admins.",
          "Click a title to open it. **Work through these** opens the first title of the list; Previous / Next on the title page then follow that list.",
        ],
      },
      { t: "h", text: "Arranging your tabs" },
      {
        t: "list",
        items: [
          "**Drag** any tab — built-in or work group — to put it where you want. Your order is saved to your account and is the same on every computer.",
          "When there are more tabs than fit, **arrows** appear at the ends of the tab bar to scroll through them.",
          "The **reset** button next to the tabs restores the default order.",
        ],
      },
    ],
  },
  {
    id: "summary",
    part: "Using SEG",
    title: "Summary",
    blocks: [
      { t: "p", text: "The Summary lists every in-scope title you have access to, with its totals. Everything happens instantly in the browser." },
      {
        t: "list",
        items: [
          "**Search** by ISBN, title or author.",
          "**Filters**: Season, Division, Imprint, Format, Paper cut-off and LDC — each choice shows how many titles it leaves.",
          "**Totals strip** for the titles in view: number of titles (and how many have estimates), initial orders, laydown goal, laydown estimate, estimate vs goal.",
          "**Columns**: Title, Season, Initial orders, Laydown goal, Laydown estimate, Estimate vs goal, Division / Imprint, Format, Price, Pub date, Release date, Paper cut-off, LDC. Click a column header to sort.",
          "**Share a view**: filters and sorting are part of the page address — copy the address to send exactly what you see.",
          "Click a row to open the title (hovering pre-loads it).",
        ],
      },
    ],
  },
  {
    id: "dashboard",
    part: "Using SEG",
    title: "Summary → Dashboard",
    blocks: [
      { t: "p", text: "Switch the Summary from **Table** to **Dashboard** to see the titles currently filtered as charts." },
      {
        t: "list",
        items: [
          "**Headline indicators** — share of titles with an estimate, share with a comparable, estimate as % of goal, estimate ÷ initial orders, deadlines at risk.",
          "**Laydown goal vs estimate** by season, division, imprint or format.",
          "**Estimate coverage** — complete, partial or not started.",
          "**Week by week** — goal, estimate and 6-month totals over the last 12 weeks.",
          "**Channel mix** — initial orders, goal and estimate by distribution channel.",
          "**Biggest movers this week**, **titles publishing in the next six months** and **laydown estimate furthest below goal** — click a title to open it.",
        ],
      },
    ],
  },
  {
    id: "exports",
    part: "Using SEG",
    title: "Exports, uploads and the meeting report",
    blocks: [
      { t: "h", text: "Exporting" },
      {
        t: "list",
        items: [
          "**Export → Summary** — Excel file, one row per title in the current view.",
          "**Export → Account details** (Excel or CSV) — every channel, organization and account of the titles in view, in the **upload layout**, so you can edit in Excel and upload it back.",
        ],
      },
      { t: "h", text: "Uploading estimates from a spreadsheet" },
      {
        t: "steps",
        items: [
          "Export **Account details** for the titles you want to plan, and fill in Laydown Goal, Laydown Estimate, 6-month Estimate and Sales Notes in Excel.",
          "On the Summary, press **Upload** and choose the file (.xlsx, .xls or .csv — every sheet is read).",
          "Check the **preview**: every value that will change, title by title, and any rows SEG cannot use, with the reason.",
          "Choose whether to **overwrite** cells a colleague changed after your export (off by default — those are shown as conflicts instead).",
          "Press **Save**. The result shows how many values changed, and any titles or cells that were refused.",
        ],
      },
      {
        t: "list",
        items: [
          "**Required columns**: ISBN, DISTRIBUTION CHANNEL, DISTRIBUTION CHANNEL NAME, Organization Name, Organization ID, Account Name, Account ID, Sales Notes, Laydown Goal, Laydown Estimate, 6-month Estimate (incl Laydown).",
          "**Blank cells keep** the current value. Numbers are rounded to whole units; text in a number column is reported as an error.",
          "Rows labelled **Total Organizations / Total Accounts** set channel-level values; **All Accounts** rows set organization-level values; other rows set account values. A new account must exist in the account catalog.",
          "Uploaded values appear in each title's history as coming from an upload, and every upload is listed in the admin Upload log.",
        ],
      },
      { t: "tip", tone: "note", text: "Locked titles, titles outside your access and maintenance mode are respected by uploads exactly as in the grid." },
      { t: "h", text: "Meeting report (PDF)" },
      {
        t: "p",
        text: "**Export → Meeting report** creates a PDF for the titles in view: a cover page with totals and a title index, then one section per title with its details, comparable title and the channel table. The text stays sharp at any zoom.",
      },
    ],
  },
  {
    id: "title-workspace",
    part: "Using SEG",
    title: "Title workspace",
    blocks: [
      { t: "h", text: "Header and totals" },
      {
        t: "list",
        items: [
          "Season, format and division badges; author; ISBN (click to copy); imprint; who updated the title last.",
          "Five totals that update as you type: **Initial orders**, **Laydown goal**, **Laydown estimate** (with % of goal), **6-month estimate** (including laydown) and **Estimate vs goal**.",
          "**Previous / Next** (or **Alt ← / Alt →**) move through the list you came from, shown as \"12 of 570\".",
          "**Comments**, **History** and **Share** (to Ask Abrams) buttons, and the save status.",
        ],
      },
      { t: "h", text: "Title details, cover and notes" },
      {
        t: "list",
        items: [
          "**Title details**: pub date, release date, paper cut-off, LDC, US price, pages, trim, print run, 1st printing (AFPt), eBook ISBN, LTD sales and eBook sales, plus links to competitive titles.",
          "**Cover** — the title's cover image; if there is none, a \"No cover available\" panel is shown. Click the cover to open it full size.",
          "**Title notes** — a note for the whole title, saved automatically (the box scrolls for long notes).",
        ],
      },
      { t: "h", text: "Comparable title" },
      {
        t: "steps",
        items: [
          "Press **Choose title** (or **Change**) in the Comparable title panel.",
          "Search by ISBN, title or author (eBooks, catalogs and displays are left out) and pick a title.",
          "Its figures appear next to every account in the grid: initial orders, gross sales, net sales and LTD point-of-sale. The panel shows its LTD, eBook and BookScan sales and key dates.",
        ],
      },
      { t: "p", text: "Removing a comparable title (×) offers **Undo** for a few seconds." },
    ],
  },
  {
    id: "grid",
    part: "Using SEG",
    title: "The estimates grid",
    blocks: [
      {
        t: "p",
        text: "The grid lists **Channel → Organization → Account** with the title's figures on the left (\"This title\") and the comparable title's on the right. Editable columns (pencil icon) are Laydown goal, Laydown estimate, 6-month estimate and Sales notes.",
      },
      { t: "h", text: "Entering numbers" },
      {
        t: "list",
        items: [
          "Click a cell and **type** — the number replaces the value. **Enter** or **F2** (or double-click) edits the existing value.",
          "**Tab / Enter / arrow keys** save the cell and move on. While editing an existing value, ← and → first move the cursor and leave the cell at the start or end of the text.",
          "**Delete** clears a cell. **Esc** cancels the current edit.",
          "**Paste** a block copied from Excel (Ctrl V) to fill many cells at once.",
          "Estimates are whole numbers of 0 or more; commas are allowed.",
        ],
      },
      { t: "h", text: "How totals work" },
      {
        t: "list",
        items: [
          "A number typed on a **channel** or **organization** row replaces the total of the rows below it.",
          "Otherwise that row shows the **sum** of the rows below, in grey italics.",
          "**0 is a value** (it counts in totals); an empty cell means \"no estimate\".",
          "Mass Merchandise and Independent Retail open down to individual accounts; other channels stop at organization (admins can change which channels do this).",
        ],
      },
      { t: "h", text: "Rows" },
      {
        t: "list",
        items: [
          "The grid shows the title's accounts, the comparable title's accounts and any row that has a saved estimate.",
          "**+ Add account** adds any valid channel / organization / account combination from the account catalog.",
          "**Find**, **Expand all** and **Collapse all** help in large grids; the first column and the \"All channels\" total stay in view while scrolling.",
        ],
      },
      { t: "h", text: "Full-screen grid" },
      {
        t: "list",
        items: [
          "Press **Full screen** in the grid toolbar to use the whole screen for data entry. Expanded rows and your position are kept.",
          "The full-screen header keeps Previous / Next (staying in full screen), the title, live totals, who else is here, the comparable title with **Change**, and the save status. The toolbar keeps Find, Expand / Collapse, Undo / Redo and **+ Add account**.",
          "Press **Esc** or **Exit full screen** to return.",
        ],
      },
    ],
  },
  {
    id: "saving",
    part: "Using SEG",
    title: "Saving, undo and history",
    blocks: [
      {
        t: "list",
        items: [
          "**Autosave** — there is no Save button. Changes are sent within a second; the status shows \"Saving…\" and then \"Saved\". If the connection drops, SEG keeps your changes and retries.",
          "**Undo / Redo** — Ctrl Z / Ctrl Y (or the arrows in the toolbar). Undone values are saved like any other change.",
          "**History** — the History button in the header lists every change on the title: who, when, old and new value, and where it came from (grid, upload, restore or admin action).",
          "**Restore** — any earlier value can be put back from the history with one click.",
        ],
      },
    ],
  },
  {
    id: "teamwork",
    part: "Using SEG",
    title: "Working together",
    blocks: [
      { t: "h", text: "Live teamwork" },
      {
        t: "list",
        items: [
          "The avatars in the header show who else has the title open. A coloured outline shows the cell someone is editing.",
          "Changes others save appear within a few seconds and flash briefly.",
        ],
      },
      { t: "h", text: "Conflicts" },
      {
        t: "p",
        text: "If you change a cell that someone else changed since you loaded it, SEG does not overwrite their value. The cell shows who changed it, when and to what, and you choose **Keep mine** or **Use theirs**.",
      },
      { t: "h", text: "Comments" },
      {
        t: "steps",
        items: [
          "Press **Comments** in the header (whole title) or the comment icon on a row (that row).",
          "Write your comment; type **@** to mention someone — they are notified.",
          "Reply to keep the conversation in one thread. Rows with comments show a count.",
        ],
      },
    ],
  },
  {
    id: "ask-abrams",
    part: "Using SEG",
    title: "Ask Abrams — chat and assistant",
    blocks: [
      { t: "h", text: "Team chat" },
      {
        t: "list",
        items: [
          "**Everyone** — a channel for the whole team.",
          "**Groups** — create a group, name it and choose its members (rename and change members later).",
          "**Direct messages** — one-to-one conversations.",
          "Type **@** to mention someone; type an **ISBN** to link the title.",
          "Edit or delete your own messages; **report** a message to the admins if something is not right.",
          "**Title conversations** lists the comment threads you take part in, next to your chats.",
        ],
      },
      { t: "h", text: "The chat button on every page" },
      {
        t: "list",
        items: [
          "The round **Ask Abrams** button (bottom-right, or **Alt A**) shows unread messages and opens a chat panel with up to two conversation windows.",
          "**Share** on a title page starts a message that links the title.",
          "Optional **desktop alerts** use your browser's own notifications (turn on with the bell in the panel).",
        ],
      },
      { t: "h", text: "The Abrams Assistant" },
      { t: "p", text: "The assistant answers questions from SEG's own data — nothing leaves the system and no AI service is used. Try:" },
      {
        t: "table",
        head: ["Ask", "You get"],
        rows: [
          ["What's due this week? · What's due in 30 days?", "Titles with deadlines in that window and what they miss."],
          ["Titles below goal", "The biggest gaps between goal and estimate."],
          ["No comparable title", "Upcoming titles without a comparable."],
          ["What changed?", "Titles colleagues changed since your last visit."],
          ["My mentions", "Your unread mentions and replies."],
          ["An ISBN or a title name", "Its key numbers, comparable title and a link to open it."],
          ["Who changed 978…?", "The latest changes on that title."],
          ["A season, division, imprint or format (e.g. \"Fall 2026\")", "A summary of that group of titles."],
        ],
      },
    ],
  },

  /* ============================ Administration ============================ */
  {
    id: "admin-overview",
    part: "Administration",
    title: "Admin console overview",
    blocks: [
      {
        t: "p",
        text: "Admins open the **Admin console** from the sidebar. The overview shows one card per module with its current status; the left menu lists every page, and **Find a setting** searches them.",
      },
      {
        t: "list",
        items: [
          "Every setting's default is the original SEG behaviour — nothing changes until an admin changes it.",
          "Most pages edit a draft: changed settings are marked **Changed**, and **Save changes** / **Discard** appear at the bottom.",
          "Saved changes reach every open browser within about a minute and are recorded in **Admin changes**.",
        ],
      },
    ],
  },
  {
    id: "admin-people",
    part: "Administration",
    title: "People and access",
    blocks: [
      { t: "h", text: "Users" },
      {
        t: "list",
        items: [
          "**Add user** — name, work e-mail and role. In the demo a one-time password is shown once; in production people sign in with their company account.",
          "Change a role from the list; use **⋯** to deactivate / reactivate, **sign out everywhere** or reset a password (demo).",
          "SEG always keeps at least one active admin, and admins cannot deactivate themselves or remove their own admin role.",
        ],
      },
      { t: "h", text: "Access by division / imprint" },
      {
        t: "steps",
        items: [
          "Press **Add person**, choose the person, then tick the divisions and/or imprints they may see.",
          "Save. The person now sees and changes only those titles (within seconds, no sign-out needed).",
          "**Edit** changes their access; **Remove** gives them all divisions and imprints (\\*) again.",
        ],
      },
      { t: "h", text: "Sessions" },
      { t: "p", text: "Lists everyone signed in: device, sign-in time, last activity and expiry. Sign someone out on one device or everywhere, and set how long a sign-in lasts (default 12 hours)." },
      { t: "h", text: "Demo accounts" },
      { t: "p", text: "Allow or block the demo logins and hide the demo panel on the sign-in page. Turning demo logins off requires a non-demo admin, so nobody is locked out." },
    ],
  },
  {
    id: "admin-planning",
    part: "Administration",
    title: "Planning controls",
    blocks: [
      { t: "h", text: "Season and title locks" },
      {
        t: "steps",
        items: [
          "Choose **Season** or **Title**, pick it, and add an optional note (for example \"Final numbers sent to finance\").",
          "Press **Lock**. The season or title is read-only for everyone, including admins, and people see the note.",
          "To unlock, press **Unlock** and give a reason (kept in Admin changes).",
        ],
      },
      { t: "h", text: "Business rules" },
      {
        t: "list",
        items: [
          "**Which titles are in SEG**: first season year, seasons in scope, formats in scope (IPM), excluded formats, excluded format words, and whether a title needs a division and an imprint. **Preview the effect** shows how many titles would come in or drop out before saving.",
          "**Account-level channels**: which channels open down to individual accounts.",
          "**Comparable titles**: which formats and format words the comparable search leaves out.",
          "**Notes**: maximum length of sales notes and title notes.",
          "Saving applies the rules to every title (a new first season year also re-reads BigQuery). The fixed calculation rules are listed read-only.",
        ],
      },
      { t: "h", text: "Work groups" },
      {
        t: "steps",
        items: [
          "Press **New group** and give it a name — this is the tab label people see on My Desk.",
          "Choose who sees it: specific people, or **Everyone**.",
          "Add rules and choose whether titles must match **all rules** or **any rule**. The preview shows the matching titles as you go.",
          "Press **Create group**. Each chosen person gets the tab on My Desk.",
        ],
      },
      {
        t: "table",
        head: ["Rule on", "Conditions"],
        rows: [
          ["Season, Division, Imprint, Format, Author", "is one of / is not one of (values from the data)"],
          ["Pub date, Release date, Paper cut-off, LDC", "in the next … days, in the last … days, between, before, after, is set, is not set"],
          ["US price, Initial orders, Laydown goal, Laydown estimate, 6-month estimate", "at least, at most, between, is set, is not set"],
          ["Has a comparable title, Missing estimates, Below goal", "Yes / No"],
        ],
      },
      { t: "h", text: "My Desk defaults" },
      { t: "p", text: "The due-soon window (default 14 days), the overdue look-back (default 14 days) and the below-goal threshold (default 0%)." },
      { t: "h", text: "Account catalog" },
      { t: "p", text: "Search every valid channel / organization / account, see counts per channel (and which open to accounts), and when the catalog was last refreshed." },
      { t: "h", text: "Bulk actions" },
      {
        t: "list",
        items: [
          "**Clear estimates** for one title (ISBN) or a whole season, for the fields you tick.",
          "**Copy from another title** to one or more ISBNs — fill blanks only, or replace.",
          "Always **Preview** first; **Apply** then saves through the normal path (history, restore). Locked titles are skipped.",
        ],
      },
    ],
  },
  {
    id: "admin-data",
    part: "Administration",
    title: "Data and jobs",
    blocks: [
      {
        t: "list",
        items: [
          "**Data refresh** — the last run of each job (data refresh from BigQuery, write-back, trends, apply business rules) with duration, counts and errors. **Run now** starts one immediately.",
          "**BigQuery sync health** — how many changes wait to reach BigQuery, the oldest one, the last successful send and the last error. **Send now** retries.",
          "**Job history** — every run, filterable by job, and how long history, the sign-in log and assistant questions are kept (defaults 90, 180 and 90 days).",
          "**Demo reset** (demo only) — clears test chat and comments, and can reload estimates from BigQuery.",
        ],
      },
    ],
  },
  {
    id: "admin-audit",
    part: "Administration",
    title: "Audit and oversight",
    blocks: [
      {
        t: "list",
        items: [
          "**Activity log** — every change across all titles; filter by person, date range, season, field, source and ISBN; **Export CSV**.",
          "**Upload log** — each spreadsheet upload: who, file, rows, titles, values changed and problems.",
          "**Sign-in log** — successful and failed sign-ins with reason, browser and address; failed sign-ins in the last 24 hours.",
          "**Admin changes** — every change made in the Admin console, in plain words.",
        ],
      },
    ],
  },
  {
    id: "admin-communication",
    part: "Administration",
    title: "Ask Abrams and communication",
    blocks: [
      {
        t: "list",
        items: [
          "**Chat moderation** — reported messages (remove or dismiss), every message with search, and every conversation (archive, restore or delete groups).",
          "**Announcements** — a banner at the top of every page (information, important or good news; optional start / end dates) or a message to **Everyone** from \"SEG Admin\".",
          "**Assistant settings** — turn the assistant on / off, its greeting and suggested questions; see what people ask, the answer rate and the most common unanswered questions.",
          "**Notification defaults** — notify on @mentions, replies and direct messages; offer desktop alerts.",
        ],
      },
    ],
  },
  {
    id: "admin-system",
    part: "Administration",
    title: "System",
    blocks: [
      {
        t: "list",
        items: [
          "**Feature switches** — turn the Dashboard, Ask Abrams, comments, live teamwork, uploads, exports and the meeting report on or off for everyone. Nothing is deleted; switching back on restores it.",
          "**Maintenance mode** — read-only for everyone except admins, with a banner and your message.",
          "**Branding and text** — app name, subtitle, sign-in headline and text, Main menu link; **Title covers** (on / off, cover address with {isbn}, and a preview for any ISBN).",
          "**Health** — version, environment, database and BigQuery connectivity, response times and record counts.",
          "**Product guide** — this guide, with search and a PDF download.",
        ],
      },
    ],
  },

  /* ============================ Reference ============================ */
  {
    id: "shortcuts",
    part: "Reference",
    title: "Keyboard shortcuts",
    blocks: [
      {
        t: "table",
        head: ["Keys", "Action"],
        rows: [
          ["Ctrl K", "Search titles from anywhere"],
          ["Alt A", "Open / close the Ask Abrams panel"],
          ["Alt ← / Alt →", "Previous / next title"],
          ["Type a number", "Replace the selected cell's value"],
          ["Enter or F2", "Edit the selected cell"],
          ["Arrows / Tab / Enter", "Move between cells (also saves the cell you are typing in)"],
          ["Delete", "Clear the selected cell"],
          ["Esc", "Cancel the edit · leave full screen"],
          ["Ctrl C / Ctrl V", "Copy a cell / paste a block from Excel"],
          ["Ctrl Z / Ctrl Y", "Undo / redo"],
        ],
      },
    ],
  },
  {
    id: "rules-reference",
    part: "Reference",
    title: "Business rules reference",
    blocks: [
      { t: "p", text: "Defaults — all of them the original SEG behaviour, and adjustable in Admin console → Business rules unless marked fixed." },
      {
        t: "table",
        head: ["Rule", "Default"],
        rows: [
          ["Seasons in scope", "Spring and Fall, from 2025"],
          ["Formats in scope (IPM)", "HC, PB, BB"],
          ["Excluded formats", "ARC, Catalog; any format containing \"Display\""],
          ["Title needs division / imprint", "Yes / Yes"],
          ["Channels with account-level detail", "MASSMER (Mass Merchandise), RETINDEP (Independent Retail)"],
          ["Comparable search leaves out", "EB (eBooks); formats containing \"catalog\" or \"display\""],
          ["Sales note / title note length", "2,000 / 4,000 characters"],
          ["Totals roll up (fixed)", "A level's own value wins; otherwise the sum of the level below (blanks ignored)"],
          ["Zero (fixed)", "0 is a real value; empty means no estimate"],
          ["Numbers (fixed)", "Whole numbers ≥ 0; commas allowed; decimals rounded"],
          ["Account identity (fixed)", "Channel, organization and account are matched by ID and name together"],
          ["Initial orders (fixed)", "Pre-publication gross sales plus open orders, without double counting invoiced orders"],
        ],
      },
    ],
  },
  {
    id: "data-security",
    part: "Reference",
    title: "Data, speed and security",
    blocks: [
      {
        t: "list",
        items: [
          "**BigQuery is the source of truth.** A scheduled job pre-computes the figures for all titles every night; SEG reads them from a fast working store, so no BigQuery query runs while you work.",
          "**Your changes** are saved field by field (two people editing different cells never overwrite each other), recorded as history events, and appended to BigQuery for Power BI.",
          "**Security is enforced on the server**: every request checks the session, role, access limits, locks, maintenance mode and feature switches.",
          "**Everything is audited**: data changes, uploads, sign-ins and admin actions.",
          "**No third-party services**: chat, the assistant, notifications and live updates run inside SEG; there are no external AI, messaging or tracking services.",
        ],
      },
    ],
  },
  {
    id: "faq",
    part: "Reference",
    title: "Troubleshooting and FAQ",
    blocks: [
      {
        t: "table",
        head: ["Question", "Answer"],
        rows: [
          ["I can't type in the grid.", "You may be a viewer, the title or season may be locked, maintenance mode may be on, or the title is outside your access — the banner / badge at the top says which."],
          ["A title I expect is missing.", "Check the Summary filters and My Desk division / imprint filters; the title may be out of scope (season, format, division / imprint rules) or outside your access."],
          ["My change shows a conflict.", "Someone changed the same cell after you loaded it. Choose Keep mine or Use theirs."],
          ["\"Saving…\" doesn't finish.", "Your connection dropped. Keep the page open — SEG retries automatically and keeps your changes."],
          ["Where did a number come from?", "Open History on the title (or the row) to see who changed it, when and from what."],
          ["The cover shows \"No cover available\".", "No cover image exists for that ISBN at the cover address (Admin console → Branding and text → Title covers)."],
          ["I was signed out.", "Sign-ins last 12 hours by default; an admin may also have signed you out."],
          ["A feature has disappeared.", "An admin may have switched it off (Admin console → Feature switches)."],
        ],
      },
    ],
  },
  {
    id: "glossary",
    part: "Reference",
    title: "Glossary",
    blocks: [
      {
        t: "table",
        head: ["Term", "Meaning"],
        rows: [
          ["Initial orders", "Units ordered before publication (pre-pub gross sales plus open orders)."],
          ["Laydown goal", "The number of units the team aims to lay down at publication."],
          ["Laydown estimate", "The team's estimate of units laid down at publication."],
          ["6-month estimate", "Estimated units in the first six months, including laydown."],
          ["Estimate vs goal", "Laydown estimate minus laydown goal (negative = below goal)."],
          ["Comparable title", "An earlier title whose sales are used as a reference for each account."],
          ["Paper cut-off", "The date by which paper must be ordered."],
          ["LDC", "A key deadline date from the title data, tracked with the paper cut-off on My Desk."],
          ["Channel / Organization / Account", "The three levels of distribution: channel (e.g. Mass Merchandise), organization within it, and individual accounts."],
          ["Work group", "A named, rule-based collection of titles shown as a My Desk tab for chosen people."],
          ["LTD", "Life-to-date sales."],
          ["POS", "Point-of-sale (sell-through) units."],
        ],
      },
    ],
  },
  {
    id: "release-notes",
    part: "Reference",
    title: "Guide version history",
    blocks: [
      {
        t: "table",
        head: ["Version", "Date", "Notes"],
        rows: [["1.0", "2026-09-24", "First edition: the complete product description and user guide."]],
      },
    ],
  },
];

/** All the plain text of a section (for search). */
export function sectionText(s: GuideSection): string {
  const parts: string[] = [s.title];
  for (const b of s.blocks) {
    if (b.t === "p" || b.t === "h" || b.t === "tip") parts.push(b.text);
    else if (b.t === "list" || b.t === "steps") parts.push(...b.items);
    else parts.push(...b.head, ...b.rows.flat());
  }
  return parts.join("\n").replace(/\*\*/g, "").replace(/\\\*/g, "*");
}
