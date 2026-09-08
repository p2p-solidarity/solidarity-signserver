import { createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { CloudflareBindings } from "../../types/bindings";
import { validateNip05Name } from "../../lib/nip05/name";
import { getHandleRebindInfo } from "../../lib/nip05/repository";
import {
  ErrorSchema,
  HistoryQuerySchema,
  HistoryResponseSchema,
} from "./schemas";

/**
 * G5's read side. The viewer calls this alongside handle resolution and must
 * render `rebindGeneration >= 1` as a permanent "this ID was rebound" notice,
 * degrading the badge to `stale` while `reboundAt` is within 90 days.
 *
 * `Cache-Control: no-store` is deliberate. Everything else here is cacheable,
 * but a stale answer would HIDE a recent rebind — the exact failure this
 * marker exists to prevent — so freshness wins over the request saved.
 */
export const historyRoute = createRoute({
  method: "get",
  path: "/id/history",
  summary: "Rebind history for a NIP-05 name",
  request: { query: HistoryQuerySchema },
  responses: {
    200: {
      description: "Rebind marker for the requested name",
      content: { "application/json": { schema: HistoryResponseSchema } },
    },
    404: {
      description: "Name has never been registered",
      content: { "application/json": { schema: ErrorSchema } },
    },
    500: {
      description: "Unexpected failure",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export const historyHandler = async (
  c: Context<{ Bindings: CloudflareBindings }>,
) => {
  const responseHeaders = {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  };
  const validation = validateNip05Name(c.req.query("name") ?? "");
  if (!validation.valid) {
    return c.json({ error: "name_not_found" }, 404, responseHeaders);
  }

  try {
    const info = await getHandleRebindInfo(c.env.INBOX_DB, validation.name);
    if (info === null) {
      return c.json({ error: "name_not_found" }, 404, responseHeaders);
    }
    return c.json(
      {
        name: info.name,
        status: info.status,
        redirectTo: info.redirectTo,
        redirectUntil: info.redirectUntil,
        rebindGeneration: info.rebindGeneration,
        reboundAt: info.reboundAt,
      },
      200,
      responseHeaders,
    );
  } catch (error) {
    console.error("NIP-05 history lookup failed", error);
    return c.json({ error: "storage_failed" }, 500, responseHeaders);
  }
};
