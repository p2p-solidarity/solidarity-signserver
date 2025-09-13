import { OpenAPIHono } from "@hono/zod-openapi";
import { CloudflareBindings } from "./types";
import { ensResolveRoute, ensResolveHandler } from "./api/resolve";
import { ensReverseRoute, ensReverseHandler } from "./api/reverse";

export const ens = new OpenAPIHono<{ Bindings: CloudflareBindings }>()
  .openapi(ensResolveRoute, ensResolveHandler)
  .openapi(ensReverseRoute, ensReverseHandler);
