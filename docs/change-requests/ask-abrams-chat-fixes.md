# Change Management: Ask Abrams chat fixes

**Project:** SEG (`gen-clover/seg`)
**Area:** Ask Abrams, team chat
**Baseline:** `main` @ `e4b15fb`
**Project rules (from `CLAUDE.md`):**
- Business rules go in `packages/domain`, with tests.
- Storage and queries go in `packages/data` or the server services.
- Every API route uses `route()`.
- Before handing over, run `npm test`, `npm run typecheck` and `npm run lint`, and all must pass.

---

## CR-01: New users see the whole chat history as unread

**Problem**
A new user's first Ask Abrams badge is huge, for example "99+". Every message ever posted in the Everyone room counts as unread for them, and so does every earlier message in a group they're added to. They can't clear it without opening each room.

**Root cause**
- Unread counts are worked out in `listRooms()` (`apps/web/src/server/services/chat.ts`, around lines 69–113).
- For each room, a message counts as unread when `createdAt` is later than the user's read time from `chat_reads`.
- When the user has no `chat_reads` record for a room, that time falls back to an empty string (`default: ""`, around line 90). Every message is later than an empty string, so the whole history counts.
- Nothing writes a read record when someone is added to a group or when a user account is created.

**Who is affected**
- New users, in the Everyone room.
- Existing users added to a group that already has messages.

The same number drives:
- the dock launcher badge (`/api/chat/unread`, `unreadTotal()`)
- the per-room badges in the conversation list
- desktop alerts ("You have N unread messages")

**Solution**
A user's unread count for a room should start from the moment they joined it, not from the room's first message.

1. **Put the rule in the domain package.** Add a small, tested function to `packages/domain` that works out the time unread counting starts from:
   - If the user has a read record for the room, use its `readAt`.
   - Otherwise, use whichever is later: the user's `createdAt` (from `UserDoc`) or the room's `createdAt`.
2. **Use that rule in `listRooms()`** instead of the `""` fallback. Existing users need no data migration.
3. **Record a join time when someone is added to a group.** Upsert a `chat_reads` record with `readAt = now` for each person added:
   - in `createGroup()`, for all members except the creator (the creator's own messages never count as unread anyway)
   - in `updateGroup()`, for each person in `add`
   - when someone is re-added after leaving, also reset to now, so messages from while they were away don't show as unread
4. **Leave direct messages alone.** A DM room starts empty, so the first message should still show as unread for the other person, and the fallback in step 1 already does this.
5. **Leave marking-as-read alone.** Opening a room still calls `markRead()` as it does today.

**Acceptance criteria**
- A user created today sees 0 unread in Everyone for messages posted before they were created. Messages posted afterwards count as normal.
- A user added to a group with 50 old messages sees 0 unread there. The next message someone else posts shows 1.
- Someone who leaves a group and is re-added doesn't see the messages from while they were away as unread.
- For a direct message, the recipient still sees the first message as 1 unread.
- Unread counts for existing users who already have read records don't change.
- The dock badge, the conversation list badges and desktop alerts all show the corrected numbers.

**Tests**
- Unit tests in `packages/domain` for the rule in step 1. Cover:
  - a read record exists
  - no record, where the user was created after the room
  - no record, where the room was created after the user
- A service-level check (or a manual test) for adding someone to a group and for creating a group.

---

## CR-02: Deleted or edited messages still show in the conversation list preview

**Problem**
Each room in the conversation list shows a preview of its latest message under the room name, such as "Rakesh: delete test", plus a time such as "4m ago". This list appears in the Ask Abrams dock panel and on the left of the `/chat` page. The preview goes wrong in three cases:
- **Deleted by the author:** the conversation window shows "Message deleted", but the list still shows the full deleted text.
- **Removed by an admin in moderation:** the text the admin removed stays visible under the room name in **everyone's** list, which defeats the moderation.
- **Edited:** the preview keeps the old wording.
- In all three cases the time ("4m ago") also still points at the deleted message. That time also decides how rooms are sorted in the list.

**How to reproduce it** (verified manually, with screenshots)
1. Post "delete test" in Everyone.
2. Delete it. The chat window shows "Message deleted".
3. Look at Everyone in the dock's conversation list. It still shows "Rakesh: delete test · 4m ago".

**Root cause**
- The preview comes from the room's `lastMessage` field (`{ authorName, excerpt }`), and the time from `lastMessageAt`. Both are stored on the room and read in `RoomItem` (`apps/web/src/features/chat/chat-view.tsx`, around line 220).
- They're only written when:
  - a message is sent: `postMessage()` in `apps/web/src/server/services/chat.ts`, around line 180
  - an admin posts: `postAsAdmin()` in `apps/web/src/server/services/admin/communication.ts`, around line 116
- These functions never update them:
  - `deleteMessage()` in `chat.ts`
  - `editMessage()` in `chat.ts`
  - `moderateMessage()` in `admin/communication.ts`
- The preview only corrects itself when the data is reloaded from BigQuery. `ingest.ts` (around line 315) rebuilds it and skips deleted messages. So the wrong preview stays until the next reload.

**Solution**
1. **Add one server helper**, for example `refreshRoomPreview(roomId)`, in the chat service:
   - Find the room's latest message where `deletedAt` is null, sorted by `createdAt` descending. The existing `{ roomId: 1, createdAt: -1 }` index covers this.
   - If one exists, set `lastMessage = { authorName, excerpt }` and `lastMessageAt = message.createdAt`. Build `excerpt` the same way `postMessage()` does: 140 characters, then "…". Move that excerpt logic into one shared helper so it isn't duplicated.
   - If none exists, set `lastMessage = null` and `lastMessageAt = null`. The list then shows "No messages yet" and sorts by the room's `createdAt`.
   - Don't change `syncedAt`. The preview isn't part of the BigQuery room outbox, and `postMessage()` doesn't reset it either.
2. **Call the helper after these changes succeed:**
   - `deleteMessage()`
   - `editMessage()`
   - `moderateMessage()`
3. **Refresh the list straight away on the acting user's screen.** In `Room` (`chat-view.tsx`), invalidate `chatKeys.rooms` after a delete or edit succeeds. Other users already pick up the change through the 8-second room list refresh.

**Acceptance criteria**
- Deleting the latest message in a room changes the preview to the latest message that's still there, with its author and time. If there's none, it shows "No messages yet".
- A message an admin removes in moderation no longer appears in anyone's list preview after their next refresh.
- Editing the latest message updates the preview to the new wording, and the time doesn't change.
- Deleting or editing an older message (not the latest) leaves the preview unchanged.
- Rooms re-sort correctly after the latest message is deleted.
- The Everyone room stays pinned at the top whatever happens.

**Tests**
- Cover the helper's four outcomes:
  - the latest message was deleted, so the preview falls back to the previous one
  - all messages were deleted, so the preview is null
  - the latest message was edited
  - an older message was deleted, so nothing changes
- Manual check: repeat the reproduction steps above for the dock and for `/chat`, and repeat them for an admin removal.
