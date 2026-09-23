"use client";

import { Command } from "cmdk";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { isAccountLevelChannel, type AccountRef } from "@seg/domain";
import { Button } from "@/components/ui/button";
import { Badge, Spinner } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { useAccountSearch } from "@/lib/queries";

/** Add a channel / organization / account row that isn't on the grid yet (legacy "Add Row"). */
export function AddAccountDialog({ onPick }: { onPick: (ref: AccountRef) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const search = useAccountSearch(q, open);
  const accounts = search.data?.accounts ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Add account
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add an account to this title"
        description="Search all valid channel, organization and account combinations. If the account is already on the grid you'll jump to it."
      >
        <Command shouldFilter={false}>
          <div className="flex items-center gap-2 border-b border-line px-5">
            <Search className="size-4 text-subtle" />
            <Command.Input
              autoFocus
              value={q}
              onValueChange={setQ}
              placeholder="Search by account, organization, channel or number"
              className="h-11 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
            {search.isFetching ? <Spinner className="text-muted" /> : null}
          </div>
          <Command.List className="scrollbar-thin max-h-[48vh] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-xs text-muted">No matching accounts</Command.Empty>
            {accounts.map((a) => (
              <Command.Item
                key={`${a.channelId}|${a.orgId}|${a.accountId}|${a.accountName}`}
                value={`${a.channelId}|${a.orgId}|${a.accountId}|${a.accountName}`}
                onSelect={() => {
                  onPick(a);
                  setOpen(false);
                  setQ("");
                }}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 data-[selected=true]:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">
                    {a.accountName} <span className="num font-normal text-subtle">{a.accountId}</span>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {a.orgName ?? "No organization"} · {a.channelName ?? a.channelId}
                  </div>
                </div>
                {!isAccountLevelChannel(a.channelId) ? (
                  <Badge className="shrink-0" title="This channel is planned at organization level">
                    Org-level channel
                  </Badge>
                ) : null}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
