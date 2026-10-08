import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { nip05Router } from "./routes/nip05";
import { rootVaultRouter } from "./routes/rootVault";
import { runNip05Cleanup } from "./schedules/index";
import type { CloudflareBindings } from "./types/bindings";

/**
 * solidarity-id — the `creds.id` ID backend.
 *
 * Serves the NIP-05 directory (`name@creds.id`, `/.well-known/nostr.json`,
 * `/id/*`) and the passkey root vault (`/vault/root/*`) on creds.id routes in
 * front of the Pages viewer, backed by the `solidarity_id` D1. The hourly
 * cron purges expired NIP-05 audit rows. `bun run deploy` does the whole
 * thing (scripts/deploy.sh).
 */
const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

app
  .use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["POST", "PUT", "GET", "OPTIONS", "DELETE"],
      maxAge: 600,
    }),
  )
  .use("*", rateLimitMiddleware)
  .route("/", rootVaultRouter)
  .route("/", nip05Router);

export default {
  fetch: app.fetch,
  scheduled: async (
    _event: ScheduledEvent,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ) => {
    ctx.waitUntil(
      runNip05Cleanup(env).catch((error) => {
        console.error("❌ NIP-05 cleanup failed:", error);
      }),
    );
  },
};
