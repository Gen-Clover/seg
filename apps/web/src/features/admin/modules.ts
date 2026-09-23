import {
  Activity,
  BellRing,
  Bot,
  Building2,
  CalendarClock,
  Database,
  FileClock,
  FileUp,
  Flag,
  HeartPulse,
  History,
  KeyRound,
  LayoutList,
  Lock,
  LogIn,
  Megaphone,
  MonitorSmartphone,
  Palette,
  RefreshCcw,
  RotateCcw,
  ScrollText,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  ToggleRight,
  Users,
  Wand2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface AdminPage {
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Only in demo environments (credentials sign-in). */
  demoOnly?: boolean;
}

export interface AdminModule {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  pages: AdminPage[];
}

/** The admin console, grouped by module. The order here is the order in the navigation. */
export const ADMIN_MODULES: AdminModule[] = [
  {
    id: "people",
    label: "People and access",
    description: "Who can sign in, what they can change, and who is signed in now.",
    icon: Users,
    pages: [
      { slug: "users", label: "Users", description: "Add people, change roles, deactivate or reactivate, reset passwords.", icon: Users },
      { slug: "access", label: "Access by division / imprint", description: "Limit editors to their divisions or imprints. Viewers stay read-only.", icon: KeyRound },
      { slug: "sessions", label: "Sessions", description: "Who is signed in, sign people out, and how long a sign-in lasts.", icon: MonitorSmartphone },
      { slug: "demo-accounts", label: "Demo accounts", description: "Allow or block the demo logins and the password hint.", icon: ShieldCheck },
    ],
  },
  {
    id: "planning",
    label: "Planning controls",
    description: "Locks, business rules and defaults that shape the planning grid.",
    icon: SlidersHorizontal,
    pages: [
      { slug: "locks", label: "Season and title locks", description: "Make a season or title read-only, with a note; unlock with a reason.", icon: Lock },
      { slug: "rules", label: "Business rules", description: "Account-level channels, seasons, formats in and out of scope, comparable titles, note lengths.", icon: Scale },
      { slug: "desk", label: "My Desk defaults", description: "Due-soon window, overdue look-back and below-goal threshold.", icon: CalendarClock },
      { slug: "accounts", label: "Account catalog", description: "Search every channel, organization and account; see when it was last refreshed.", icon: Building2 },
      { slug: "bulk", label: "Bulk actions", description: "Clear or copy estimates for a title or season, with a preview first.", icon: Wand2 },
    ],
  },
  {
    id: "data",
    label: "Data and jobs",
    description: "Data refresh from BigQuery, write-back health and job history.",
    icon: Database,
    pages: [
      { slug: "refresh", label: "Data refresh", description: "Last runs of the data load, write-back and trends, with Run now.", icon: RefreshCcw },
      { slug: "sync", label: "BigQuery sync health", description: "Changes waiting to reach BigQuery, last success and retry.", icon: Activity },
      { slug: "jobs", label: "Job history", description: "Every job run with its result, and how long history is kept.", icon: FileClock },
      { slug: "demo-reset", label: "Demo reset", description: "Clear test conversations and reload estimates (demo only).", icon: RotateCcw, demoOnly: true },
    ],
  },
  {
    id: "audit",
    label: "Audit and oversight",
    description: "Every change, upload, sign-in and admin action.",
    icon: ScrollText,
    pages: [
      { slug: "activity", label: "Activity log", description: "Every change across all titles: filter by person, date, season, field or source; export CSV.", icon: History },
      { slug: "uploads", label: "Upload log", description: "Each spreadsheet upload: who, file, rows, values changed, errors.", icon: FileUp },
      { slug: "sign-ins", label: "Sign-in log", description: "Successful and failed sign-ins.", icon: LogIn },
      { slug: "admin-log", label: "Admin changes", description: "Every change made in this console.", icon: LayoutList },
    ],
  },
  {
    id: "communication",
    label: "Ask Abrams and communication",
    description: "Chat moderation, announcements, the assistant and notifications.",
    icon: Bot,
    pages: [
      { slug: "moderation", label: "Chat moderation", description: "Reported messages, remove any message, archive or delete groups.", icon: Flag },
      { slug: "announcements", label: "Announcements", description: "Banner across the app, or a post to Everyone from SEG Admin.", icon: Megaphone },
      { slug: "assistant", label: "Assistant settings", description: "On/off, greeting, suggestions and the most common unanswered questions.", icon: Bot },
      { slug: "notifications", label: "Notification defaults", description: "Desktop alerts, mentions, replies and direct messages.", icon: BellRing },
    ],
  },
  {
    id: "system",
    label: "System",
    description: "Feature switches, maintenance mode, branding and health.",
    icon: Wrench,
    pages: [
      { slug: "features", label: "Feature switches", description: "Turn modules on or off for this environment.", icon: ToggleRight },
      { slug: "maintenance", label: "Maintenance mode", description: "Read-only for everyone but admins, with a banner.", icon: Wrench },
      { slug: "branding", label: "Branding and text", description: "App name, sign-in wording and the Main menu link.", icon: Palette },
      { slug: "health", label: "Health", description: "Version, environment, database and BigQuery connectivity, response times.", icon: HeartPulse },
    ],
  },
];

export function findPage(slug: string): { module: AdminModule; page: AdminPage } | null {
  for (const group of ADMIN_MODULES) {
    const page = group.pages.find((p) => p.slug === slug);
    if (page) return { module: group, page };
  }
  return null;
}
