import { createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { CloudflareBindings } from "../../types/bindings";
import { verifyNip98Authorization } from "../../lib/nip05/auth";
import { purgeDirectoryCaches } from "../../lib/nip05/cache";
import { releaseHandle } from "../../lib/nip05/repository";
import { ErrorSchema, ReleaseResponseSchema } from "./schemas";

export const releaseRoute = createRoute({
  method: "delete",
  path: "/id",
  summary: "Release the active NIP-05 handle of the authenticated pubkey",
  responses: {
    200: {
      description: "Released handle name, or null when none was active",
      content: {
        "application/json": {
          schema: ReleaseResponseSchema,
        },
      },
    },
    401: {
      description: "NIP-98 authorization failed",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    500: {
      description: "Unexpected failure",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

export const releaseHandler = async (c: Context<{ Bindings: CloudflareBindings }>) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const auth = verifyNip98Authorization({
    authorization: c.req.header("authorization"),
    method: c.req.method,
    requestUrl: c.req.url,
    nowSeconds,
  });
  if (!auth.ok) {
    return c.json({ error: "invalid_auth", detail: auth.detail }, 401);
  }

  try {
    const result = await releaseHandle(c.env.INBOX_DB, {
      pubkey: auth.event.pubkey,
      eventId: auth.event.id,
      authEvent: auth.authEvent,
      nowSeconds,
    });
    if (!result.ok) {
      return c.json({ error: "invalid_auth", detail: "replay" }, 401);
    }

    if (result.released !== null) {
      await purgeDirectoryCaches(c.req.url, [result.released]);
    }
    return c.json({ released: result.released }, 200);
  } catch (error) {
    console.error("NIP-05 release failed", error);
    return c.json({ error: "storage_failed" }, 500);
  }
};
