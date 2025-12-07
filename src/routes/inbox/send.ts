import { createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { CloudflareBindings } from "../../types/bindings";
import { sendNotification } from "../../lib/inbox/apns";
import { unsealDeviceToken, utf8Encode, verifyOwnerSignature } from "../../lib/inbox/crypto";
import {
  createInboxDb,
  getMessageCountForOwner,
  insertInboxMessage,
} from "../../lib/inbox/repository";
import {
  ErrorSchema,
  SendRequestSchema,
  SendResponseSchema,
} from "./schemas";
import type { z } from "zod";

type SendRequest = z.infer<typeof SendRequestSchema>;

export const sendRoute = createRoute({
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
    401: {
      description: "Invalid sender signature",
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
    },
    429: {
      description: "Rate limit exceeded or recipient inbox full",
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

export const sendHandler = async (c: Context<{ Bindings: CloudflareBindings }>) => {
  // Rate limiting for senders
  const clientIP =
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for") ||
    "unknown";
  const rateLimitKey = `send:${clientIP}`;
  const { success } = await c.env.RATE_LIMITER.limit({ key: rateLimitKey });
  if (!success) {
    return c.json({ error: "rate_limit_exceeded", detail: "Too many send requests. Please try again later." }, 429);
  }

  const rawPayload = await c.req.json();
  const payload = SendRequestSchema.parse(rawPayload) as SendRequest;
  const db = createInboxDb(c.env.INBOX_DB);

  // Optional sender signature verification
  if (payload.sender_pubkey && payload.sender_sig) {
    // Create payload from message content for signature verification
    const sendPayload = utf8Encode(
      JSON.stringify({
        recipient_pubkey: payload.recipient_pubkey,
        blob: payload.blob,
        sealed_route: payload.sealed_route,
      })
    );
    const isValidSender = await verifyOwnerSignature(payload.sender_pubkey, payload.sender_sig, sendPayload);
    if (!isValidSender) {
      return c.json(
        { error: "invalid_sender_signature", detail: "Sender signature verification failed." },
        401
      );
    }
  }

  // Check message count limit per recipient (max 1000 messages per recipient)
  const messageCount = await getMessageCountForOwner(db, payload.recipient_pubkey);
  if (messageCount >= 1000) {
    return c.json(
      { error: "recipient_inbox_full", detail: "Recipient inbox has reached maximum capacity." },
      429
    );
  }

  const messageId = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);

  let deviceToken: string;
  try {
    deviceToken = await unsealDeviceToken(payload.sealed_route, c.env.PUSH_SECRET);
  } catch (error) {
    console.error("Unseal failed", error);
    return c.json(
      { error: "invalid_sealed_route", detail: "The sealed route is invalid or corrupted." },
      400
    );
  }

  try {
    await insertInboxMessage(db, {
      id: messageId,
      ownerPubkey: payload.recipient_pubkey,
      blob: payload.blob,
      createdAt,
    });
  } catch (error) {
    console.error("Failed to insert message", error);
    return c.json(
      { error: "storage_failed", detail: "Failed to store message. Please try again." },
      500
    );
  }

  // Send notification with alert payload
  const apnsResult = await sendNotification(c.env, deviceToken, {
    aps: {
      alert: {
        title: "[Sakura] New message",
        body: "You have a new sakura message",
      },
      sound: "default",
      badge: 1,
    },
    message_id: messageId,
  });

  if (!apnsResult.ok) {
    // Parse APNs error reason from body if available
    let apnsReason: string | undefined;
    if (apnsResult.body) {
      try {
        const bodyJson = JSON.parse(apnsResult.body);
        apnsReason = bodyJson.reason;
      } catch {
        // Ignore parse errors
      }
    }

    // Log APNs failure with filtered sensitive data
    console.warn("APNs delivery failed", {
      messageId,
      status: apnsResult.status,
      reason: apnsReason || apnsResult.error,
      // Filter out device token - only log prefix for debugging
      deviceTokenPrefix: deviceToken.slice(0, 8),
    });
  } else {
    console.log("APNs delivery succeeded", {
      messageId,
      status: apnsResult.status,
    });
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
};

