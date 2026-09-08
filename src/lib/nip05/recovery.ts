/**
 * Handle recovery (design §3.5 / G4) — purely cryptographic, no admin path.
 *
 * ── Why there is no manual override ────────────────────────────────────────
 * Any human-approved recovery is a backdoor around the key, and the viewer's
 * bidirectional check CANNOT catch it: once a name is repointed at an
 * attacker's pubkey, the attacker's own kind-0 declares the same identifier,
 * both directions agree, and the green tick is issued. The bidirectional
 * check only proves the CURRENT binding is self-consistent — never that it is
 * still the same person. So when the evidence below is unavailable, the
 * answer is refusal, and the name stays tombstoned forever.
 *
 * ── Why this needs no stored user data ─────────────────────────────────────
 * The applicant supplies the old record themselves (from a relay, from a
 * contact who saved them, or from the fragment QR printed on their own
 * business card). The `pubkey` column we ALREADY store is what makes a
 * supplied record unforgeable — see step 3. We deliberately do not keep a
 * `name → external bindings` snapshot table: that would start accumulating
 * user data and break §0.3.
 *
 * ── Why a new record is required, not just a new npub ──────────────────────
 * The root DID is P-256 and the Nostr key is secp256k1. Same seed, different
 * curves — NEITHER derives from the other. So proving "the domain now points
 * at me" (a DID-level fact) and "I signed this request" (an npub-level fact)
 * needs both keys to participate: the new record is signed by the new DID and
 * claims the new npub, while the NIP-98 envelope is signed by that same npub.
 */
import { verifyCompact } from "./jws";
import { npubToHex } from "./npub";
import { resolveDomainDid, type ResolverIO } from "./dnsBinding";
import { MAX_OLD_RECORD_JWS_BYTES } from "./constants";

const DNS_BINDING_PREFIX = "dns:";
const NOSTR_CLAIM_PREFIX = "nostr:";

export type RecoveryDenialDetail =
  | "jws_invalid"
  | "pubkey_mismatch"
  | "binding_not_claimed"
  | "binding_not_transferred"
  | "binding_unreachable";

export type RecoveryVerification =
  | { ok: true; newDid: string }
  | { ok: false; detail: RecoveryDenialDetail };

export interface RecoveryEvidence {
  /** The name being recovered, already validated and lowercased. */
  readonly name: string;
  /** Whatever the directory currently has bound to `name` (64-hex). */
  readonly storedPubkey: string;
  /** The NIP-98 signer — the applicant's NEW Nostr pubkey (64-hex). */
  readonly newPubkey: string;
  readonly oldRecordJws: string;
  readonly newRecordJws: string;
  /** `dns:<domain>` — the binding the OLD record claimed. */
  readonly binding: string;
}

interface ParsedRecord {
  readonly did: string;
  readonly alsoKnownAs: readonly string[];
}

function parseRecord(jws: string): ParsedRecord | null {
  if (jws.length === 0 || jws.length > MAX_OLD_RECORD_JWS_BYTES) return null;

  // The DID is read from the payload BEFORE verification only to know which
  // key to verify against; `verifyCompact` then proves the record was signed
  // by exactly that DID, so a lie here cannot survive.
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  let unverified: unknown;
  try {
    const payloadB64 = parts[1] ?? "";
    if (!/^[A-Za-z0-9_-]*$/.test(payloadB64)) return null;
    const standard = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = standard.padEnd(
      standard.length + ((4 - (standard.length % 4)) % 4),
      "=",
    );
    unverified = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
        Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)),
      ),
    );
  } catch {
    return null;
  }
  if (typeof unverified !== "object" || unverified === null) return null;
  const claimedDid = (unverified as Record<string, unknown>)["did"];
  if (typeof claimedDid !== "string" || claimedDid.length === 0) return null;

  const verified = verifyCompact(jws, claimedDid);
  if (!verified.ok) return null;

  const did = verified.payload["did"];
  const alsoKnownAs = verified.payload["alsoKnownAs"];
  if (typeof did !== "string" || did !== claimedDid) return null;
  if (
    !Array.isArray(alsoKnownAs) ||
    !alsoKnownAs.every((claim): claim is string => typeof claim === "string")
  ) {
    return null;
  }
  return { did, alsoKnownAs };
}

