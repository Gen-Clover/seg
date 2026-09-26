import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ChatMessageDoc, ChatRoomDoc, NotificationDoc } from "@seg/data";
import { messageExcerpt, roomPreview } from "@seg/domain";
import type { Session } from "../auth/session";
import { collections } from "../db";
import { HttpError } from "../http";
import { getSettings } from "./settings";
import { scheduleWriteback } from "./writeback";

export const EVERYONE = "everyone";
const PAGE = 60;
const ISBN_RE = /\b97[89]\d{10}\b/g;

export type RoomView = Omit<ChatRoomDoc, "syncedAt"> & { unread: number; title: string };
export type MessageView = Omit<ChatMessageDoc, "syncedAt">;

export const newMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message first.").max(4000),
  mentions: z.array(z.string().email()).max(20).default([]),
});
export const newGroupSchema = z.object({
  name: z.string().trim().min(1, "Give the group a name.").max(80),
  members: z.array(z.string().email()).min(1, "Add at least one person.").max(200),
});
export const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  add: z.array(z.string().email()).max(200).optional(),
  leave: z.boolean().optional(),
});

const dmId = (a: string, b: string) => `dm:${[a, b].sort().join("|")}`;

async function activeUsers(): Promise<Map<string, string>> {
  const users = await (await collections.users()).find({ active: true }, { projection: { name: 1 } }).toArray();
  return new Map(users.map((u) => [u._id, u.name]));
}

/** The whole-team room always exists. */
async function ensureEveryone(): Promise<void> {
  const now = new Date().toISOString();
  await (await collections.chatRooms()).updateOne(
    { _id: EVERYONE },
    {
      $setOnInsert: {
        type: "everyone",
        name: "Everyone",
        members: [],
        createdBy: "system",
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
        lastMessage: null,
        syncedAt: null,
      },
    },
    { upsert: true },
  );
}

const canSee = (room: ChatRoomDoc, email: string) => room.type === "everyone" || room.members.includes(email);

async function roomFor(roomId: string, session: Session): Promise<ChatRoomDoc> {
  if (roomId === EVERYONE) await ensureEveryone();
  const room = await (await collections.chatRooms()).findOne({ _id: roomId });
  if (!room || !canSee(room, session.email)) throw new HttpError(404, "That conversation doesn't exist or you're not in it.");
  return room;
}

