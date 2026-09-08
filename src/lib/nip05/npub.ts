/**
 * NIP-19 `npub` ↔ 32-byte x-only pubkey hex. Ported from the app repo's
 * `packages/shared/src/nostr/npub.ts` surface; only the directions the
 * recovery flow needs are implemented.
 */
import { bech32 } from "@scure/base";

const NPUB_PREFIX = "npub";
const XONLY_PUBKEY_BYTES = 32;
/** Generous vs. the 63-char real length, still bounded for hostile input. */
const BECH32_DECODE_LIMIT = 128;

export type NpubDecoding = { ok: true; hex: string } | { ok: false };

export function npubToHex(npub: string): NpubDecoding {
  try {
    const decoded = bech32.decode(
      npub as `${string}1${string}`,
      BECH32_DECODE_LIMIT,
    );
    if (decoded.prefix !== NPUB_PREFIX) return { ok: false };
    const bytes = bech32.fromWords(decoded.words);
    if (bytes.length !== XONLY_PUBKEY_BYTES) return { ok: false };
    return {
      ok: true,
      hex: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    };
  } catch {
    // bech32 errors interpolate the offending input; never forward them.
    return { ok: false };
  }
}
