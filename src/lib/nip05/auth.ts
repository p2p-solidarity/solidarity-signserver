import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

const NIP98_KIND = 27_235;
const AUTH_WINDOW_SECONDS = 60;
const HEX_32_PATTERN = /^[0-9a-f]{64}$/;
const HEX_64_PATTERN = /^[0-9a-f]{128}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

export interface Nip98Event {
  id: string;
  pubkey: string;
  content: string;
  kind: number;
  created_at: number;
  tags: string[][];
  sig: string;
}

export type Nip98FailureDetail =
  | "invalid_event"
  | "expired"
  | "url_mismatch"
  | "method_mismatch"
  | "payload_mismatch"
  | "bad_sig";

export type Nip98Verification =
  | { ok: true; event: Nip98Event; authEvent: string }
  | { ok: false; detail: Nip98FailureDetail };

export interface VerifyNip98Options {
  authorization: string | undefined;
  method: string;
  requestUrl: string;
  rawBody?: string | Uint8Array;
  nowSeconds?: number;
}

export function canonicalizeNip98Url(requestUrl: string): string {
  const url = new URL(requestUrl);
  // The signed public URL is always HTTPS; preserve c.req.url's host, path,
  // and exact query instead of trusting forwarded-host headers.
  return `https://${url.host}${url.pathname}${url.search}`;
}

export function verifyNip98Authorization({
  authorization,
  method,
  requestUrl,
  rawBody,
  nowSeconds = Math.floor(Date.now() / 1000),
}: VerifyNip98Options): Nip98Verification {
  try {
    const authEvent = decodeAuthorization(authorization);
    if (authEvent === null) {
      return { ok: false, detail: "invalid_event" };
    }

    const event = parseNip98Event(authEvent);
    if (event === null || event.kind !== NIP98_KIND) {
      return { ok: false, detail: "invalid_event" };
    }

    if (Math.abs(nowSeconds - event.created_at) > AUTH_WINDOW_SECONDS) {
      return { ok: false, detail: "expired" };
    }

    const urlTag = getSingleTag(event.tags, "u");
    if (urlTag !== canonicalizeNip98Url(requestUrl)) {
      return { ok: false, detail: "url_mismatch" };
    }

    const methodTag = getSingleTag(event.tags, "method");
    if (methodTag !== method.toUpperCase()) {
      return { ok: false, detail: "method_mismatch" };
    }

    if (rawBody !== undefined) {
      const payloadTag = getSingleTag(event.tags, "payload");
      const bodyBytes =
        typeof rawBody === "string" ? textEncoder.encode(rawBody) : rawBody;
      const payloadHash = bytesToHex(sha256(bodyBytes));
      if (payloadTag !== payloadHash) {
        return { ok: false, detail: "payload_mismatch" };
      }
    }

    const serialized = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content,
    ]);
    const expectedId = bytesToHex(sha256(textEncoder.encode(serialized)));
    if (event.id !== expectedId) {
      return { ok: false, detail: "bad_sig" };
    }

    const signatureValid = schnorr.verify(
      hexToBytes(event.sig),
      hexToBytes(event.id),
      hexToBytes(event.pubkey),
    );
    if (!signatureValid) {
      return { ok: false, detail: "bad_sig" };
    }

    return { ok: true, event, authEvent };
  } catch {
    return { ok: false, detail: "invalid_event" };
  }
}

function decodeAuthorization(authorization: string | undefined): string | null {
  if (authorization === undefined || !authorization.startsWith("Nostr ")) {
    return null;
  }

  const encoded = authorization.slice("Nostr ".length);
  if (
    encoded.length === 0 ||
    encoded.length % 4 === 1 ||
    !BASE64_PATTERN.test(encoded)
  ) {
    return null;
  }

  const padded = encoded.padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return textDecoder.decode(bytes);
}

function parseNip98Event(rawEvent: string): Nip98Event | null {
  const value: unknown = JSON.parse(rawEvent);
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !HEX_32_PATTERN.test(value.id) ||
    typeof value.pubkey !== "string" ||
    !HEX_32_PATTERN.test(value.pubkey) ||
    typeof value.content !== "string" ||
    !Number.isSafeInteger(value.kind) ||
    !Number.isSafeInteger(value.created_at) ||
    !Array.isArray(value.tags) ||
    !value.tags.every(
      (tag): tag is string[] =>
        Array.isArray(tag) && tag.length >= 1 && tag.every((part) => typeof part === "string"),
    ) ||
    typeof value.sig !== "string" ||
    !HEX_64_PATTERN.test(value.sig)
  ) {
    return null;
  }

  return {
    id: value.id,
    pubkey: value.pubkey,
    content: value.content,
    kind: value.kind as number,
    created_at: value.created_at as number,
    tags: value.tags,
    sig: value.sig,
  };
}

function getSingleTag(tags: string[][], name: string): string | null {
  const matches = tags.filter((tag) => tag[0] === name);
  return matches.length === 1 ? matches[0][1] ?? null : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
