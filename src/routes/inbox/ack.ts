import { createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { CloudflareBindings } from "../../types/bindings";
import { ownerAuthPayload, verifyOwnerSignature } from "../../lib/inbox/crypto";
import {
  createInboxDb,
  deleteInboxMessages,
  verifyMessageOwnership,
} from "../../lib/inbox/repository";
import { AckRequestSchema, AckResponseSchema, ErrorSchema } from "./schemas";

export const ackRoute = createRoute({
  method: "post",
  path: "/ack",
  summary: "Delete delivered messages",
  request: {
    body: {
      content: {
        "application/json": {
          schema: AckRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Deletion summary",
      content: {
        "application/json": {
          schema: AckResponseSchema,
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
    403: {
      description: "Message ownership verification failed",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

export const ackHandler = async (c: Context<{ Bindings: CloudflareBindings }>) => {
  const { message_ids, pubkey, sig } = await c.req.valid("json");
  const db = createInboxDb(c.env.INBOX_DB);

  // Verify signature
  const payload = ownerAuthPayload(pubkey);
  const isValid = await verifyOwnerSignature(pubkey, sig, payload);
  if (!isValid) {
    return c.json({ error: "invalid_signature", detail: "Signature verification failed." }, 401);
  }

  // Verify message ownership
  const ownedMessageIds = await verifyMessageOwnership(db, message_ids, pubkey);
  if (ownedMessageIds.length !== message_ids.length) {
    return c.json(
      {
        error: "unauthorized_deletion",
        detail: "Some messages do not belong to the specified public key.",
      },
      403
    );
  }

  // Delete only owned messages
  const deleted = await deleteInboxMessages(db, ownedMessageIds);
  return c.json({ deleted }, 200);
};

