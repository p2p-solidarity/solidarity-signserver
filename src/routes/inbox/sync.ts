import { createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { CloudflareBindings } from "../../types/bindings";
import type { InboxRecord } from "../../db/schema";
import { ownerAuthPayload, verifyOwnerSignature } from "../../lib/inbox/crypto";
import { createInboxDb, listInboxMessages } from "../../lib/inbox/repository";
import { ErrorSchema, SyncQuerySchema, SyncResponseSchema } from "./schemas";

export const syncRoute = createRoute({
  method: "get",
  path: "/sync",
  summary: "Fetch inbox messages for the given pubkey",
  request: {
    query: SyncQuerySchema,
  },
  responses: {
    200: {
      description: "Messages ready for the recipient",
      content: {
        "application/json": {
          schema: SyncResponseSchema,
        },
      },
    },
    401: {
      description: "Signature verification failed",
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

const formatRecord = (record: InboxRecord) => ({
  id: record.id,
  owner_pubkey: record.ownerPubkey,
  blob: record.blob,
  created_at: record.createdAt,
});

export const syncHandler = async (c: Context<{ Bindings: CloudflareBindings }>) => {
  const query = await c.req.valid("query");
  const payload = ownerAuthPayload(query.pubkey);
  const isValid = await verifyOwnerSignature(query.pubkey, query.sig, payload);

  if (!isValid) {
    return c.json({ error: "invalid_signature", detail: "Signature verification failed." }, 401);
  }

  const db = createInboxDb(c.env.INBOX_DB);
  try {
    const rows = await listInboxMessages(db, query.pubkey);
    return c.json(
      {
        messages: rows.map(formatRecord),
      },
      200
    );
  } catch (error) {
    console.error("Failed to list messages", error);
    return c.json(
      { error: "sync_failed", detail: "Failed to retrieve messages. Please try again." },
      500
    );
  }
};

