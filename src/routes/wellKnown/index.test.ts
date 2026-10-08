import { describe, expect, test } from "bun:test";
import type { CloudflareBindings } from "../../types/bindings";
import worker from "../../nip05-worker";
import {
  ANDROID_PACKAGE,
  ATPROTO_CLIENT_METADATA,
  IOS_APP_ID,
  parseCertFingerprints,
  wellKnownRouter,
} from "./index";

const FINGERPRINT = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0").toUpperCase()).join(":");

function env(overrides: Partial<CloudflareBindings> = {}): CloudflareBindings {
  return { ...overrides } as CloudflareBindings;
}

async function get(path: string, bindings: CloudflareBindings, host = "creds.id") {
  return wellKnownRouter.fetch(new Request(`https://${host}${path}`), bindings);
}

describe("apple-app-site-association", () => {
  test("serves JSON for the app's universal links and passkeys", async () => {
    const res = await get("/.well-known/apple-app-site-association", env());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("application/json");
    const body = await res.json();
    expect(body.applinks.details[0].appIDs).toEqual([IOS_APP_ID]);
    expect(body.webcredentials.apps).toEqual([IOS_APP_ID]);
    const paths = body.applinks.details[0].components.map((c: Record<string, string>) => c["/"]);
    expect(paths).toEqual(["/", "/@*", "/c/*", "/pear/*", "/websign"]);
  });

  test("leaves the bare landing page and the web editor in the browser", async () => {
    const res = await get("/.well-known/apple-app-site-association", env());
    const components = (await res.json()).applinks.details[0].components;
    expect(components.find((c: Record<string, string>) => c["/"] === "/")["#"]).toBe("?*");
    expect(components.some((c: Record<string, string>) => c["/"].startsWith("/edit"))).toBe(false);
  });
});

describe("assetlinks.json", () => {
  test("is 404 until a fingerprint is configured", async () => {
    expect((await get("/.well-known/assetlinks.json", env())).status).toBe(404);
    expect(
      (await get("/.well-known/assetlinks.json", env({ ANDROID_SHA256_CERT_FINGERPRINTS: "not-a-fingerprint" }))).status,
    ).toBe(404);
  });

  test("declares App Links and passkeys for the configured certificates", async () => {
    const res = await get(
      "/.well-known/assetlinks.json",
      env({ ANDROID_SHA256_CERT_FINGERPRINTS: ` ${FINGERPRINT.toLowerCase()} ` }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("application/json");
    const [statement] = await res.json();
    expect(statement.relation).toEqual([
      "delegate_permission/common.handle_all_urls",
      "delegate_permission/common.get_login_creds",
    ]);
    expect(statement.target).toEqual({
      namespace: "android_app",
      package_name: ANDROID_PACKAGE,
      sha256_cert_fingerprints: [FINGERPRINT],
    });
  });

  test("parseCertFingerprints keeps every valid entry and drops the rest", () => {
    const other = FINGERPRINT.replace(/^00/u, "FF");
    expect(parseCertFingerprints(`${FINGERPRINT}, ${other}\nbogus`)).toEqual([FINGERPRINT, other]);
    expect(parseCertFingerprints(undefined)).toEqual([]);
  });
});

describe("oauth/client-metadata.json", () => {
  test("serves the atproto client_id document at its own URL", async () => {
    const res = await get("/oauth/client-metadata.json", env(), "solidarity.gg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("application/json");
    const body = await res.json();
    expect(body).toEqual(ATPROTO_CLIENT_METADATA);
    expect(body.client_id).toBe("https://solidarity.gg/oauth/client-metadata.json");
  });
});

describe("solidarity-id worker", () => {
  test("answers the association files even when the rate limiter refuses", async () => {
    const limited = env({
      RATE_LIMITER: { limit: async () => ({ success: false }) },
      ANDROID_SHA256_CERT_FINGERPRINTS: FINGERPRINT,
    });
    for (const path of ["/.well-known/apple-app-site-association", "/.well-known/assetlinks.json", "/oauth/client-metadata.json"]) {
      const res = await worker.fetch(new Request(`https://creds.id${path}`), limited, {} as ExecutionContext);
      expect(res.status).toBe(200);
    }
    const api = await worker.fetch(new Request("https://creds.id/id/availability?name=alice"), limited, {} as ExecutionContext);
    expect(api.status).toBe(429);
  });
});
