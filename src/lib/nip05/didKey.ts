/**
 * did:key (P-256) resolution — a faithful port of the app repo's
 * `packages/shared/src/identity/didKey.ts`, needed here because the recovery
 * flow (design §3.5 step 2) must verify a profile JWS signed by a DID the
 * applicant supplies.
 *
 * DO NOT "simplify" this file. It is pinned against the same golden vectors
 * the app and web viewer replay (`vectors/didkey.json`); any divergence means
 * a record that verifies in the app is rejected here, or worse, the reverse.
 *
 * Wire format (W3C did:key spec, P-256 variant):
 *   did:key:z<base58btc( 0x80 0x24 || compressed_pubkey_33_bytes )>
 *
 * Multicodec prefix 0x1200 = P-256 public key, encoded as varint = 0x80 0x24.
 */
import { base58 } from "@scure/base";
import { p256 } from "@noble/curves/nist.js";

/** Multicodec varint for P-256 public key (0x1200 → 0x80, 0x24). */
const P256_MULTICODEC = new Uint8Array([0x80, 0x24]);

/** Multibase prefix `z` = base58btc. */
const MULTIBASE_BASE58BTC = "z";

const DID_KEY_PREFIX = "did:key:";

const COMPRESSED_POINT_LENGTH = 33;

/**
 * Resolve a `did:key:z…` to its uncompressed P-256 public-key point.
 *
 * Returns the raw 65-byte uncompressed point rather than a JWK: the only
 * consumer here is `verifyCompact`, which feeds it straight to
 * `p256.verify`. The app's version returns a JWK because it also mints DIDs;
 * this service never mints, only verifies.
 *
 * Throws on: missing `did:key:` prefix, missing multibase `z` prefix, wrong
 * multicodec prefix, or an invalid compressed point.
 */
export function resolveDidKeyToPublicKey(did: string): Uint8Array {
  if (!did.startsWith(DID_KEY_PREFIX)) {
    throw new Error(`not a did:key: ${did}`);
  }
  const body = did.slice(DID_KEY_PREFIX.length);
  if (!body.startsWith(MULTIBASE_BASE58BTC)) {
    throw new Error(`did:key must use multibase 'z' (base58btc): ${did}`);
  }
  const decoded = base58.decode(body.slice(MULTIBASE_BASE58BTC.length));
  if (
    decoded.length < P256_MULTICODEC.length + COMPRESSED_POINT_LENGTH ||
    decoded[0] !== P256_MULTICODEC[0] ||
    decoded[1] !== P256_MULTICODEC[1]
  ) {
    throw new Error("did:key is not a P-256 multicodec");
  }
  const compressed = decoded.subarray(P256_MULTICODEC.length);
  return p256.Point.fromBytes(compressed).toBytes(false);
}
