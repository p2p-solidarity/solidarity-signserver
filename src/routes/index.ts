import { OpenAPIHono } from "@hono/zod-openapi";
import { passkitRouter } from "./passkit/sign";

export const api = new OpenAPIHono<{ Bindings: CloudflareBindings }>()
  .route("/", passkitRouter);

