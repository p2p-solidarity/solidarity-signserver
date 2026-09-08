/**
 * DNS binding resolution for the recovery flow (design §3.5 step 5): does
 * `_did.<domain>` currently point at the applicant's NEW did?
 *
 * The IO is injected so every rule below is unit-testable without touching
 * the network. `createWorkerResolverIO` is the only place a real fetch
 * happens.
 *
 * Two hard rules carried over from the app repo's resolver:
 * - **https-only.** The `.well-known` fallback URL is CONSTRUCTED here from a
 *   validated hostname, never taken from a TXT record — otherwise a hostile
 *   TXT could redirect the check to an attacker's endpoint (the app repo's
 *   CLAUDE.md lists "OAuth discovery is https-only with host validation" as a
 *   real caught bug of exactly this shape).
 * - **Fail closed.** Any ambiguity (conflicting TXT records, unreachable
 *   resolver, malformed pointer) denies the recovery. Recovery is the one
 *   place where a false positive hands over someone's name.
 */
import { DOH_ENDPOINT } from "./constants";
import { parseDidPointer, parseDidPointerRecords } from "./didPointer";

const HOSTNAME_MAX_LENGTH = 253;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DNS_TXT_MAX_BYTES = 8_192;

export type ResolverIoError = "notFound" | "unreachable";

export interface ResolverIO {
  dnsTxt(
    name: string,
  ): Promise<
    { ok: true; records: string[] } | { ok: false; error: ResolverIoError }
  >;
  fetchText(
    url: string,
  ): Promise<
    { ok: true; value: string | null } | { ok: false; error: ResolverIoError }
  >;
}

export type DomainDidResolution =
  | { ok: true; did: string }
  | { ok: false; error: "invalidDomain" | "notFound" | "unreachable" | "malformed" };

/**
 * Mirrors the app's `isValidDnsHandle`: at least two labels, RFC-shaped
 * labels, a non-numeric TLD, and NOT a `.eth` name (that belongs to the ENS
 * lane, which this version does not implement).
 */
export function isValidBindingDomain(domain: string): boolean {
  if (domain !== domain.trim() || domain.length === 0) return false;
  if (domain.length > HOSTNAME_MAX_LENGTH) return false;
  if (domain !== domain.toLowerCase()) return false;
  if (domain.startsWith("@") || domain.endsWith(".eth")) return false;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL_RE.test(label))) {
    return false;
  }
  const tld = labels[labels.length - 1];
  return tld !== undefined && !/^[0-9]+$/.test(tld);
}

export async function resolveDomainDid(
  domain: string,
  io: ResolverIO,
): Promise<DomainDidResolution> {
  if (!isValidBindingDomain(domain)) {
    return { ok: false, error: "invalidDomain" };
  }

  let dnsUnreachable = false;
  try {
    const txt = await io.dnsTxt(`_did.${domain}`);
    if (txt.ok) {
      const pointer = parseDidPointerRecords(txt.records);
      if (pointer.ok) return { ok: true, did: pointer.did };
      // A present-but-conflicting RRset must NOT fall through to the
      // `.well-known` fallback: the domain is speaking with two voices and
      // the honest answer is refusal, not "ask somewhere else".
      if (pointer.error === "conflictingRecords") {
        return { ok: false, error: "malformed" };
      }
    } else {
      dnsUnreachable = txt.error === "unreachable";
    }

    // Constructed from the validated hostname, never from record content.
    const wellKnown = await io.fetchText(`https://${domain}/.well-known/did`);
    if (!wellKnown.ok) {
      return {
        ok: false,
        error:
          dnsUnreachable || wellKnown.error === "unreachable"
            ? "unreachable"
            : "notFound",
      };
    }
    if (wellKnown.value === null) {
      return { ok: false, error: dnsUnreachable ? "unreachable" : "notFound" };
    }

    const pointer = parseDidPointer(wellKnown.value);
    return pointer.ok
      ? { ok: true, did: pointer.did }
      : { ok: false, error: "malformed" };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

interface DohAnswer {
  readonly type?: number;
  readonly data?: string;
}

const DNS_TYPE_TXT = 16;

export function createWorkerResolverIO(): ResolverIO {
  return {
    async dnsTxt(name) {
      try {
        const url = new URL(DOH_ENDPOINT);
        url.searchParams.set("name", name);
        url.searchParams.set("type", "TXT");
        const response = await fetch(url.toString(), {
          headers: { accept: "application/dns-json" },
        });
        if (!response.ok) return { ok: false, error: "unreachable" };
        const body = (await response.json()) as { Answer?: DohAnswer[] };
        const records = (body.Answer ?? [])
          .filter((answer) => answer.type === DNS_TYPE_TXT)
          .map((answer) => answer.data ?? "")
          .filter((data) => data.length > 0);
        return records.length === 0
          ? { ok: false, error: "notFound" }
          : { ok: true, records };
      } catch {
        return { ok: false, error: "unreachable" };
      }
    },

    async fetchText(url) {
      try {
        if (!url.startsWith("https://")) return { ok: false, error: "unreachable" };
        const response = await fetch(url, { redirect: "error" });
        if (response.status === 404) return { ok: true, value: null };
        if (!response.ok) return { ok: false, error: "unreachable" };
        const text = await response.text();
        return text.length > DNS_TXT_MAX_BYTES
          ? { ok: false, error: "unreachable" }
          : { ok: true, value: text };
      } catch {
        return { ok: false, error: "unreachable" };
      }
    },
  };
}
