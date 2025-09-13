import { OpenAPIHono } from "@hono/zod-openapi";
import { ens } from "./ens";
import { groups } from "./groups";

// Types for Cloudflare bindings
interface CloudflareBindings {
  ENS_CONTRACT_ADDRESS: string;
  GROUP_CONTRACT_ADDRESS: string;
  SHOUTOUT_KV: KVNamespace;
}

export const api = new OpenAPIHono<{ Bindings: CloudflareBindings }>()
  .route("/ens", ens)
  .route("/groups", groups)
