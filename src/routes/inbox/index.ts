import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { CloudflareBindings } from "../../types/bindings";
import type { InboxRecord } from "../../db/schema";
import { sendBackgroundPing } from "./apns";
import { ownerAuthPayload, sealDeviceToken, unsealDeviceToken, verifyOwnerSignature } from "./crypto";
import { createInboxDb, deleteInboxMessages, insertInboxMessage, listInboxMessages } from "./repository";

const ErrorSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});

const MessageSchema = z.object({
  id: z.string().uuid(),
  owner_pubkey: z.string(),
  blob: z.string(),
  created_at: z.number(),
});

const SealRequestSchema = z.object({
  device_token: z.string().min(1).describe("Raw APNs device token"),
});

const SealResponseSchema = z.object({
  sealed_route: z.string().describe("Opaque encrypted route string"),
});

const SendRequestSchema = z.object({
  recipient_pubkey: z.string().min(1),
  blob: z.string().min(1),
  sealed_route: z.string().min(1),
});

const SendResponseSchema = z.object({
  message_id: z.string().uuid(),
  notified: z.boolean(),
  apns_status: z.number().optional(),
  apns_error: z.string().optional(),
});

const SyncQuerySchema = z.object({
  pubkey: z.string().min(1),
  sig: z.string().min(1),
});

const SyncResponseSchema = z.object({
  messages: z.array(MessageSchema),
});

const AckRequestSchema = z.object({
  message_ids: z.array(z.string().uuid()).min(1),
});

const AckResponseSchema = z.object({
  deleted: z.number().min(0),
});

const sealRoute = createRoute({
  method: "post",
  path: "/seal",
  summary: "Seal an APNs device token",
  request: {
    body: {
      content: {
        "application/json": {
          schema: SealRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Encrypted sealed route",
      content: {
        "application/json": {
          schema: SealResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid input",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
  },
});

const sendRoute = createRoute({
  method: "post",
  path: "/send",
  summary: "Store an encrypted payload and trigger push",
  request: {
    body: {
      content: {
        "application/json": {
          schema: SendRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: "Message stored and push attempted",
      content: {
        "application/json": {
          schema: SendResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid sealed route",
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

const syncRoute = createRoute({
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
  },
});

const ackRoute = createRoute({
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
  },
});

export const inboxRouter = new OpenAPIHono<{ Bindings: CloudflareBindings }>()
  .openapi(sealRoute, async (c) => {
    const { device_token } = await c.req.valid("json");
    try {
      const sealedRoute = await sealDeviceToken(device_token, c.env.PUSH_SECRET);
      return c.json({ sealed_route: sealedRoute });
    } catch (error) {
      console.error("Seal failed", error);
      return c.json({ error: "seal_failed", detail: error instanceof Error ? error.message : "Unknown error" }, 400);
    }
  })
  .openapi(sendRoute, async (c) => {
    const payload = await c.req.valid("json");
    const db = createInboxDb(c.env.INBOX_DB);
    const messageId = crypto.randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);

    let deviceToken: string;
    try {
      deviceToken = await unsealDeviceToken(payload.sealed_route, c.env.PUSH_SECRET);
    } catch (error) {
      return c.json({ error: "unseal_failed", detail: error instanceof Error ? error.message : "Invalid sealed route" }, 400);
    }

    await insertInboxMessage(db, {
      id: messageId,
      ownerPubkey: payload.recipient_pubkey,
      blob: payload.blob,
      createdAt,
    });

    const apnsResult = await sendBackgroundPing(c.env, deviceToken);

    if (!apnsResult.ok) {
      console.warn("APNs delivery failed", apnsResult);
    }

    return c.json(
      {
        message_id: messageId,
        notified: apnsResult.ok,
        apns_status: apnsResult.status,
        apns_error: apnsResult.ok ? undefined : apnsResult.error ?? apnsResult.body,
      },
      202,
    );
  })
  .openapi(syncRoute, async (c) => {
    const query = c.req.valid("query");
    const payload = ownerAuthPayload(query.pubkey);
    const isValid = await verifyOwnerSignature(query.pubkey, query.sig, payload);

    if (!isValid) {
      return c.json({ error: "invalid_signature" }, 401);
    }

    const db = createInboxDb(c.env.INBOX_DB);
    const rows = await listInboxMessages(db, query.pubkey);

    return c.json({
      messages: rows.map(formatRecord),
    });
  })
  .openapi(ackRoute, async (c) => {
    const { message_ids } = await c.req.valid("json");
    const db = createInboxDb(c.env.INBOX_DB);
    const deleted = await deleteInboxMessages(db, message_ids);
    return c.json({ deleted });
  });

const formatRecord = (record: InboxRecord) => ({
  id: record.id,
  owner_pubkey: record.ownerPubkey,
  blob: record.blob,
  created_at: record.createdAt,
});

