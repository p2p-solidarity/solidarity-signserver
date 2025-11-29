import { createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { CloudflareBindings } from "../../types/bindings";
import { sealDeviceToken } from "../../lib/inbox/crypto";
import { ErrorSchema, SealRequestSchema, SealResponseSchema } from "./schemas";

export const sealRoute = createRoute({
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

export const sealHandler = async (c: Context<{ Bindings: CloudflareBindings }>) => {
  const { device_token } = await c.req.valid("json");
  try {
    const sealedRoute = await sealDeviceToken(device_token, c.env.PUSH_SECRET);
    return c.json({ sealed_route: sealedRoute }, 200);
  } catch (error) {
    console.error("Seal failed", error);
    return c.json(
      { error: "seal_failed", detail: "Failed to encrypt device token. Please verify the input." },
      400
    );
  }
};

