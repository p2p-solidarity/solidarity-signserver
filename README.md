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

## NIP-05 directory (`name@creds.id`)

- Routes on the product domain: `GET https://creds.id/.well-known/nostr.json?name=`, `GET /id/availability`, `POST /id/register`, `DELETE /id`, `POST /id/recover`, `GET /id/history` under `src/routes/nip05`; design in `docs/design-nip05.md` (written when the domain was still solidarity.gg — read it as creds.id).
- It ships as its **own Worker** (`solidarity-id`, entry `src/nip05-worker.ts`, config `wrangler.nip05.jsonc`) because the creds.id / solidarity.gg zones live in a different Cloudflare account than the inbox / PassKit worker, and a Worker route can only be attached from the zone's own account. It has its own D1 (`solidarity_id`) there. The Worker routes sit in front of the creds.id Pages viewer for exactly the directory paths.
- Deploy: `bun run deploy:nip05` (needs a `wrangler login` with access to that account). The script finds or creates the D1, writes its id into `wrangler.nip05.jsonc`, applies `drizzle/`, deploys, and probes the three public endpoints — commit the config if the id changed.
- Consumers: the app (`apps/expo/src/nip05/client.ts`) and `@solidarity/shared`'s `Nip05HandleResolver` (used by both app and web for `creds.id/@name`).
