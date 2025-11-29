import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { CloudflareBindings } from "../../types/bindings";
// @ts-ignore - node-forge works in Cloudflare Workers
import forge from "node-forge";

const SignPassRequestSchema = z.string().describe("Manifest JSON content");

const SignPassResponseSchema = z.instanceof(ArrayBuffer).openapi({
  type: "string",
  format: "binary",
});

const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

const signPassRoute = createRoute({
  method: "post",
  path: "/sign-pass",
  summary: "Sign Apple Wallet Pass Manifest",
  description: "Creates a PKCS#7 detached signature for an Apple Wallet pass manifest using stored certificates",
  request: {
    body: {
      content: {
        "text/plain": {
          schema: SignPassRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "PKCS#7 signature in DER format",
      content: {
        "application/octet-stream": {
          schema: SignPassResponseSchema,
        },
      },
    },
    500: {
      description: "Signing failed",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export const passkitRouter = new OpenAPIHono<{ Bindings: CloudflareBindings }>()
  .openapi(signPassRoute, async (c) => {
    try {
      // 1. Parse request body (manifest.json)
      const manifestJson = await c.req.text();

      // 2. Decode certificates from environment variables (base64 encoded PEM)
      const passCertPem = Buffer.from(c.env.PASS_CERT, "base64").toString("utf-8");
      const passKeyPem = Buffer.from(c.env.PASS_KEY, "base64").toString("utf-8");
      const wwdrCertPem = Buffer.from(c.env.WWDR_CERT, "base64").toString("utf-8");

      // 3. Create PKCS#7 signature using node-forge
      const p7 = forge.pkcs7.createSignedData();

      // Add content (manifest)
      p7.content = forge.util.createBuffer(manifestJson, "utf8");

      // Load certificates
      const signerCert = forge.pki.certificateFromPem(passCertPem);
      const signerKey = forge.pki.privateKeyFromPem(passKeyPem);
      const wwdrCert = forge.pki.certificateFromPem(wwdrCertPem);

      // Add signer
      p7.addCertificate(signerCert);
      p7.addCertificate(wwdrCert);

      p7.addSigner({
        key: signerKey,
        certificate: signerCert,
        digestAlgorithm: forge.pki.oids.sha1, // PassKit requires SHA-1
        authenticatedAttributes: [
          {
            type: forge.pki.oids.contentType,
            value: forge.pki.oids.data,
          },
          {
            type: forge.pki.oids.messageDigest,
          },
          {
            type: forge.pki.oids.signingTime,
            value: new Date(),
          },
        ],
      });

      // Sign (detached = true means signature is separate from content)
      p7.sign({ detached: true });

      // Convert to DER format
      const derBuffer = forge.asn1.toDer(p7.toAsn1()).getBytes();
      const signature = new Uint8Array(derBuffer.length);
      for (let i = 0; i < derBuffer.length; i++) {
        signature[i] = derBuffer.charCodeAt(i);
      }

      console.log(`✅ Generated signature: ${signature.length} bytes`);

      // 4. Return signature as binary
      return c.body(signature, 200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": signature.length.toString(),
      });
    } catch (error) {
      console.error("❌ Signing error:", error);
      return c.json(
        {
          error: "Signing failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  });
