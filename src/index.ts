import type { ExportedHandlerScheduledHandler } from "@cloudflare/workers-types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { prettyJSON } from "hono/pretty-json";
import { cors } from "hono/cors";
import { swaggerUI } from "@hono/swagger-ui";
import { api } from "./routes/index";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import type { CloudflareBindings } from "./types/bindings";
import { createInboxDb, purgeExpiredMessages } from "./lib/inbox/repository";

const openapi_documentation_route = "/openapi.json";

const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>().doc(openapi_documentation_route, {
  openapi: "3.1.0",
  info: {
    version: "1.0.0",
    title: "PassKit Signing API",
    description: "Serverless Apple Wallet Pass signing service using PKCS#7",
  },
});

app
  .use("*", cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS", "PUT", "DELETE"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }))
  .use("*", rateLimitMiddleware)
  // .get("/docs", swaggerUI({ url: openapi_documentation_route }))
  .use(prettyJSON())
  .route("/", api);


export default app;

export const scheduled: ExportedHandlerScheduledHandler<CloudflareBindings> = async (event, env, ctx) => {
  ctx.waitUntil(runInboxCleanup(env));
};

async function runInboxCleanup(env: CloudflareBindings) {
  const db = createInboxDb(env.INBOX_DB);
  const cutoffSeconds = Math.floor(Date.now() / 1000) - 60 * 60 * 24;
  const removed = await purgeExpiredMessages(db, cutoffSeconds);
  console.log(`🧹 Purged ${removed} expired inbox entries`);
}

export type { CloudflareBindings } from "./types/bindings";

