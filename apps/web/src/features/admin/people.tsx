"use client";

import { Copy, KeyRound, LogOut, MonitorSmartphone, MoreHorizontal, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Input } from "@/components/ui/misc";
import { MultiSelect } from "@/components/ui/multi-select";
import { Dialog, DialogContent, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { cn, fmtInt } from "@/lib/utils";
import type { AdminUserView, listSessions } from "@/server/services/admin/people";
import type { ruleOptions } from "@/server/services/admin/system";
import {
  Loading,
  PageHeader,
  SaveBar,
  Section,
  SelectField,
  SettingRow,
  Switch,
  Table,
  When,
  useAdmin,
  useAdminAction,
  useSectionDraft,
  useSettingsData,
} from "./ui";

type Role = AdminUserView["role"];
const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Everything, including this console" },
  { value: "editor", label: "Editor", hint: "Edit estimates, upload, comment" },
  { value: "viewer", label: "Viewer", hint: "Read only" },
];
type Options = Awaited<ReturnType<typeof ruleOptions>>;

function useUsersList() {
  return useAdmin<{ users: AdminUserView[] }>("users", { refetchInterval: 30_000 });
}

/** Shows a one-time password once, with a copy button. */
function PasswordNotice({ email, password, onClose }: { email: string; password: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!password} onOpenChange={(o) => (o ? null : onClose())}>
      {password ? (
        <DialogContent title="One-time password" description={`Give this to ${email}. It is shown only once.`}>
          <div className="flex items-center gap-2 px-5 py-4">
            <code className="num flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[15px] font-semibold tracking-wider" data-testid="temp-password">
              {password}
            </code>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(password);
                toast.success("Copied");
              }}
            >
              <Copy />
              Copy
            </Button>
          </div>
          <div className="flex justify-end border-t border-line px-5 py-3">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/* ---------------- Users ---------------- */

export function UsersPage() {
  const users = useUsersList();
  const settings = useSettingsData();
  const me = useMe().data?.user;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("active");
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState<{ email: string; password: string | null } | null>(null);
  const credentials = settings.data?.demoEnvironment ?? false;

  const update = useAdminAction(
    ({ email, body }: { email: string; body: Record<string, unknown> }) =>
      api<{ password: string | null }>(`/api/admin/users/${encodeURIComponent(email)}`, { method: "PATCH", json: body }),
  );
  const run = async (email: string, body: Record<string, unknown>, done: string) => {
    try {
      const res = await update.mutateAsync({ email, body });
      toast.success(done);
      if (res.password) setPassword({ email, password: res.password });
    } catch {
      // The error toast is shown by the action.
    }
  };

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (users.data?.users ?? []).filter(
      (u) => (status === "all" || (status === "active") === u.active) && (!n || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(n)),
    );
  }, [users.data, q, status]);
  const counts = useMemo(() => {
    const all = users.data?.users ?? [];
    return { active: all.filter((u) => u.active).length, inactive: all.filter((u) => !u.active).length, all: all.length };
  }, [users.data]);

  return (
    <>
      <PageHeader
        icon={Users}
        title="Users"
        description="Add people, change their role, deactivate or reactivate them. Deactivating signs the person out everywhere at once."
        actions={
          <Button variant="brand" onClick={() => setAdding(true)}>
            <UserPlus />
            Add user
          </Button>
        }
      />
      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, e-mail or role" className="w-72" />
          <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
            {(["active", "inactive", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn("rounded-md px-2 py-1 font-medium capitalize", status === s ? "bg-ink text-surface" : "text-muted hover:text-ink")}
              >
                {s} <span className="num opacity-70">{counts[s]}</span>
              </button>
            ))}
          </div>
        </div>
        {users.isPending ? (
          <Loading />
        ) : (
          <Table head={["Person", "Role", "Access", "Last sign-in", "Status", ""]} empty={!list.length}>
            {list.map((u) => (
              <tr key={u.email} data-testid={`user-row-${u.email}`} className={cn(!u.active && "opacity-60")}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", u.online ? "bg-ok" : "bg-transparent")} title={u.online ? "Online now" : undefined} />
                    <div className="min-w-0">
                      <div className="font-medium">
                        {u.name} {u.email === me?.email ? <span className="text-xs font-normal text-muted">(you)</span> : null}
                      </div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </div>
                    {u.demo ? <Badge tone="info">Demo</Badge> : null}
                  </div>
                </td>
                <td>
                  <SelectField
                    label={`Role of ${u.name}`}
                    value={u.role}
                    onChange={(role) => void run(u.email, { role }, `${u.name} is now ${role === "admin" ? "an admin" : `a ${role}`}.`)}
                    options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
                  />
                </td>
                <td className="text-xs text-ink-2">
                  {u.role === "admin" ? (
                    <span className="text-muted">All titles</span>
                  ) : u.scope.divisions.length || u.scope.imprints.length ? (
                    [...u.scope.divisions, ...u.scope.imprints].join(", ")
                  ) : (
                    <span className="text-muted">All divisions and imprints</span>
                  )}
                </td>
                <td className="text-xs">
                  <When iso={u.lastSignInAt} />
                  {u.sessions ? <div className="text-subtle">{u.sessions} session{u.sessions === 1 ? "" : "s"}</div> : null}
                </td>
                <td>{u.active ? <Badge tone="ok">Active</Badge> : <Badge>Deactivated</Badge>}</td>
                <td className="text-right">
                  <UserMenu
                    user={u}
                    credentials={credentials}
                    onAction={(body, done) => void run(u.email, body, done)}
                  />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <AddUserDialog
        open={adding}
        onOpenChange={setAdding}
        credentials={credentials}
        onCreated={(email, pw) => {
          if (pw) setPassword({ email, password: pw });
        }}
      />
      <PasswordNotice email={password?.email ?? ""} password={password?.password ?? null} onClose={() => setPassword(null)} />
      <div className="h-6" />
    </>
  );
}

function UserMenu({
  user,
  credentials,
  onAction,
}: {
  user: AdminUserView;
  credentials: boolean;
  onAction: (body: Record<string, unknown>, done: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const act = (body: Record<string, unknown>, done: string, confirm?: string) => {
    setOpen(false);
    if (confirm && !window.confirm(confirm)) return;
    onAction(body, done);
  };
  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${user.name}`}>
          <MoreHorizontal />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        {user.active ? (
          <button type="button" className={cn(item, "text-brand")} onClick={() => act({ active: false }, `${user.name} deactivated and signed out.`, `Deactivate ${user.name}? They are signed out everywhere and can't sign in until reactivated.`)}>
            Deactivate
          </button>
        ) : (
          <button type="button" className={item} onClick={() => act({ active: true }, `${user.name} reactivated.`)}>
            Reactivate
          </button>
        )}
        <button type="button" className={item} onClick={() => act({ signOutEverywhere: true }, `${user.name} signed out everywhere.`, `Sign ${user.name} out on every device?`)}>
          <LogOut className="size-3.5" />
          Sign out everywhere
        </button>
        {credentials ? (
          <button type="button" className={item} onClick={() => act({ resetPassword: true }, `New password created for ${user.name}.`, `Reset ${user.name}'s password? Their current password stops working.`)}>
            <KeyRound className="size-3.5" />
            Reset password
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  credentials,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  credentials: boolean;
  onCreated: (email: string, password: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const create = useAdminAction(
    () => api<{ user: AdminUserView; password: string | null }>("/api/admin/users", { method: "POST", json: { name, email, role } }),
    (r) => `${r.user.name} added.`,
  );
  const submit = async () => {
    const res = await create.mutateAsync(undefined).catch(() => null);
    if (!res) return;
    onOpenChange(false);
    setName("");
    setEmail("");
    onCreated(res.user.email, res.password);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          title="Add a user"
          description={credentials ? "They get a one-time password to sign in with." : "They sign in with their Microsoft work account."}
        >
          <div className="space-y-3 px-5 py-4">
            <label className="block text-[13px] font-medium">
              Name
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Full name" />
            </label>
            <label className="block text-[13px] font-medium">
              Work e-mail
              <Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@abramsbooks.com" />
            </label>
            <div className="text-[13px] font-medium">Role</div>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={cn("rounded-lg border px-2.5 py-2 text-left", role === r.value ? "border-brand/50 bg-brand-soft" : "border-line hover:border-line-strong")}
                >
                  <div className="text-[13px] font-medium">{r.label}</div>
                  <div className="text-[11px] text-muted">{r.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="brand" disabled={name.trim().length < 2 || !email.includes("@") || create.isPending} onClick={() => void submit()}>
              <UserPlus />
              Add user
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/* ---------------- Access by division / imprint ---------------- */

export function AccessPage() {
  const users = useUsersList();
  const options = useAdmin<Options>("rules/options");
  const save = useAdminAction(
    ({ email, scope }: { email: string; scope: { divisions: string[]; imprints: string[] } }) =>
      api(`/api/admin/users/${encodeURIComponent(email)}`, { method: "PATCH", json: { scope } }),
    "Access updated — applies within a few seconds.",
  );
  const people = (users.data?.users ?? []).filter((u) => u.active && u.role !== "admin");
  const divisions = (options.data?.divisions ?? []).map((d) => ({ value: d, label: d }));
  const imprints = (options.data?.imprints ?? []).map((d) => ({ value: d, label: d }));

  return (
    <>
      <PageHeader
        icon={KeyRound}
        title="Access by division / imprint"
        description="Editors can be limited to the titles of some divisions or imprints: they still see every title, but can change only theirs. Leave both empty for full access. Viewers are always read-only; admins always have full access."
      />
      <Section>
        {users.isPending ? (
          <Loading />
        ) : (
          <Table head={["Person", "Role", "Divisions they can edit", "Imprints they can edit", "Result"]} empty={!people.length}>
            {people.map((u) => {
              const limited = u.scope.divisions.length || u.scope.imprints.length;
              return (
                <tr key={u.email} data-testid={`access-row-${u.email}`}>
                  <td>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </td>
                  <td className="capitalize">{u.role}</td>
                  <td>
                    {u.role === "viewer" ? (
                      <span className="text-xs text-muted">Read only</span>
                    ) : (
                      <MultiSelect
                        label="Divisions"
                        options={divisions}
                        selected={u.scope.divisions}
                        onChange={(d) => save.mutate({ email: u.email, scope: { ...u.scope, divisions: d } })}
                      />
                    )}
                  </td>
                  <td>
                    {u.role === "viewer" ? null : (
                      <MultiSelect
                        label="Imprints"
                        options={imprints}
                        selected={u.scope.imprints}
                        onChange={(i) => save.mutate({ email: u.email, scope: { ...u.scope, imprints: i } })}
                      />
                    )}
                  </td>
                  <td className="text-xs">
                    {u.role === "viewer" ? (
                      <Badge>View only</Badge>
                    ) : limited ? (
                      <Badge tone="warn">Limited</Badge>
                    ) : (
                      <Badge tone="ok">All titles</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>
      <p className="pb-6 text-[12.5px] text-muted">
        When both divisions and imprints are set, a title must match both. Changes apply on the person&apos;s next click — no need to sign them out.
      </p>
    </>
  );
}

/* ---------------- Sessions ---------------- */

type SessionsView = Awaited<ReturnType<typeof listSessions>>;

export function SessionsPage() {
  const sessions = useAdmin<SessionsView>("sessions", { refetchInterval: 20_000 });
  const me = useMe().data?.user;
  const draft = useSectionDraft("sessions");
  const revoke = useAdminAction((id: string) => api(`/api/admin/sessions/${id}`, { method: "DELETE" }), "Signed out on that device.");
  const everywhere = useAdminAction(
    (email: string) => api(`/api/admin/users/${encodeURIComponent(email)}`, { method: "PATCH", json: { signOutEverywhere: true } }),
    "Signed out everywhere.",
  );
  const list = sessions.data?.sessions ?? [];
  const online = list.filter((s) => s.online).length;

  return (
    <>
      <PageHeader icon={MonitorSmartphone} title="Sessions" description="Everyone who is signed in, on which device, and when they were last active." />
      {draft.draft ? (
        <Section title="Session length" description="How long a sign-in lasts before the person has to sign in again. Applies to new sign-ins.">
          <SettingRow label="Sign-in lasts" help="The original SEG setting is 12 hours." changed={draft.dirty}>
            <SelectField
              label="Session length"
              value={draft.draft.hours}
              onChange={(hours) => draft.set({ hours })}
              options={[
                ...[4, 8, 12, 24, 72, 168].map((h) => ({ value: h, label: h < 24 ? `${h} hours` : h === 24 ? "1 day" : h === 72 ? "3 days" : "7 days" })),
                ...(![4, 8, 12, 24, 72, 168].includes(draft.draft.hours) ? [{ value: draft.draft.hours, label: `${draft.draft.hours} hours` }] : []),
              ]}
            />
          </SettingRow>
          <div className="px-5 pb-3">
            <SaveBar dirty={draft.dirty} saving={draft.saving} onSave={() => void draft.save()} onDiscard={draft.discard} />
          </div>
        </Section>
      ) : null}
      <Section title={`Signed in now · ${fmtInt(list.length)} session${list.length === 1 ? "" : "s"}`} description={`${online} active in the last 15 minutes.`}>
        {sessions.isPending ? (
          <Loading />
        ) : (
          <Table head={["Person", "Device", "Signed in", "Last active", "Expires", ""]} empty={!list.length}>
            {list.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", s.online ? "bg-ok" : "bg-line-strong")} />
                    <div>
                      <div className="font-medium">
                        {s.name} {s.id === me?.jti ? <span className="text-xs font-normal text-muted">(this browser)</span> : null}
                      </div>
                      <div className="text-xs capitalize text-muted">{s.role}</div>
                    </div>
                  </div>
                </td>
                <td className="text-xs">
                  {s.device}
                  {s.ip ? <div className="text-subtle">{s.ip}</div> : null}
                </td>
                <td className="text-xs">
                  <When iso={s.createdAt} />
                </td>
                <td className="text-xs">
                  <When iso={s.lastSeenAt} />
                </td>
                <td className="text-xs">
                  <When iso={s.expiresAt} />
                </td>
                <td className="whitespace-nowrap text-right">
                  {s.id !== me?.jti ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>
                        Sign out
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => window.confirm(`Sign ${s.name} out on every device?`) && everywhere.mutate(s.email)}>
                        Everywhere
                      </Button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <div className="h-6" />
    </>
  );
}

/* ---------------- Demo accounts ---------------- */

export function DemoAccountsPage() {
  const settings = useSettingsData();
  const users = useUsersList();
  const demo = settings.data?.settings.demo;
  const save = useAdminAction((body: { allowDemoLogins: boolean; showOnLogin: boolean }) => api("/api/admin/demo", { method: "POST", json: body }), "Saved.");
  const demoUsers = (users.data?.users ?? []).filter((u) => u.demo);

  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        title="Demo accounts"
        description="The demo logins (@seg-demo.com) are for showing SEG. Turn them off before real people start using it. You need at least one non-demo admin first, so nobody gets locked out."
      />
      {!settings.data?.demoEnvironment ? (
        <Section>
          <p className="px-5 py-4 text-[13px] text-muted">This environment uses Microsoft sign-in, so demo accounts can&apos;t sign in here.</p>
        </Section>
      ) : !demo ? (
        <Loading />
      ) : (
        <Section title="Demo sign-in">
          <SettingRow label="Allow demo logins" help="When off, demo accounts can't sign in and anyone signed in with one is signed out on their next click.">
            <Switch
              label="Allow demo logins"
              checked={demo.allowDemoLogins}
              onChange={(allowDemoLogins) => save.mutate({ allowDemoLogins, showOnLogin: allowDemoLogins ? demo.showOnLogin : false })}
            />
          </SettingRow>
          <SettingRow label="Show demo accounts on the sign-in page" help="The list of demo people and the shared password hint under the sign-in form.">
            <Switch
              label="Show demo accounts on the sign-in page"
              checked={demo.showOnLogin}
              disabled={!demo.allowDemoLogins}
              onChange={(showOnLogin) => save.mutate({ allowDemoLogins: demo.allowDemoLogins, showOnLogin })}
            />
          </SettingRow>
        </Section>
      )}
      <Section title={`Demo people · ${demoUsers.length}`}>
        <Table head={["Person", "Role", "Last sign-in"]} empty={!demoUsers.length}>
          {demoUsers.map((u) => (
            <tr key={u.email}>
              <td>
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-muted">{u.email}</div>
              </td>
              <td className="capitalize">{u.role}</td>
              <td className="text-xs">
                <When iso={u.lastSignInAt} />
              </td>
            </tr>
          ))}
        </Table>
      </Section>
      <div className="h-6" />
    </>
  );
}

