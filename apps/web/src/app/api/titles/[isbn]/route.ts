import { route } from "@/server/http";
import { getTitleDetail } from "@/server/services/titles";

export const GET = route<{ isbn: string }>(async ({ params }) => getTitleDetail(params.isbn));
