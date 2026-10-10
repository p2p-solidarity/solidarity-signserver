import { Hono } from "hono";
import type { CloudflareBindings } from "../../types/bindings";

/**
 * App-link association files for creds.id, so `creds.id/@name` and
 * `creds.id/#<payload>` open the app. The app claims creds.id in
 * `apps/expo/app.json` (`applinks:creds.id`, Android `autoVerify`) and
 * routes only `/@<handle>` and Verified Page fragments there
 * (`apps/expo/src/deeplink/parser.ts`).
 *
 * Apple and Google fetch these without following redirects, so they must be
 * a 200 with JSON on creds.id itself — the Pages viewer would answer with
 * its SPA HTML, hence the Worker routes.
 */

/** Team ID + bundle ID from `apps/expo/app.json`. */
export const IOS_APP_ID = "538MCM44UX.kidneyweakx.airmeishi";
/** `android.package` from `apps/expo/app.json`. */
export const ANDROID_PACKAGE = "gg.solidarity.app";

// First match wins: the excludes keep pages the app sends people to in the
// browser (Pro checkout, websign) and the API paths out of the app.
export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: [IOS_APP_ID],
        components: [
          { "/": "/upgrade*", exclude: true },
          { "/": "/websign*", exclude: true },
          { "/": "/id/*", exclude: true },
          { "/": "/vault/*", exclude: true },
          { "/": "/.well-known/*", exclude: true },
          { "/": "/@*" },
          { "/": "/", "#": "?*" },
          { "/": "/?*", "#": "?*" },
        ],
      },
    ],
  },
} as const;

const CACHE_CONTROL = "public, max-age=3600";

/** `ANDROID_CERT_SHA256`: comma- or whitespace-separated `AB:CD:…` fingerprints. */
export function parseCertFingerprints(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,]+/u)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/u.test(value));
}

export const appLinksRouter = new Hono<{ Bindings: CloudflareBindings }>();

appLinksRouter.get("/.well-known/apple-app-site-association", (c) =>
  c.json(APPLE_APP_SITE_ASSOCIATION, 200, { "cache-control": CACHE_CONTROL }),
);

appLinksRouter.get("/.well-known/assetlinks.json", (c) => {
  const fingerprints = parseCertFingerprints(c.env.ANDROID_CERT_SHA256);
  // A wrong statement fails verification the same as a missing one, but a 404
  // makes the missing configuration obvious.
  if (fingerprints.length === 0) {
    return c.json({ error: "Not found" }, 404, { "cache-control": "no-store" });
  }
  return c.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    200,
    { "cache-control": CACHE_CONTROL },
  );
});
