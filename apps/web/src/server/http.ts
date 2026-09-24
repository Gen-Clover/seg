import { NextResponse } from "next/server";
import { z } from "zod";
import type { Role } from "@seg/data";
import { currentSession } from "./auth/current";
import type { Session } from "./auth/session";
import { getSettings, type AppSettings } from "./services/settings";

type FeatureKey = keyof AppSettings["features"];

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Handler<C> = (ctx: { request: Request; session: Session; params: C }) => Promise<Response | unknown>;

/**
 * Wraps a route handler: checks the session and role, maps errors to JSON responses.
 * Every API route goes through this — nothing is reachable without a valid session.
 */
export function route<C = Record<string, string>>(
  handler: Handler<C>,
  options: {
    roles?: Role[];
    /** Changes data: blocked for non-admins while maintenance mode is on. */
    write?: boolean;
    /** Only available while this module is switched on in the admin console. */
    feature?: FeatureKey;
  } = {},
) {
  return async (request: Request, context: { params: Promise<C> }) => {
    const started = performance.now();
    try {
      const session = await currentSession();
      if (!session) throw new HttpError(401, "Please sign in.");
      if (options.roles && !options.roles.includes(session.role)) {
        throw new HttpError(403, "You don't have permission to do that.");
      }
      if (options.write || options.feature) {
        const settings = await getSettings();
        if (options.feature && !settings.features[options.feature]) throw new HttpError(404, "This feature is turned off by an administrator.");
        if (options.write && settings.maintenance.on && session.role !== "admin") throw new HttpError(503, settings.maintenance.message);
      }
      const params = (await context?.params) ?? ({} as C);
      const result = await handler({ request, session, params });
      const response = result instanceof Response ? result : NextResponse.json(result);
      response.headers.set("Server-Timing", `app;dur=${(performance.now() - started).toFixed(1)}`);
      return response;
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid request.", details: err.issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
  return schema.parse(body);
}
