import { OpenAPIHono } from "@hono/zod-openapi";
import type { CloudflareBindings } from "../types/bindings";
import { inboxRouter } from "./inbox";
import { nip05Router } from "./nip05";

export const api = new OpenAPIHono<{ Bindings: CloudflareBindings }>()
  .route("/", inboxRouter)
  .route("/", nip05Router);
