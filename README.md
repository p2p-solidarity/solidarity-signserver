# solidarity-id

The creds.id ID backend: one Cloudflare Worker (`solidarity-id`) with one D1
database (`solidarity_id`). It stores two things and nothing else:

- **NIP-05 directory** — `name@creds.id` handles bound to Nostr pubkeys.
- **Root vault** — the passkey-encrypted root identity record that lets the
  web builder unlock the same identity as the app. The server only ever sees
  ciphertext.

It also serves the static app association documents the app needs on the
hosts it claims. The Worker sits on creds.id and solidarity.gg routes in front
of the Pages viewer and answers only the paths below.

## Endpoints

| Method | Path | What it does |
|---|---|---|
| `GET` | `/.well-known/nostr.json?name=` | NIP-05 lookup |
| `GET` | `/id/availability?name=` | Is a name free to register |
| `POST` | `/id/register` | Register a name (NIP-98 signed) |
| `DELETE` | `/id` | Release your name (NIP-98 signed) |
| `POST` | `/id/recover` | Rebind a name to a new key with cryptographic evidence |
| `GET` | `/id/history?name=` | Rebind history for a name |
| `PUT` | `/vault/root/:locator` | Store a root vault record (write-once) |
| `GET` | `/vault/root/:locator` | Fetch a root vault record |
| `GET` | `/.well-known/apple-app-site-association` | iOS universal links + passkey `webcredentials` |
| `GET` | `/.well-known/assetlinks.json` | Android App Links + passkeys |
| `GET` | `/oauth/client-metadata.json` | atproto OAuth `client_id` document (solidarity.gg) |

The NIP-05 design is `docs/design-nip05.md` (written when the domain was still
solidarity.gg — read it as creds.id).

### App association files

- Served on creds.id, solidarity.gg and app.solidarity.gg, the hosts the app
  claims in `app.json`; the client metadata only on solidarity.gg, the app's
  `ATPROTO_CLIENT_ID`. Without these routes the Pages SPA would answer with
  `index.html` and iOS / Android verification and Bluesky sign-in fail.
- AASA covers `/#…`, `/@*`, `/c/*`, `/pear/*`, `/websign#req=` and
  `webcredentials` (passkey RP ID creds.id). The OAuth metadata must stay
  identical to the app's `apps/expo/src/atproto/client-metadata.json`.
- `assetlinks.json` needs `ANDROID_SHA256_CERT_FINGERPRINTS` in
  `wrangler.jsonc` (`vars`): the Play app-signing certificate SHA-256, plus the
  upload certificate for builds installed outside Play. Until it is set the
  endpoint answers 404.
- These routes answer before the rate limiter (Apple's CDN and Google's
  verifier fetch from shared IPs).

## Layout

- `src/index.ts` — Worker entry: CORS, rate limit, routers, hourly cron that
  purges expired NIP-05 audit rows (handle rows are permanent tombstones).
- `src/routes/nip05`, `src/lib/nip05` — directory routes and logic.
- `src/routes/rootVault` — root vault routes.
- `src/routes/wellKnown` — app association documents.
- `drizzle/*.sql` — D1 migrations, applied by wrangler. `src/db/schema.ts`
  mirrors them as typed tables.
- `wrangler.jsonc` — Worker config (account, routes, D1, rate limiters, cron).

## Develop

```sh
bun install
bun run dev        # wrangler dev
bun run typecheck
bun test
```

## Deploy

```sh
bun run deploy
```

Needs a `wrangler login` with access to the account that owns the creds.id
zone. `scripts/deploy.sh` finds or creates the D1, writes its id into
`wrangler.jsonc`, applies `drizzle/`, deploys, and probes the public NIP-05
endpoints and every association route. Commit `wrangler.jsonc` if the database id changed.

## Consumers

- App and web: `@solidarity/shared` — `nip05/client.ts` (availability,
  register) and `Nip05HandleResolver` (resolves `creds.id/@name`).
- App: `apps/expo/src/identity/rootVaultSync.ts` (root vault).
