import type { ExportedHandlerScheduledHandler } from "@cloudflare/workers-types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { prettyJSON } from "hono/pretty-json";
import { cors } from "hono/cors";
// import { swaggerUI } from "@hono/swagger-ui";
import { api } from "./routes/index";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import type { CloudflareBindings } from "./types/bindings";
import { runInboxCleanup } from "./schedules/index";
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


export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: CloudflareBindings, ctx: ExecutionContext) => {
    ctx.waitUntil(
      runInboxCleanup(env).catch((error) => {
        console.error("❌ Inbox cleanup failed:", error);
      })
    );
  }
}

export type { CloudflareBindings } from "./types/bindings";

