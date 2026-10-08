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
  INBOX_DB: D1Database;
}

export type { CloudflareBindings as default };
