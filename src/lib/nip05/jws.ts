/**
 * Compact JWS (ES256 / did:key) verification — a faithful port of the verify
 * half of the app repo's `packages/shared/src/jws.ts`. Signing is
 * deliberately NOT ported: this service never holds a signing key.
 *
 * Two details that are load-bearing and easy to get wrong:
 *
 * 1. **`prehash: false`.** `digest` is already the RFC 7515 ES256 message
 *    representative (sha256 of the signing input). @noble/curves defaults to
 *    `prehash: true` and would hash it a SECOND time, rejecting every
 *    legitimate signature. This is the same trap the app repo's CLAUDE.md
 *    records as a caught security bug ("no manual pre-hash before ES256
 *    signing — the lib hashes").
 * 2. **The header must be EXACTLY `{alg, kid}`.** RFC 7515 §4.1.11: a
 *    verifier that silently ignores unrecognized members (`crit`, `b64`) can
 *    be tricked into validating under a policy the signer never intended.
 *
 * Pinned against `vectors/jws.json`, the same golden vectors the app and web
 * viewer replay. Do not simplify.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { p256 } from "@noble/curves/nist.js";

import { resolveDidKeyToPublicKey } from "./didKey";

const RAW_SIGNATURE_LENGTH = 64;

export type JwsVerification =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

function err(error: string): JwsVerification {
  return { ok: false, error };
}

function base64UrlDecode(value: string): Uint8Array {
  // `atob` needs standard base64 with padding; reject any character outside
  // the base64url alphabet first so a malformed segment cannot slip through
  // as a differently-decoded byte string.
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw new Error("not valid base64url");
  }
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(
    standard.length + ((4 - (standard.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
const utf8Encoder = new TextEncoder();

/**
 * Owns every header-shape policy check, so the two attack classes ("extra
 * header member", "wrong kid fragment") each have one obvious enforcement
 * point.
 */
function parseAndValidateHeader(headerB64: string, did: string): string | null {
  let headerRaw: unknown;
  try {
    headerRaw = JSON.parse(utf8Decoder.decode(base64UrlDecode(headerB64)));
  } catch {
    return "malformed JWS: header is not valid base64url JSON";
  }
  if (
    typeof headerRaw !== "object" ||
    headerRaw === null ||
    Array.isArray(headerRaw)
  ) {
    return "malformed JWS: header is not a JSON object";
  }
  const headerKeys = Object.keys(headerRaw).sort();
  if (headerKeys.length !== 2 || headerKeys[0] !== "alg" || headerKeys[1] !== "kid") {
    return `malformed JWS: header must contain exactly {alg, kid} (got ${JSON.stringify(headerKeys)})`;
  }
  const { alg, kid } = headerRaw as Record<string, unknown>;
  if (alg !== "ES256") return `unsupported alg: ${JSON.stringify(alg)}`;
  if (typeof kid !== "string" || kid.length === 0) return "missing kid";
  // A did:key document has exactly one verification method; no other
  // fragment is ever valid.
  const expectedKid = `${did}#0`;
  if (kid !== expectedKid) {
    return `kid does not match did: expected ${JSON.stringify(expectedKid)}, got ${JSON.stringify(kid)}`;
  }
  return null;
}

/**
 * Verify a compact JWS was signed by `did`. Never throws — every failure
 * path returns `{ ok: false }`; the decoded payload is returned on success.
 */
export function verifyCompact(jws: string, did: string): JwsVerification {
  const parts = jws.split(".");
  if (parts.length !== 3) {
    return err("malformed JWS: expected 3 dot-separated parts");
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const headerError = parseAndValidateHeader(headerB64, did);
  if (headerError !== null) return err(headerError);

  let publicKey: Uint8Array;
  try {
    publicKey = resolveDidKeyToPublicKey(did);
  } catch (error) {
    return err(
      `could not resolve did: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let sigBytes: Uint8Array;
  try {
    sigBytes = base64UrlDecode(signatureB64);
  } catch {
    return err("malformed JWS: signature is not valid base64url");
  }
  if (sigBytes.length !== RAW_SIGNATURE_LENGTH) {
    return err(`signature must be ${String(RAW_SIGNATURE_LENGTH)} raw bytes (r||s)`);
  }

  const digest = sha256(utf8Encoder.encode(`${headerB64}.${payloadB64}`));
  // `prehash: false` — see the module docstring. `lowS` stays at its default
  // (`true`), so malleable high-S signatures are still rejected.
  const validSignature = p256.verify(sigBytes, digest, publicKey, {
    prehash: false,
  });
  if (!validSignature) return err("signature verification failed");

  let payload: unknown;
  try {
    payload = JSON.parse(utf8Decoder.decode(base64UrlDecode(payloadB64)));
  } catch {
    return err("malformed JWS: payload is not valid base64url JSON");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return err("malformed JWS: payload is not a JSON object");
  }
  return { ok: true, payload: payload as Record<string, unknown> };
}
