import { OpenAPIHono } from "@hono/zod-openapi";
import { prettyJSON } from "hono/pretty-json";
import { cors } from "hono/cors";
import { swaggerUI } from "@hono/swagger-ui";
import { api } from "./routes/index";

// Types for Cloudflare bindings
interface CloudflareBindings {
  // PassKit certificate secrets (base64 encoded PEM files)
  PASS_CERT: string;
  PASS_KEY: string;
  WWDR_CERT: string;
}

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
  // .get("/docs", swaggerUI({ url: openapi_documentation_route }))
  .use(prettyJSON())
  .route("/", api);


export default app;

