"use client";

import { useQuery } from "@tanstack/react-query";
import { Bot, ExternalLink, Home, LayoutDashboard, LogOut, PanelLeft, Search, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@/server/auth/session";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useLocalPref } from "@/lib/use-local-pref";
import { useWorklist } from "@/lib/worklist";
import { BrandMark, BrandName } from "../brand";
import { Badge, Kbd } from "../ui/misc";
import { Tooltip } from "../ui/overlay";
import { AskAbramsDock } from "@/features/ask-abrams/dock";
import { CommandPaletteProvider, useCommandPalette } from "./command-palette";
import { NotificationsBell } from "./notifications";
import { ThemeToggle } from "./theme-toggle";

export function AppShell({
  user,
  mainMenuUrl,
  children,
}: {
  user: Session;
  mainMenuUrl: string | null;
  children: React.ReactNode;
}) {
  return (
    <CommandPaletteProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={user} mainMenuUrl={mainMenuUrl} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
      <AskAbramsDock />
    </CommandPaletteProvider>
  );
}

function Sidebar({ user, mainMenuUrl }: { user: Session; mainMenuUrl: string | null }) {
  const [sidebarPref, setSidebarPref] = useLocalPref("seg-sidebar", "expanded");
  const collapsed = sidebarPref === "collapsed";
  const pathname = usePathname();
  const router = useRouter();
  const palette = useCommandPalette();
  const worklist = useWorklist();

  const toggle = () => setSidebarPref(collapsed ? "expanded" : "collapsed");

  const lastTitle = worklist?.isbns[0];
  // Unread team chat messages (cheap count, every 20 s while the tab is visible).
  const chatUnread = useQuery({
    queryKey: ["chat", "unread"],
    queryFn: () => api<{ unread: number }>("/api/chat/unread"),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
  const nav: { href: string; label: string; icon: typeof Home; active: boolean; badge?: number }[] = [
    { href: "/", label: "My Desk", icon: Home, active: pathname === "/" },
    { href: "/summary", label: "Summary", icon: LayoutDashboard, active: pathname === "/summary" },
    {
      href: pathname.startsWith("/titles/") ? pathname : lastTitle ? `/titles/${lastTitle}` : "/titles",
      label: "Title workspace",
      icon: SquarePen,
      active: pathname.startsWith("/titles"),
    },
    { href: "/chat", label: "Ask Abrams", icon: Bot, active: pathname === "/chat", badge: chatUnread.data?.unread ?? 0 },
  ];

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-[232px]",
      )}
    >
      <div className={cn("flex h-14 items-center gap-2.5 px-3.5", collapsed && "justify-center px-0")}>
        <BrandMark className="size-7" />
        {collapsed ? null : <BrandName />}
      </div>

      <div className="px-2.5">
        <Tooltip content={collapsed ? "Search titles (Ctrl K)" : null} side="right">
          <button
            type="button"
            onClick={palette.open}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-2 text-[13px] text-muted hover:border-line-strong hover:text-ink",
              collapsed && "justify-center px-0",
            )}
          >
            <Search className="size-4 shrink-0" />
            {collapsed ? null : (
              <>
                <span className="flex-1 text-left">Search titles…</span>
                <Kbd>Ctrl K</Kbd>
              </>
            )}
          </button>
        </Tooltip>
      </div>

      <nav className="mt-4 flex flex-col gap-0.5 px-2.5">
        {nav.map((item) => (
          <Tooltip key={item.label} content={collapsed ? item.label : null} side="right">
            <Link
              href={item.href}
              className={cn(
                "relative flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] font-medium transition-colors",
                item.active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                collapsed && "justify-center px-0",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {collapsed ? null : <span className="flex-1">{item.label}</span>}
              {item.badge ? (
                <span
                  className={cn(
                    "num rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white",
                    collapsed && "absolute -right-0.5 -top-0.5 px-1 leading-4",
                  )}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          </Tooltip>
        ))}
        <NotificationsBell collapsed={collapsed} />
        {mainMenuUrl ? (
          <Tooltip content={collapsed ? "Main menu" : null} side="right">
            <a
              href={mainMenuUrl}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink",
                collapsed && "justify-center px-0",
              )}
            >
              <ExternalLink className="size-4 shrink-0" />
              {collapsed ? null : "Main menu"}
            </a>
          </Tooltip>
        ) : null}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-line p-2.5">
        <ThemeToggle compact={collapsed} />
        <Tooltip content={collapsed ? "Expand sidebar" : null} side="right">
          <button
            type="button"
            onClick={toggle}
            className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <PanelLeft className="size-4 shrink-0" />
            {collapsed ? null : "Collapse"}
          </button>
        </Tooltip>
        <div className={cn("mt-1.5 flex items-center gap-2 rounded-lg p-1.5", collapsed && "justify-center p-0")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-ink-2">
            {user.name
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          {collapsed ? null : (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13px] font-medium">{user.name}</div>
                <Badge tone={user.role === "viewer" ? "neutral" : "brand"} className="mt-0.5 capitalize">
                  {user.role}
                </Badge>
              </div>
              <Tooltip content="Sign out">
                <button type="button" onClick={signOut} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Sign out">
                  <LogOut className="size-4" />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
