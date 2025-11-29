```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## Minimal inbox API

- D1 schema lives in `drizzle/0000_inbox.sql` and `src/db/schema.ts`. Apply it with `wrangler d1 migrations apply` after wiring the `INBOX_DB` binding.
- The worker exposes `/seal`, `/send`, `/sync`, and `/ack` under `src/routes/inbox`.
- Secrets required by the worker:
  - `PUSH_SECRET`: AES-256 key used to seal/unseal device tokens (base64, hex, or raw string).
  - `APPLE_P8_KEY`: Base64-encoded or plain PKCS#8 `.p8` contents.
  - `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APNS_TOPIC`, optional `APNS_HOST`.
- Configure the cron trigger in `wrangler.jsonc` to keep the inbox table clean (24h TTL).
