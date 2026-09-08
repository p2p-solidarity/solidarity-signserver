import { describe, expect, test } from "bun:test";
import {
  canonicalizeNip98Url,
  type Nip98Event,
  verifyNip98Authorization,
} from "./auth";

const NOW_SECONDS = 2_000_000_000;
const REGISTER_URL = "https://solidarity.gg/id/register";
const REGISTER_BODY =
  '{"name":"alice","relays":["wss://relay.primal.net"],"consent":true}';
const AUTHORIZATION =
  "Nostr eyJpZCI6IjM4MTY1NGU1ZTJhNTI4ZWZkMjUzOTE3ZDUzN2UzZWQzZjI5ODQ0ZDQyYmYyYmY1MDdlNGEwNmFlMWVkNjYwZGEiLCJwdWJrZXkiOiI3OWJlNjY3ZWY5ZGNiYmFjNTVhMDYyOTVjZTg3MGIwNzAyOWJmY2RiMmRjZTI4ZDk1OWYyODE1YjE2ZjgxNzk4IiwiY29udGVudCI6IiIsImtpbmQiOjI3MjM1LCJjcmVhdGVkX2F0IjoyMDAwMDAwMDAwLCJ0YWdzIjpbWyJ1IiwiaHR0cHM6Ly9zb2xpZGFyaXR5LmdnL2lkL3JlZ2lzdGVyIl0sWyJtZXRob2QiLCJQT1NUIl0sWyJwYXlsb2FkIiwiYzk2ZmZjNjFlNzk3ZGIwNjA2MWZmZDc5MWE0OGU5N2JiNDEwNmUyNjkyZDk3M2IzOGYwNGE4YjcyNmYxMWEwMCJdXSwic2lnIjoiZjgzOTRmMDBhNDRkYzYyZTI5OGE4Y2I3YjU5MmE3MjRkYTk5YjM1ZTYxNjFiMDM4YTUwZTMwMWU0NTNjYzBmYzExYzE4NjFiZjMzNTcyMjhlY2E5NjFkY2FjMGM3ZTYxMzg4YWZmZGQ3OWI1ODUyNWE3MDNhZTljODE4YjQ1ZWUifQ==";

function verify(overrides: {
  authorization?: string;
  requestUrl?: string;
  rawBody?: string;
  nowSeconds?: number;
} = {}) {
  return verifyNip98Authorization({
    authorization: overrides.authorization ?? AUTHORIZATION,
    method: "POST",
    requestUrl: overrides.requestUrl ?? REGISTER_URL,
    rawBody: overrides.rawBody ?? REGISTER_BODY,
    nowSeconds: overrides.nowSeconds ?? NOW_SECONDS,
  });
}

function mutateAuthorization(mutator: (event: Nip98Event) => void): string {
  const encoded = AUTHORIZATION.slice("Nostr ".length);
  const event = JSON.parse(atob(encoded)) as Nip98Event;
  mutator(event);
  return `Nostr ${btoa(JSON.stringify(event))}`;
}

describe("verifyNip98Authorization", () => {
  test("accepts a fixed valid NIP-98 vector", () => {
    const result = verify();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.id).toBe(
        "381654e5e2a528efd253917d537e3ed3f29844d42bf2bf507e4a06ae1ed660da",
      );
      expect(result.event.pubkey).toBe(
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      );
    }
  });

  test.each([
    [
      "bad signature",
      () =>
        verify({
          authorization: mutateAuthorization((event) => {
            event.sig = `${event.sig.slice(0, -1)}0`;
          }),
        }),
      "bad_sig",
    ],
    [
      "expired timestamp",
      () => verify({ nowSeconds: NOW_SECONDS + 61 }),
      "expired",
    ],
    [
      "URL mismatch",
      () => verify({ requestUrl: "https://solidarity.gg/id/other" }),
      "url_mismatch",
    ],
    [
      "payload mismatch",
      () => verify({ rawBody: `${REGISTER_BODY}\n` }),
      "payload_mismatch",
    ],
    [
      "wrong kind",
      () =>
        verify({
          authorization: mutateAuthorization((event) => {
            event.kind = 1;
          }),
        }),
      "invalid_event",
    ],
  ])("rejects a fixed vector with %s", (_case, run, detail) => {
    expect(run()).toEqual({ ok: false, detail });
  });

  test("requires exactly one URL tag", () => {
    const authorization = mutateAuthorization((event) => {
      event.tags.push(["u", REGISTER_URL]);
    });

    expect(verify({ authorization })).toEqual({
      ok: false,
      detail: "url_mismatch",
    });
  });
});

describe("canonicalizeNip98Url", () => {
  test("forces HTTPS while preserving path and exact query text", () => {
    expect(
      canonicalizeNip98Url(
        "http://SOLIDARITY.GG/id/register?name=Alice%2ESmith&next=a%2Fb",
      ),
    ).toBe(
      "https://solidarity.gg/id/register?name=Alice%2ESmith&next=a%2Fb",
    );
  });
});
