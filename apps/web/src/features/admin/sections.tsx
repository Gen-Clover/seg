"use client";

import { ActivityLogPage, AdminLogPage, SignInLogPage, UploadLogPage } from "./audit";
import { AnnouncementsPage, AssistantPage, ModerationPage, NotificationsPage } from "./communication";
import { DemoResetPage, JobsPage, RefreshPage, SyncPage } from "./data";
import { AccessPage, DemoAccountsPage, SessionsPage, UsersPage } from "./people";
import { AccountsPage, BulkPage, DeskDefaultsPage, LocksPage, RulesPage } from "./planning";
import { BrandingPage, FeaturesPage, HealthPage, MaintenancePage } from "./system";

const PAGES: Record<string, () => React.ReactNode> = {
  users: UsersPage,
  access: AccessPage,
  sessions: SessionsPage,
  "demo-accounts": DemoAccountsPage,
  locks: LocksPage,
  rules: RulesPage,
  desk: DeskDefaultsPage,
  accounts: AccountsPage,
  bulk: BulkPage,
  refresh: RefreshPage,
  sync: SyncPage,
  jobs: JobsPage,
  "demo-reset": DemoResetPage,
  activity: ActivityLogPage,
  uploads: UploadLogPage,
  "sign-ins": SignInLogPage,
  "admin-log": AdminLogPage,
  moderation: ModerationPage,
  announcements: AnnouncementsPage,
  assistant: AssistantPage,
  notifications: NotificationsPage,
  features: FeaturesPage,
  maintenance: MaintenancePage,
  branding: BrandingPage,
  health: HealthPage,
};

export function AdminSection({ slug }: { slug: string }) {
  const Page = PAGES[slug];
  return Page ? <Page /> : null;
}
