import { collections } from "@/server/db";
import { route } from "@/server/http";

/** Active people, for @mentions. */
export const GET = route(async () => {
  const users = await (await collections.users())
    .find({ active: true }, { projection: { _id: 0, email: 1, name: 1, role: 1 } })
    .sort({ name: 1 })
    .toArray();
  return { users };
});
