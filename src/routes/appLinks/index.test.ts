import { describe, expect, test } from "bun:test";
import type { CloudflareBindings } from "../../types/bindings";
import {
  ANDROID_PACKAGE,
  IOS_APP_ID,
  appLinksRouter,
  parseCertFingerprints,
} from "./index";

const FINGERPRINT = Array.from({ length: 32 }, (_, i) =>
  i.toString(16).padStart(2, "0").toUpperCase(),
).join(":");

function request(path: string, env: Partial<CloudflareBindings> = {}) {
  return appLinksRouter.request(
    `https://creds.id${path}`,
    {},
    env as CloudflareBindings,
  );
}

describe("apple-app-site-association", () => {
  test("is a 200 JSON for the app's team and bundle id", async () => {
    const res = await request("/.well-known/apple-app-site-association");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as {
      applinks: { details: { appIDs: string[]; components: unknown[] }[] };
    };
    expect(body.applinks.details[0].appIDs).toEqual([IOS_APP_ID]);
    expect(body.applinks.details[0].components).toContainEqual({ "/": "/@*" });
  });

  test("excludes browser-only pages before the catch-all fragment rule", async () => {
    const res = await request("/.well-known/apple-app-site-association");
    const body = (await res.json()) as {
      applinks: { details: { components: { "/": string; exclude?: boolean }[] }[] };
    };
    const components = body.applinks.details[0].components;
    const catchAll = components.findIndex((c) => c["/"] === "/?*");
    for (const path of ["/upgrade*", "/websign*", "/id/*", "/vault/*"]) {
      const index = components.findIndex((c) => c["/"] === path);
      expect(components[index].exclude).toBe(true);
      expect(index).toBeLessThan(catchAll);
    }
  });
});

describe("assetlinks.json", () => {
  test("is a 404 until the signing certificate is configured", async () => {
    expect((await request("/.well-known/assetlinks.json")).status).toBe(404);
    expect(
      (await request("/.well-known/assetlinks.json", { ANDROID_CERT_SHA256: "" }))
        .status,
    ).toBe(404);
  });

  test("lists the package with every configured fingerprint", async () => {
    const res = await request("/.well-known/assetlinks.json", {
      ANDROID_CERT_SHA256: `${FINGERPRINT.toLowerCase()}, ${FINGERPRINT}`,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: [FINGERPRINT, FINGERPRINT],
        },
      },
    ]);
  });

  test("drops malformed fingerprints", () => {
    expect(parseCertFingerprints("nope, AB:CD")).toEqual([]);
  });
});
