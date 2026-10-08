import { Hono } from "hono";
import type { CloudflareBindings } from "../../types/bindings";

/**
 * Association files the Solidarity app needs on the hosts it claims
 * (`apps/expo/app.json` in p2p-solidarity/solidarity): creds.id,
 * solidarity.gg and app.solidarity.gg. The viewer on those hosts is a Pages
 * SPA that answers any unknown path with index.html, so these documents are
 * served here, by Worker routes that take precedence for exactly these paths.
 *
 * - apple-app-site-association: iOS universal links (`applinks:`) and
 *   passkeys (`webcredentials:creds.id`, the root-vault RP ID).
 * - assetlinks.json: Android App Links (`autoVerify`) and passkeys
 *   (`get_login_creds`). The signing-certificate fingerprints come from
 *   `ANDROID_SHA256_CERT_FINGERPRINTS`; without one the document is 404,
 *   because an empty target verifies nothing.
 * - oauth/client-metadata.json: the atproto OAuth client_id document; must
 *   match `apps/expo/src/atproto/client-metadata.json` byte for byte.
 */

/** `appleTeamId` + `ios.bundleIdentifier` from app.json. */
export const IOS_APP_ID = "538MCM44UX.kidneyweakx.airmeishi";

/** `android.package` from app.json. */
export const ANDROID_PACKAGE = "gg.solidarity.app";

const FINGERPRINT_PATTERN = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/u;

const CACHE_HEADERS = { "cache-control": "public, max-age=3600" };

/**
 * Only the https routes the app's deep-link parser handles
 * (`apps/expo/src/deeplink/parser.ts`): the Verified Page fragment and
 * `#nostr:<npub>` pointer on `/`, `/@<handle>`, `/c/<uuid>`, `/pear/<did>`
 * and `/websign#req=`. Everything else (the landing page without a fragment,
 * `/edit`, the directory API) stays in the browser.
 */
export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: [IOS_APP_ID],
        components: [
          { "/": "/", "#": "?*", comment: "Verified Page fragment or #nostr: pointer" },
          { "/": "/@*", comment: "Verified Page by handle" },
          { "/": "/c/*", comment: "Card link" },
          { "/": "/pear/*", comment: "Pear private-view request" },
          { "/": "/websign", "#": "req=*", comment: "Web signing request" },
        ],
      },
    ],
  },
  webcredentials: {
    apps: [IOS_APP_ID],
  },
} as const;

export const ATPROTO_CLIENT_METADATA = {
  client_id: "https://solidarity.gg/oauth/client-metadata.json",
  client_name: "Solidarity",
  client_uri: "https://solidarity.gg",
  redirect_uris: [
    "solidarity:/oauth/atproto/callback",
    "https://solidarity.gg/oauth/atproto/callback",
  ],
  scope: "atproto transition:generic",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  application_type: "native",
  dpop_bound_access_tokens: true,
} as const;

/** Comma- or whitespace-separated `AA:BB:…` SHA-256 fingerprints, normalised; invalid entries dropped. */
export function parseCertFingerprints(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(/[\s,]+/u)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => FINGERPRINT_PATTERN.test(value));
}

export function buildAssetLinks(fingerprints: readonly string[]) {
  return [
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: [...fingerprints],
      },
    },
  ];
}

export const wellKnownRouter = new Hono<{ Bindings: CloudflareBindings }>()
  .get("/.well-known/apple-app-site-association", (c) =>
    c.json(APPLE_APP_SITE_ASSOCIATION, 200, CACHE_HEADERS),
  )
  .get("/.well-known/assetlinks.json", (c) => {
    const fingerprints = parseCertFingerprints(c.env.ANDROID_SHA256_CERT_FINGERPRINTS);
    if (fingerprints.length === 0) {
      console.error("assetlinks.json: ANDROID_SHA256_CERT_FINGERPRINTS has no valid fingerprint");
      return c.json({ error: "not configured" }, 404, { "cache-control": "no-store" });
    }
    return c.json(buildAssetLinks(fingerprints), 200, CACHE_HEADERS);
  })
  .get("/oauth/client-metadata.json", (c) =>
    c.json(ATPROTO_CLIENT_METADATA, 200, CACHE_HEADERS),
  );
