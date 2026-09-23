import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CommentDoc, NotificationDoc } from "@seg/data";
import { estimateId, normalizeAccount, refForLevel, type AccountRef } from "@seg/domain";
import type { Session } from "../auth/session";
import { collections } from "../db";
import { HttpError } from "../http";
import { getSettings } from "./settings";
import { scheduleWriteback } from "./writeback";

const refSchema = z.object({
  channelId: z.string().nullable(),
  channelName: z.string().nullable(),
  orgId: z.string().nullable(),
  orgName: z.string().nullable(),
  accountId: z.string().nullable(),
  accountName: z.string().nullable(),
});

export const newCommentSchema = z.object({
  level: z.enum(["title", "channel", "org", "account"]),
  ref: refSchema.nullable(),
  body: z.string().trim().min(1, "Write a comment first.").max(4000),
  /** E-mails picked from the @mention list. */
  mentions: z.array(z.string().email()).max(20).default([]),
});

const BLANK_REF: AccountRef = { channelId: null, channelName: null, orgId: null, orgName: null, accountId: null, accountName: null };

export type CommentView = Omit<CommentDoc, "syncedAt">;

export const titleThreadKey = (isbn: string) => `${isbn}|title`;

export function rowLabelOf(level: CommentDoc["level"], ref: AccountRef): string {
  if (level === "title") return "Title";
  if (level === "channel") return ref.channelName ?? ref.channelId ?? "Channel";
  if (level === "org") return `${ref.orgName ?? ref.orgId} · ${ref.channelName ?? ref.channelId}`;
  return `${ref.accountName ?? ref.accountId} · ${ref.orgName ?? ref.orgId}`;
}

export async function listComments(isbn: string): Promise<CommentView[]> {
  return (await collections.comments())
    .find({ isbn, deletedAt: null }, { projection: { syncedAt: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
}

/**
 * Posts a comment on a title or one of its rows and notifies:
 * mentioned people ("mention") and everyone who already took part in the thread ("reply").
 */
export async function postComment(isbn: string, session: Session, input: z.infer<typeof newCommentSchema>): Promise<CommentView> {
  const title = await (await collections.titles()).findOne({ _id: isbn }, { projection: { title: 1 } });
  if (!title) throw new HttpError(404, `Title ${isbn} was not found.`);

  let ref = BLANK_REF;
  let threadKey = titleThreadKey(isbn);
  if (input.level !== "title") {
    if (!input.ref) throw new HttpError(400, "A row comment needs its row.");
    ref = refForLevel(input.level, normalizeAccount(input.ref));
    threadKey = estimateId(isbn, input.level, ref);
  }

  const users = await collections.users();
  const wanted = [...new Set(input.mentions.map((m) => m.toLowerCase()))].filter((m) => m !== session.email);
  const mentioned = wanted.length
    ? (await users.find({ _id: { $in: wanted }, active: true }, { projection: { _id: 1 } }).toArray()).map((u) => u._id)
    : [];

  const comments = await collections.comments();
  const now = new Date().toISOString();
  const comment: CommentDoc = {
    _id: randomUUID(),
    isbn,
    threadKey,
    level: input.level,
    ...ref,
    body: input.body,
    mentions: mentioned,
    authorEmail: session.email,
    authorName: session.name,
    createdAt: now,
    deletedAt: null,
    syncedAt: null,
  };

  const participants = await comments.distinct("authorEmail", { threadKey, deletedAt: null });
  await comments.insertOne(comment);

  const rowLabel = rowLabelOf(input.level, ref);
  const excerpt = input.body.length > 140 ? `${input.body.slice(0, 140)}…` : input.body;
  const note = (email: string, type: NotificationDoc["type"]): NotificationDoc => ({
    _id: randomUUID(),
    email,
    type,
    commentId: comment._id,
    isbn,
    threadKey,
    titleName: title.title,
    rowLabel,
    fromEmail: session.email,
    fromName: session.name,
    excerpt,
    createdAt: now,
    readAt: null,
  });
  const prefs = (await getSettings()).notifications;
  const notifications = [
    ...(prefs.mentions ? mentioned.map((e) => note(e, "mention")) : []),
    ...(prefs.replies ? participants.filter((e) => e !== session.email && !mentioned.includes(e)).map((e) => note(e, "reply")) : []),
  ];
  if (notifications.length) await (await collections.notifications()).insertMany(notifications);

  scheduleWriteback();
  const view: Partial<CommentDoc> = { ...comment };
  delete view.syncedAt;
  return view as CommentView;
}

/** Removes a comment (author or admin). Kept in BigQuery as a deleted version. */
export async function deleteComment(id: string, session: Session): Promise<void> {
  const comments = await collections.comments();
  const comment = await comments.findOne({ _id: id }, { projection: { authorEmail: 1, deletedAt: 1 } });
  if (!comment || comment.deletedAt) throw new HttpError(404, "That comment no longer exists.");
  if (comment.authorEmail !== session.email && session.role !== "admin") {
    throw new HttpError(403, "Only the author or an admin can delete a comment.");
  }
  await comments.updateOne({ _id: id }, { $set: { deletedAt: new Date().toISOString(), syncedAt: null } });
  await (await collections.notifications()).deleteMany({ commentId: id });
  scheduleWriteback();
}

export type NotificationView = Omit<NotificationDoc, "email">;

export async function listNotifications(email: string, limit = 40): Promise<{ items: NotificationView[]; unread: number }> {
  const notifications = await collections.notifications();
  const [items, unread] = await Promise.all([
    notifications.find({ email }, { projection: { email: 0 } }).sort({ createdAt: -1 }).limit(limit).toArray(),
    notifications.countDocuments({ email, readAt: null }),
  ]);
  return { items, unread };
}

export async function unreadCount(email: string): Promise<number> {
  return (await collections.notifications()).countDocuments({ email, readAt: null });
}

export async function markRead(email: string, ids: string[] | "all"): Promise<void> {
  const filter = ids === "all" ? { email, readAt: null } : { email, _id: { $in: ids }, readAt: null };
  await (await collections.notifications()).updateMany(filter, { $set: { readAt: new Date().toISOString() } });
}
