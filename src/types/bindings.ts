import type { D1Database } from "@cloudflare/workers-types";

export interface CloudflareBindings {
  // PassKit certificate secrets (base64 encoded PEM files)
  PASS_CERT: string;
  PASS_KEY: string;
  WWDR_CERT: string;

  // Rate limiter binding
  RATE_LIMITER: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };

  // Inbox database + crypto secrets
  INBOX_DB: D1Database;
  PUSH_SECRET: string;

  // APNs credentials
  APPLE_P8_KEY: string;
  APPLE_TEAM_ID: string;
  APPLE_KEY_ID: string;
  APNS_TOPIC: string;
  APNS_HOST?: string;
}

export type { CloudflareBindings as default };

