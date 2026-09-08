import { describe, expect, test } from "bun:test";
import { parseRegisterBody } from "./request";

describe("parseRegisterBody", () => {
  test("requires consent to be the literal boolean true", () => {
    expect(parseRegisterBody('{"name":"alicex","consent":"true"}')).toEqual({
      ok: false,
      error: "consent_required",
    });
  });

  test("normalizes a valid name and defaults omitted relays to empty", () => {
    expect(parseRegisterBody('{"name":"AliceX","consent":true}')).toEqual({
      ok: true,
      name: "alicex",
      relays: [],
    });
  });

  test("preserves up to ten valid secure relay URLs", () => {
    const relays = Array.from(
      { length: 10 },
      (_, index) => `wss://relay-${index}.example`,
    );

    expect(
      parseRegisterBody(JSON.stringify({ name: "alicex", relays, consent: true })),
    ).toEqual({
      ok: true,
      name: "alicex",
      relays,
    });
  });

  test.each([
    '{"name":"ab","consent":true}',
    // Below the 6-character floor (G1) — the 3–5 band is paid-tier inventory.
    '{"name":"admin","consent":true}',
    // Long enough to pass syntax, still on the reserved list.
    '{"name":"support","consent":true}',
    '{"name":"verified","consent":true}',
    // Dotted names must never register: they would collide with the
    // atproto/ens/dns handle namespace in the shared resolver registry.
    '{"name":"alice.dev","consent":true}',
    '{"name":42,"consent":true}',
  ])("rejects an invalid or reserved name in %s", (body) => {
    expect(parseRegisterBody(body)).toEqual({
      ok: false,
      error: "invalid_name",
    });
  });

  test.each([
    Array.from({ length: 11 }, () => "wss://relay.example"),
    ["ws://relay.example"],
    [`wss://${"a".repeat(195)}`],
    [42],
    "wss://relay.example",
  ])("rejects invalid relay input %j", (relays) => {
    expect(
      parseRegisterBody(JSON.stringify({ name: "alicex", relays, consent: true })),
    ).toEqual({
      ok: false,
      error: "invalid_relays",
    });
  });

  test("rejects malformed JSON", () => {
    expect(parseRegisterBody("{")).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });
});
