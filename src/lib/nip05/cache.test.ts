import { describe, expect, test } from "bun:test";
import { createDirectoryCacheKey } from "./cache";

describe("createDirectoryCacheKey", () => {
  test("uses one purgeable full URL for the normalized name", () => {
    expect(
      createDirectoryCacheKey(
        "https://creds.id/.well-known/nostr.json?name=Alice&ignored=1",
        "alice",
      ).url,
    ).toBe(
      "https://creds.id/.well-known/nostr.json?name=alice",
    );
    expect(
      createDirectoryCacheKey(
        "https://creds.id/id/register",
        "alice",
      ).url,
    ).toBe(
      "https://creds.id/.well-known/nostr.json?name=alice",
    );
  });
});