/** Rooms I can see, newest activity first, with my unread counts. Direct rooms are titled with the other person. */
export async function listRooms(session: Session): Promise<RoomView[]> {
  await ensureEveryone();
  const [rooms, reads, names] = await Promise.all([
    (await collections.chatRooms()).find({ $or: [{ _id: EVERYONE }, { members: session.email }], archivedAt: { $in: [null, undefined] } }, { projection: { syncedAt: 0 } }).toArray(),
    (await collections.chatReads()).find({ email: session.email }).toArray(),
    activeUsers(),
  ]);
  const readAt = new Map(reads.map((r) => [r.roomId, r.readAt]));
  const messages = await collections.chatMessages();
  const unread = await messages
    .aggregate<{ _id: string; n: number }>([
      { $match: { roomId: { $in: rooms.map((r) => r._id) }, deletedAt: null, authorEmail: { $ne: session.email } } },
      { $project: { roomId: 1, createdAt: 1 } },
      ...(readAt.size
        ? [
            {
              $match: {
                $expr: {
                  $gt: [
                    "$createdAt",
                    { $switch: { branches: [...readAt].map(([id, at]) => ({ case: { $eq: ["$roomId", id] }, then: at })), default: "" } },
                  ],
                },
              },
            },
          ]
        : []),
      { $group: { _id: "$roomId", n: { $sum: 1 } } },
    ])
    .toArray();
  const unreadBy = new Map(unread.map((u) => [u._id, u.n]));
  return rooms
    .map((r) => ({
      ...r,
      unread: unreadBy.get(r._id) ?? 0,
      title:
        r.type === "direct"
          ? (names.get(r.members.find((m) => m !== session.email) ?? session.email) ?? r.name)
          : r.name,
    }))
    .sort((a, b) =>
      a._id === EVERYONE ? -1 : b._id === EVERYONE ? 1 : (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
    );
}

export async function unreadTotal(session: Session): Promise<number> {
  return (await listRooms(session)).reduce((n, r) => n + r.unread, 0);
}

/** Messages of a room: the latest page, older pages with `before`, or new ones since `after` (polling). */
export async function listMessages(
  roomId: string,
  session: Session,
  opts: { before?: string | null; after?: string | null },
): Promise<{ messages: MessageView[]; hasMore: boolean }> {
  await roomFor(roomId, session);
  const messages = await collections.chatMessages();
  if (opts.after) {
    // New and changed messages since the last poll (edits and deletions included).
    const changed = await messages
      .find(
        { roomId, $or: [{ createdAt: { $gt: opts.after } }, { editedAt: { $gt: opts.after } }, { deletedAt: { $gt: opts.after } }] },
        { projection: { syncedAt: 0 } },
      )
      .sort({ createdAt: 1 })
      .limit(500)
      .toArray();
    return { messages: changed, hasMore: false };
  }
  const page = await messages
    .find({ roomId, ...(opts.before ? { createdAt: { $lt: opts.before } } : {}) }, { projection: { syncedAt: 0 } })
    .sort({ createdAt: -1 })
    .limit(PAGE + 1)
    .toArray();
  const hasMore = page.length > PAGE;
  return { messages: page.slice(0, PAGE).reverse(), hasMore };
}

/** Links ISBNs in a message to catalog titles. */
async function titleRefs(body: string): Promise<{ isbn: string; title: string }[]> {
  const isbns = [...new Set(body.match(ISBN_RE) ?? [])].slice(0, 10);
  if (!isbns.length) return [];
  const docs = await (await collections.titles()).find({ _id: { $in: isbns } }, { projection: { title: 1 } }).toArray();
  return docs.map((d) => ({ isbn: d._id, title: d.title }));
}

export async function postMessage(roomId: string, session: Session, input: z.infer<typeof newMessageSchema>): Promise<MessageView> {
  const room = await roomFor(roomId, session);
  if (room.archivedAt) throw new HttpError(423, "This group was archived by an administrator and is read-only.");
  const names = await activeUsers();
  const eligible = room.type === "everyone" ? [...names.keys()] : room.members;
  const mentions = [...new Set(input.mentions.map((m) => m.toLowerCase()))].filter((m) => m !== session.email && eligible.includes(m));
  const now = new Date().toISOString();
  const message: ChatMessageDoc = {
    _id: randomUUID(),
    roomId,
    authorEmail: session.email,
    authorName: session.name,
    body: input.body,
    mentions,
    titleRefs: await titleRefs(input.body),
    createdAt: now,
    editedAt: null,
    deletedAt: null,
    syncedAt: null,
  };
  await (await collections.chatMessages()).insertOne(message);
  const excerpt = messageExcerpt(input.body);
  await (await collections.chatRooms()).updateOne(
    { _id: roomId },
    { $set: { lastMessageAt: now, lastMessage: { authorName: session.name, excerpt }, updatedAt: now } },
  );
  // Reading your own room: my own message marks it read.
  await markRead(roomId, session, now);

  const prefs = (await getSettings()).notifications;
  // Direct messages notify the other person when the admin has switched that on.
  const dmRecipients = room.type === "direct" && prefs.directMessages ? room.members.filter((m) => m !== session.email && !mentions.includes(m)) : [];
  if ((prefs.mentions && mentions.length) || dmRecipients.length) {
    const roomName = room.type === "direct" ? "a direct message" : room.name;
    const notes: NotificationDoc[] = [...(prefs.mentions ? mentions : []), ...dmRecipients].map((email) => ({
      _id: randomUUID(),
      email,
      type: dmRecipients.includes(email) ? "chat_dm" : "chat_mention",
      commentId: message._id,
      isbn: "",
      threadKey: "",
      roomId,
      titleName: roomName,
      rowLabel: "Chat",
      fromEmail: session.email,
      fromName: session.name,
      excerpt,
      createdAt: now,
      readAt: null,
    }));
    await (await collections.notifications()).insertMany(notes);
  }
  scheduleWriteback();
  const view: Partial<ChatMessageDoc> = { ...message };
  delete view.syncedAt;
  return view as MessageView;
}

export async function editMessage(id: string, session: Session, body: string): Promise<void> {
  const messages = await collections.chatMessages();
  const msg = await messages.findOne({ _id: id });
  if (!msg || msg.deletedAt) throw new HttpError(404, "That message no longer exists.");
  if (msg.authorEmail !== session.email) throw new HttpError(403, "You can only edit your own messages.");
  const trimmed = body.trim();
  if (!trimmed) throw new HttpError(400, "A message can't be empty — delete it instead.");
  await messages.updateOne(
    { _id: id },
    { $set: { body: trimmed.slice(0, 4000), titleRefs: await titleRefs(trimmed), editedAt: new Date().toISOString(), syncedAt: null } },
  );
  await refreshRoomPreview(msg.roomId);
  scheduleWriteback();
}

export async function deleteMessage(id: string, session: Session): Promise<void> {
  const messages = await collections.chatMessages();
  const msg = await messages.findOne({ _id: id });
  if (!msg || msg.deletedAt) throw new HttpError(404, "That message no longer exists.");
  if (msg.authorEmail !== session.email && session.role !== "admin") throw new HttpError(403, "Only the author or an admin can delete a message.");
  await messages.updateOne({ _id: id }, { $set: { deletedAt: new Date().toISOString(), syncedAt: null } });
  await (await collections.notifications()).deleteMany({ commentId: id });
  await refreshRoomPreview(msg.roomId);
  scheduleWriteback();
}

/**
 * Re-derives a room's conversation-list preview after a message is edited, deleted or removed in
 * moderation (only postMessage() and postAsAdmin() set it otherwise). `syncedAt` is left alone: the
 * preview isn't part of the BigQuery room outbox, and ingest rebuilds it by the same rule.
 */
export async function refreshRoomPreview(roomId: string): Promise<void> {
  const latest = await (await collections.chatMessages())
    .find({ roomId, deletedAt: null }, { projection: { authorName: 1, body: 1, createdAt: 1, deletedAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  await (await collections.chatRooms()).updateOne({ _id: roomId }, { $set: roomPreview(latest) });
}

export async function markRead(roomId: string, session: Session, at = new Date().toISOString()): Promise<void> {
  await (await collections.chatReads()).updateOne(
    { _id: `${roomId}|${session.email}` },
    { $set: { roomId, email: session.email, readAt: at } },
    { upsert: true },
  );
  // Mentions in this room count as seen once the room is read.
  await (await collections.notifications()).updateMany(
    { email: session.email, roomId, readAt: null },
    { $set: { readAt: at } },
  );
}

export async function createGroup(session: Session, input: z.infer<typeof newGroupSchema>): Promise<RoomView> {
  const names = await activeUsers();
  const members = [...new Set([session.email, ...input.members.map((m) => m.toLowerCase())])].filter((m) => names.has(m));
  const now = new Date().toISOString();
  const room: ChatRoomDoc = {
    _id: `grp:${randomUUID()}`,
    type: "group",
    name: input.name,
    members,
    createdBy: session.email,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    lastMessage: null,
    syncedAt: null,
  };
  await (await collections.chatRooms()).insertOne(room);
  scheduleWriteback();
  return { ...room, unread: 0, title: room.name };
}

/** Opens (or creates) the direct conversation with another person. */
export async function openDirect(session: Session, email: string): Promise<string> {
  const other = email.toLowerCase();
  if (other === session.email) throw new HttpError(400, "Pick someone else to message.");
  const names = await activeUsers();
  if (!names.has(other)) throw new HttpError(404, "That person isn't an active user.");
  const id = dmId(session.email, other);
  const now = new Date().toISOString();
  await (await collections.chatRooms()).updateOne(
    { _id: id },
    {
      $setOnInsert: {
        type: "direct",
        name: `${session.name} & ${names.get(other)}`,
        members: [session.email, other].sort(),
        createdBy: session.email,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
        lastMessage: null,
        syncedAt: null,
      },
    },
    { upsert: true },
  );
  scheduleWriteback();
  return id;
}

/** Rename a group, add people, or leave it. */
export async function updateGroup(roomId: string, session: Session, input: z.infer<typeof updateGroupSchema>): Promise<void> {
  const room = await roomFor(roomId, session);
  if (room.type !== "group") throw new HttpError(400, "Only groups can be changed.");
  const rooms = await collections.chatRooms();
  const now = new Date().toISOString();
  if (input.leave) {
    await rooms.updateOne({ _id: roomId }, { $pull: { members: session.email }, $set: { updatedAt: now, syncedAt: null } });
  } else {
    const names = await activeUsers();
    const add = (input.add ?? []).map((m) => m.toLowerCase()).filter((m) => names.has(m));
    await rooms.updateOne(
      { _id: roomId },
      { $set: { ...(input.name ? { name: input.name } : {}), updatedAt: now, syncedAt: null }, ...(add.length ? { $addToSet: { members: { $each: add } } } : {}) },
    );
  }
  scheduleWriteback();
}

export interface TitleThreadView {
  threadKey: string;
  isbn: string;
  titleName: string;
  level: string;
  rowLabel: string;
  lastAt: string;
  lastAuthor: string;
  excerpt: string;
  count: number;
}

/** Title comment threads I'm part of (wrote in or was mentioned in), newest first — shown in Messages. */
export async function myTitleThreads(session: Session): Promise<TitleThreadView[]> {
  const comments = await collections.comments();
  const keys = await comments.distinct("threadKey", { deletedAt: null, $or: [{ authorEmail: session.email }, { mentions: session.email }] });
  if (!keys.length) return [];
  const rows = await comments
    .aggregate<{ _id: string; isbn: string; level: string; channelName: string | null; orgName: string | null; accountName: string | null; lastAt: string; lastAuthor: string; body: string; count: number }>([
      { $match: { threadKey: { $in: keys }, deletedAt: null } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$threadKey",
          isbn: { $first: "$isbn" },
          level: { $first: "$level" },
          channelName: { $first: "$channelName" },
          orgName: { $first: "$orgName" },
          accountName: { $first: "$accountName" },
          lastAt: { $first: "$createdAt" },
          lastAuthor: { $first: "$authorName" },
          body: { $first: "$body" },
          count: { $sum: 1 },
        },
      },
      { $sort: { lastAt: -1 } },
      { $limit: 40 },
    ])
    .toArray();
  const titles = new Map(
    (await (await collections.titles()).find({ _id: { $in: [...new Set(rows.map((r) => r.isbn))] } }, { projection: { title: 1 } }).toArray()).map((t) => [t._id, t.title]),
  );
  return rows.map((r) => ({
    threadKey: r._id,
    isbn: r.isbn,
    titleName: titles.get(r.isbn) ?? r.isbn,
    level: r.level,
    rowLabel: r.level === "title" ? "Whole title" : (r.accountName ?? r.orgName ?? r.channelName ?? ""),
    lastAt: r.lastAt,
    lastAuthor: r.lastAuthor,
    excerpt: r.body.length > 120 ? `${r.body.slice(0, 120)}…` : r.body,
    count: r.count,
  }));
}

export const reportSchema = z.object({ reason: z.string().trim().min(3, "Tell the admins what's wrong.").max(500) });

/** Flags a message for admin review (Ask Abrams → Chat moderation). */
export async function reportMessage(id: string, session: Session, reason: string): Promise<void> {
  const msg = await (await collections.chatMessages()).findOne({ _id: id });
  if (!msg || msg.deletedAt) throw new HttpError(404, "That message no longer exists.");
  await roomFor(msg.roomId, session);
  const reports = await collections.chatReports();
  if (await reports.countDocuments({ messageId: id, reporterEmail: session.email, status: "open" }, { limit: 1 })) return;
  await reports.insertOne({
    _id: randomUUID(),
    messageId: id,
    roomId: msg.roomId,
    excerpt: msg.body.slice(0, 280),
    authorEmail: msg.authorEmail,
    reporterEmail: session.email,
    reporterName: session.name,
    reason,
    at: new Date().toISOString(),
    status: "open",
    resolvedBy: null,
    resolvedAt: null,
  });
}
