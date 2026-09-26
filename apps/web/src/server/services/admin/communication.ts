import { randomUUID } from "node:crypto";
import type { ChatMessageDoc } from "@seg/data";
import type { Session } from "../../auth/session";
import { collections } from "../../db";
import { HttpError } from "../../http";
import { messageExcerpt } from "@seg/domain";
import { EVERYONE, refreshRoomPreview } from "../chat";
import { audit, getSettings, updateSettings, type Announcement } from "../settings";
import { scheduleWriteback } from "../writeback";

/** Recent messages across every room (including private groups and direct messages). */
export async function moderationOverview(q?: string) {
  const [rooms, messages, reports] = await Promise.all([
    (await collections.chatRooms()).find({}, { projection: { syncedAt: 0 } }).sort({ lastMessageAt: -1 }).toArray(),
    (await collections.chatMessages())
      .find(q ? { body: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } } : {}, { projection: { syncedAt: 0 } })
      .sort({ createdAt: -1 })
      .limit(150)
      .toArray(),
    (await collections.chatReports()).find({}).sort({ status: 1, at: -1 }).limit(200).toArray(),
  ]);
  const counts = await (await collections.chatMessages())
    .aggregate<{ _id: string; n: number }>([{ $match: { deletedAt: null } }, { $group: { _id: "$roomId", n: { $sum: 1 } } }])
    .toArray();
  const countBy = new Map(counts.map((c) => [c._id, c.n]));
  const roomName = new Map(rooms.map((r) => [r._id, r.type === "direct" ? r.name : r.name]));
  return {
    rooms: rooms.map((r) => ({ ...r, messages: countBy.get(r._id) ?? 0 })),
    messages: messages.map((m) => ({ ...m, roomName: roomName.get(m.roomId) ?? m.roomId })),
    reports: reports.map((r) => ({ ...r, roomName: roomName.get(r.roomId) ?? r.roomId })),
  };
}

export async function moderateMessage(id: string, admin: Session, reason: string) {
  const messages = await collections.chatMessages();
  const msg = await messages.findOne({ _id: id });
  if (!msg) throw new HttpError(404, "That message no longer exists.");
  const now = new Date().toISOString();
  if (!msg.deletedAt) {
    await messages.updateOne({ _id: id }, { $set: { deletedAt: now, syncedAt: null } });
    await refreshRoomPreview(msg.roomId);
  }
  await (await collections.chatReports()).updateMany({ messageId: id, status: "open" }, { $set: { status: "removed", resolvedBy: admin.email, resolvedAt: now } });
  await (await collections.notifications()).deleteMany({ commentId: id });
  await audit(admin, "chat", "remove message", `Removed a message by ${msg.authorName}: "${msg.body.slice(0, 80)}"${reason ? ` — ${reason}` : ""}`);
  scheduleWriteback();
}

export async function dismissReport(id: string, admin: Session) {
  const res = await (await collections.chatReports()).updateOne({ _id: id, status: "open" }, { $set: { status: "dismissed", resolvedBy: admin.email, resolvedAt: new Date().toISOString() } });
  if (!res.matchedCount) throw new HttpError(404, "That report was already handled.");
  await audit(admin, "chat", "dismiss report", `Dismissed report ${id}`);
}

/** Archive (hidden, read-only), restore, or delete a group. Deleting also removes its messages. */
export async function setRoomState(roomId: string, action: "archive" | "restore" | "delete", admin: Session) {
  if (roomId === EVERYONE) throw new HttpError(400, "The Everyone room can't be archived or deleted.");
  const rooms = await collections.chatRooms();
  const room = await rooms.findOne({ _id: roomId });
  if (!room) throw new HttpError(404, "That conversation doesn't exist.");
  const now = new Date().toISOString();
  if (action === "archive") await rooms.updateOne({ _id: roomId }, { $set: { archivedAt: now, updatedAt: now, syncedAt: null } });
  if (action === "restore") await rooms.updateOne({ _id: roomId }, { $set: { archivedAt: null, updatedAt: now, syncedAt: null } });
  if (action === "delete") {
    await rooms.updateOne({ _id: roomId }, { $set: { archivedAt: now, members: [], updatedAt: now, syncedAt: null } });
    await (await collections.chatMessages()).updateMany({ roomId, deletedAt: null }, { $set: { deletedAt: now, syncedAt: null } });
  }
  await audit(admin, "chat", `${action} room`, `${action[0]!.toUpperCase()}${action.slice(1)}d "${room.name}"`);
  scheduleWriteback();
}

