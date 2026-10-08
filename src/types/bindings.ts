import type { D1Database } from "@cloudflare/workers-types";

export interface CloudflareBindings {
  // Rate limiter binding
  RATE_LIMITER: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };
  REGISTER_RATE_LIMITER: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };

  // NIP-05 directory + root vault database
  ID_DB: D1Database;

  // SHA-256 signing-certificate fingerprints for assetlinks.json
  ANDROID_SHA256_CERT_FINGERPRINTS?: string;
}

export type { CloudflareBindings as default };
