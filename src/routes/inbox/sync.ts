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
  try {
    const query = await c.req.valid("query");
    
    // Log received query parameters for debugging (without exposing full values)
    console.log("Sync request received", {
      pubkeyLength: query.pubkey.length,
      sigLength: query.sig.length,
      pubkeyPreview: query.pubkey.substring(0, 20) + "...",
      sigPreview: query.sig.substring(0, 20) + "...",
    });
    
    const payload = ownerAuthPayload(query.pubkey);
    const isValid = await verifyOwnerSignature(query.pubkey, query.sig, payload);

    if (!isValid) {
      return c.json(
        {
          error: "invalid_signature",
          detail: "Signature verification failed. Please ensure you're using base64url encoding for URL query parameters.",
        },
        401
      );
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
  } catch (error) {
    // Handle base64 decoding errors
    if (error instanceof Error && error.message.includes("Invalid base64")) {
      console.error("Base64 decoding error in sync:", error);
      return c.json(
        {
          error: "invalid_base64",
          detail: "Invalid base64/base64url encoding in query parameters. Please use base64url encoding for URL-safe transmission.",
        },
        400
      );
    }
    console.error("Unexpected error in sync handler:", error);
    return c.json(
      { error: "sync_failed", detail: "An unexpected error occurred. Please try again." },
      500
    );
  }
};