/* ---------------- Announcements ---------------- */

export async function saveAnnouncement(input: Omit<Announcement, "id" | "createdBy" | "createdAt"> & { id?: string }, admin: Session) {
  const s = await getSettings();
  const list = [...s.announcements];
  const i = input.id ? list.findIndex((a) => a.id === input.id) : -1;
  const record: Announcement = {
    id: input.id ?? randomUUID(),
    text: input.text,
    tone: input.tone,
    active: input.active,
    from: input.from,
    until: input.until,
    createdBy: i >= 0 ? list[i]!.createdBy : admin.email,
    createdAt: i >= 0 ? list[i]!.createdAt : new Date().toISOString(),
  };
  if (i >= 0) list[i] = record;
  else list.unshift(record);
  await updateSettings("announcements", list, admin, `${i >= 0 ? "Updated" : "Added"} announcement: "${input.text.slice(0, 80)}" (${input.active ? "showing" : "hidden"})`);
  return record;
}

export async function deleteAnnouncement(id: string, admin: Session) {
  const s = await getSettings();
  const a = s.announcements.find((x) => x.id === id);
  if (!a) throw new HttpError(404, "That announcement no longer exists.");
  await updateSettings("announcements", s.announcements.filter((x) => x.id !== id), admin, `Deleted announcement: "${a.text.slice(0, 80)}"`);
}

/** Posts a message to the Everyone room from "SEG Admin". */
export async function postAsAdmin(text: string, admin: Session) {
  const now = new Date().toISOString();
  const message: ChatMessageDoc = {
    _id: randomUUID(),
    roomId: EVERYONE,
    authorEmail: "seg-admin@system",
    authorName: "SEG Admin",
    body: text,
    mentions: [],
    titleRefs: [],
    createdAt: now,
    editedAt: null,
    deletedAt: null,
    syncedAt: null,
  };
  await (await collections.chatMessages()).insertOne(message);
  await (await collections.chatRooms()).updateOne(
    { _id: EVERYONE },
    { $set: { lastMessageAt: now, lastMessage: { authorName: "SEG Admin", excerpt: messageExcerpt(text) }, updatedAt: now } },
  );
  await audit(admin, "announcements", "post to Everyone", `Posted to Everyone: "${text.slice(0, 80)}"`);
  scheduleWriteback();
}

/* ---------------- Assistant ---------------- */

export async function assistantStats(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const log = await collections.assistantLog();
  const [total, answered, byIntent, unanswered, recent] = await Promise.all([
    log.countDocuments({ at: { $gte: since } }),
    log.countDocuments({ at: { $gte: since }, answered: true }),
    log.aggregate<{ _id: string; n: number }>([{ $match: { at: { $gte: since } } }, { $group: { _id: "$intent", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    log
      .aggregate<{ _id: string; n: number; last: string; example: string }>([
        { $match: { at: { $gte: since }, answered: false } },
        { $group: { _id: { $toLower: "$text" }, n: { $sum: 1 }, last: { $max: "$at" }, example: { $first: "$text" } } },
        { $sort: { n: -1, last: -1 } },
        { $limit: 30 },
      ])
      .toArray(),
    log.find({ at: { $gte: since } }, { projection: { expiresAt: 0 } }).sort({ at: -1 }).limit(50).toArray(),
  ]);
  return { days, total, answered, byIntent, unanswered, recent };
}
