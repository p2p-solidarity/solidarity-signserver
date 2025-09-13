import { OpenAPIHono } from "@hono/zod-openapi";
import { CloudflareBindings } from "./types";
import { groupCreateRoute, groupCreateHandler } from "./api/create";
import { groupRootRoute, groupRootHandler } from "./api/root";
import { addMemberRoute, addMemberHandler } from "./api/add-member";
import { revokeMemberRoute, revokeMemberHandler } from "./api/revoke-member";

export const groups = new OpenAPIHono<{ Bindings: CloudflareBindings }>()
  .openapi(groupCreateRoute, groupCreateHandler)
  .openapi(groupRootRoute, groupRootHandler)
  .openapi(addMemberRoute, addMemberHandler)
  .openapi(revokeMemberRoute, revokeMemberHandler);
