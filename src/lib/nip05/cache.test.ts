import { describe, expect, test } from "bun:test";
import { createDirectoryCacheKey } from "./cache";

describe("createDirectoryCacheKey", () => {
  test("uses one purgeable full URL for the normalized name", () => {
    expect(
      createDirectoryCacheKey(
        "https://solidarity.gg/.well-known/nostr.json?name=Alice&ignored=1",
        "alice",
      ).url,
    ).toBe(
      "https://solidarity.gg/.well-known/nostr.json?name=alice",
    );
    expect(
      createDirectoryCacheKey(
        "https://solidarity.gg/id/register",
        "alice",
      ).url,
    ).toBe(
      "https://solidarity.gg/.well-known/nostr.json?name=alice",
    );
  });
});
