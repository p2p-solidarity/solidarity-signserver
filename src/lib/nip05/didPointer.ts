/**
 * The `_did` TXT / `.well-known/did` pointer grammar — a faithful port of the
 * read half of the app repo's `packages/shared/src/handles/didPointer.ts`.
 * Only reading is ported; this service never writes a pointer.
 *
 * Grammar (either form):
 *   did:key:z…                         — a bare DID
 *   did=did:key:z…;src=nostr:npub1…    — parameterised, `src` optional
 */

export const DID_POINTER_MAX_BYTES = 4_096;

const DID_RE = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+(?::[A-Za-z0-9._:%-]+)*$/;

export type DidPointerError = "malformedDid" | "conflictingRecords";

export type DidPointerResult =
  | { ok: true; did: string }
  | { ok: false; error: DidPointerError };

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * `src=` is accepted and validated for shape but its value is discarded: the
 * recovery check (design §3.5 step 5) only needs the DID the domain points
 * at. Rejecting an otherwise-valid pointer because it carries a `src` we
 * don't use would fail closed on legitimate records.
 */
export function parseDidPointer(value: string): DidPointerResult {
  const trimmed = value.trim();
  if (trimmed.length === 0 || utf8ByteLength(trimmed) > DID_POINTER_MAX_BYTES) {
    return { ok: false, error: "malformedDid" };
  }

  if (trimmed.startsWith("did:")) {
    return DID_RE.test(trimmed)
      ? { ok: true, did: trimmed }
      : { ok: false, error: "malformedDid" };
  }

  let did: string | null = null;
  let sawSource = false;
  for (const rawParameter of trimmed.split(";")) {
    const parameter = rawParameter.trim();
    const separator = parameter.indexOf("=");
    if (separator <= 0) return { ok: false, error: "malformedDid" };
    const key = parameter.slice(0, separator).trim();
    const parameterValue = parameter.slice(separator + 1).trim();
    if (key === "did") {
      if (did !== null || !DID_RE.test(parameterValue)) {
        return { ok: false, error: "malformedDid" };
      }
      did = parameterValue;
    } else if (key === "src") {
      if (sawSource || !parameterValue.startsWith("nostr:")) {
        return { ok: false, error: "malformedDid" };
      }
      sawSource = true;
    } else {
      return { ok: false, error: "malformedDid" };
    }
  }

  return did === null
    ? { ok: false, error: "malformedDid" }
    : { ok: true, did };
}

/** DNS-JSON returns TXT strings quoted and possibly split into chunks. */
function unwrapDnsJsonTxt(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"')) return trimmed;

  const chunks = trimmed.match(/"(?:\\.|[^"\\])*"/g);
  if (chunks?.join(" ") !== trimmed.replace(/\s+/g, " ")) return trimmed;
  try {
    return chunks.map((chunk) => JSON.parse(chunk) as string).join("");
  } catch {
    return trimmed;
  }
}

/**
 * A TXT RRset may hold unrelated records. The first parseable pointer is
 * selected only after confirming every OTHER parseable pointer agrees —
 * two conflicting pointers must fail closed rather than let the caller pick
 * whichever one happens to sort first.
 */
export function parseDidPointerRecords(
  records: readonly string[],
): DidPointerResult {
  let selected: string | null = null;
  for (const record of records) {
    const parsed = parseDidPointer(unwrapDnsJsonTxt(record));
    if (!parsed.ok) continue;
    if (selected === null) {
      selected = parsed.did;
    } else if (selected !== parsed.did) {
      return { ok: false, error: "conflictingRecords" };
    }
  }
  return selected === null
    ? { ok: false, error: "malformedDid" }
    : { ok: true, did: selected };
}
