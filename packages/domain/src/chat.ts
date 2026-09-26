/** Ask Abrams chat rules: the short excerpt and the room's conversation-list preview. */

export const EXCERPT_LENGTH = 140;

/** A short excerpt of a message for previews and notifications: first 140 characters, then "…". */
export function messageExcerpt(body: string, max = EXCERPT_LENGTH): string {
  return body.length > max ? `${body.slice(0, max)}…` : body;
}

export interface PreviewMessage {
  authorName: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface RoomPreview {
  lastMessage: { authorName: string; excerpt: string } | null;
  lastMessageAt: string | null;
}

/**
 * The preview a room shows in the conversation list: the latest message that hasn't been deleted
 * (by its author or in moderation), timed by when it was first sent — an edit doesn't move it.
 * With no message left the preview is empty ("No messages yet").
 */
export function roomPreview(messages: readonly PreviewMessage[]): RoomPreview {
  let latest: PreviewMessage | undefined;
  for (const m of messages) if (!m.deletedAt && (!latest || m.createdAt > latest.createdAt)) latest = m;
  return latest
    ? { lastMessage: { authorName: latest.authorName, excerpt: messageExcerpt(latest.body) }, lastMessageAt: latest.createdAt }
    : { lastMessage: null, lastMessageAt: null };
}
