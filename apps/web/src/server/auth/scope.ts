import type { Filter } from "mongodb";
import type { TitleDoc } from "@seg/data";
import { collections } from "../db";
import { HttpError } from "../http";
import type { Session } from "./session";

/**
 * Division / imprint access (Admin console → Access by division / imprint).
 * Everyone sees every title ("*") unless an admin restricted them; a restricted person sees
 * — and, as an editor, changes — only titles in their divisions and imprints. Admins always see everything.
 */
type Who = Pick<Session, "role" | "scope"> | null | undefined;

const restriction = (who: Who) => (!who || who.role === "admin" || !who.scope ? null : who.scope);

/** Mongo filter on `titles` for what this person may see ({} = everything). */
export function titleScopeFilter(who: Who): Filter<TitleDoc> {
  const s = restriction(who);
  if (!s) return {};
  return {
    ...(s.divisions.length ? { division: { $in: s.divisions } } : {}),
    ...(s.imprints.length ? { imprint: { $in: s.imprints } } : {}),
  };
}

export function canSeeTitle(who: Who, title: { division: string | null; imprint: string | null }): boolean {
  const s = restriction(who);
  if (!s) return true;
  return (!s.divisions.length || s.divisions.includes(title.division ?? "")) && (!s.imprints.length || s.imprints.includes(title.imprint ?? ""));
}

export const NOT_YOURS = "This title isn't in the divisions or imprints you have access to.";

/** Throws 403 when the title exists but is outside the person's access. */
export async function assertCanSeeTitle(who: Who, isbn: string): Promise<void> {
  if (!restriction(who)) return;
  const t = await (await collections.titles()).findOne({ _id: isbn }, { projection: { division: 1, imprint: 1 } });
  if (t && !canSeeTitle(who, t)) throw new HttpError(403, NOT_YOURS);
}

/** ISBNs this person may see, or null when they see everything. */
export async function visibleIsbns(who: Who): Promise<Set<string> | null> {
  if (!restriction(who)) return null;
  const ids = await (await collections.titles()).distinct("_id", titleScopeFilter(who));
  return new Set(ids as string[]);
}

/** Keeps only the entries of an ISBN-keyed record this person may see. */
export async function pickVisible<T>(who: Who, byIsbn: Record<string, T>): Promise<Record<string, T>> {
  const visible = await visibleIsbns(who);
  if (!visible) return byIsbn;
  return Object.fromEntries(Object.entries(byIsbn).filter(([isbn]) => visible.has(isbn)));
}
