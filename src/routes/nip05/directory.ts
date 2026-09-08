import { createRoute } from "@hono/zod-openapi";
import type { RouteConfigToTypedResponse } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { CloudflareBindings } from "../../types/bindings";
import { readDirectoryCache, writeDirectoryCache } from "../../lib/nip05/cache";
import { findActiveDirectoryEntry } from "../../lib/nip05/repository";
import {
  DirectoryQuerySchema,
  DirectoryResponseSchema,
  ErrorSchema,
} from "./schemas";

const DIRECTORY_CACHE_CONTROL = "public, max-age=300";

export const directoryRoute = createRoute({
  method: "get",
  path: "/.well-known/nostr.json",
  summary: "Resolve a NIP-05 name to its pubkey and relays",
  request: {
    query: DirectoryQuerySchema,
  },
  responses: {
    200: {
      description: "NIP-05 directory document",
      content: {
        "application/json": {
          schema: DirectoryResponseSchema,
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

export const directoryHandler = async (c: Context<{ Bindings: CloudflareBindings }>) => {
  const requestedName = c.req.query("name");
  const name =
    requestedName === undefined || requestedName === "_"
      ? "_"
      : requestedName.toLowerCase();

  const cached = await readDirectoryCache(c.req.url, name);
  if (cached !== null) {
    // The cached Response was produced by this handler, so it already carries
    // the declared 200 body and headers.
    return cached as unknown as RouteConfigToTypedResponse<typeof directoryRoute>;
  }

  try {
    const entry = await findActiveDirectoryEntry(c.env.INBOX_DB, name);
    const body =
      entry === null
        ? { names: {} }
        : {
            names: { [entry.name]: entry.pubkey },
            relays: { [entry.pubkey]: entry.relays },
          };
    const response = c.json(body, 200);
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Cache-Control", DIRECTORY_CACHE_CONTROL);
    writeDirectoryCache(c.req.url, name, response, c.executionCtx);
    return response;
  } catch (error) {
    console.error("NIP-05 directory lookup failed", error);
    return c.json({ error: "storage_failed" }, 500);
  }
};