/** The single `nostr:npub…` claim a record makes about itself, as hex. */
function claimedNostrPubkey(record: ParsedRecord): string | null {
  const claims = record.alsoKnownAs.filter((claim) =>
    claim.startsWith(NOSTR_CLAIM_PREFIX),
  );
  // Exactly one: a record declaring two npubs is ambiguous about which key
  // speaks for it, and picking either would be a guess.
  if (claims.length !== 1) return null;
  const decoded = npubToHex(claims[0]!.slice(NOSTR_CLAIM_PREFIX.length));
  return decoded.ok ? decoded.hex : null;
}

export function parseBindingDomain(binding: string): string | null {
  if (!binding.startsWith(DNS_BINDING_PREFIX)) return null;
  const domain = binding.slice(DNS_BINDING_PREFIX.length).trim().toLowerCase();
  return domain.length === 0 ? null : domain;
}

/**
 * Steps 2–6 of design §3.5 (step 1, the NIP-98 envelope, is enforced by the
 * route before this runs). Every failure is a denial; there is no partial
 * credit and no caller-supplied override.
 */
export async function verifyRecoveryEvidence(
  evidence: RecoveryEvidence,
  io: ResolverIO,
): Promise<RecoveryVerification> {
  const domain = parseBindingDomain(evidence.binding);
  if (domain === null) return { ok: false, detail: "binding_not_claimed" };

  // Step 2 — the old record is authentic under its own DID.
  const oldRecord = parseRecord(evidence.oldRecordJws);
  if (oldRecord === null) return { ok: false, detail: "jws_invalid" };

  // Step 3 — THE ANCHOR. The old record names the very pubkey the directory
  // still has bound to this name. Without this, anyone could submit any
  // well-formed record and claim any name.
  const oldNostr = claimedNostrPubkey(oldRecord);
  if (oldNostr === null || oldNostr !== evidence.storedPubkey.toLowerCase()) {
    return { ok: false, detail: "pubkey_mismatch" };
  }

  // Step 4 — the old record actually claimed this binding.
  if (!oldRecord.alsoKnownAs.includes(`${DNS_BINDING_PREFIX}${domain}`)) {
    return { ok: false, detail: "binding_not_claimed" };
  }

  // Step 5 — the new record is authentic and belongs to the NIP-98 signer,
  // and re-claims the same binding (so the recovered page is immediately
  // bidirectionally consistent, exactly as the badge rules require).
  const newRecord = parseRecord(evidence.newRecordJws);
  if (newRecord === null) return { ok: false, detail: "jws_invalid" };
  const newNostr = claimedNostrPubkey(newRecord);
  if (newNostr === null || newNostr !== evidence.newPubkey.toLowerCase()) {
    return { ok: false, detail: "pubkey_mismatch" };
  }
  if (newRecord.did === oldRecord.did) {
    // Same DID means the key was never lost; this is a rename, not a
    // recovery, and must go through /id/register's own rules instead.
    return { ok: false, detail: "pubkey_mismatch" };
  }
  if (!newRecord.alsoKnownAs.includes(`${DNS_BINDING_PREFIX}${domain}`)) {
    return { ok: false, detail: "binding_not_claimed" };
  }

  // Step 6 — the domain itself now points at the new DID.
  const resolved = await resolveDomainDid(domain, io);
  if (!resolved.ok) {
    return {
      ok: false,
      detail:
        resolved.error === "unreachable"
          ? "binding_unreachable"
          : "binding_not_transferred",
    };
  }
  if (resolved.did !== newRecord.did) {
    return { ok: false, detail: "binding_not_transferred" };
  }

  return { ok: true, newDid: newRecord.did };
}
