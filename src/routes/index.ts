import { OpenAPIHono } from "@hono/zod-openapi";
import type { CloudflareBindings } from "../types/bindings";
import { passkitRouter } from "./passkit/sign";
import { inboxRouter } from "./inbox";

export const api = new OpenAPIHono<{ Bindings: CloudflareBindings }>()
  .route("/", passkitRouter)
  .route("/", inboxRouter);

