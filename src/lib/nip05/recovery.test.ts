/**
 * Recovery is the one endpoint where a false positive hands someone's name
 * to an attacker, so every step gets an explicit denial test. Vectors are
 * signed by the app repo's own `@solidarity/shared` (see the JSON's
 * `description`), not hand-rolled here.
 */
import { describe, expect, test } from "bun:test";

import { parseBindingDomain, verifyRecoveryEvidence } from "./recovery";
import type { ResolverIO } from "./dnsBinding";
import vectors from "./vectors/recovery.json";

/** Resolver that answers `_did.<domain>` with `did`, and 404s `.well-known`. */
function resolverFor(did: string | null): ResolverIO {
  return {
    async dnsTxt() {
      return did === null
        ? { ok: false as const, error: "notFound" as const }
        : { ok: true as const, records: [`"did=${did}"`] };
    },
    async fetchText() {
      return { ok: true as const, value: null };
    },
  };
}

const unreachableResolver: ResolverIO = {
  async dnsTxt() {
    return { ok: false, error: "unreachable" };
  },
  async fetchText() {
    return { ok: false, error: "unreachable" };
  },
};

function baseEvidence() {
  return {
    name: "alicex",
    storedPubkey: vectors.old.nostrPubkeyHex,
    newPubkey: vectors.new.nostrPubkeyHex,
    oldRecordJws: vectors.old.jws,
    newRecordJws: vectors.new.jws,
    binding: `dns:${vectors.domain}`,
  };
}

describe("parseBindingDomain", () => {
  test("accepts a dns binding and lowercases it", () => {
    expect(parseBindingDomain("dns:Example.COM")).toBe("example.com");
  });

  test.each(["example.com", "ens:alice.eth", "at://alice.bsky.social", "dns:", ""])(
    "rejects %s",
    (input) => {
      expect(parseBindingDomain(input)).toBeNull();
    },
  );
});

describe("verifyRecoveryEvidence — the happy path", () => {
  test("accepts when all five checks line up", async () => {
    const result = await verifyRecoveryEvidence(
      baseEvidence(),
      resolverFor(vectors.new.did),
    );
    expect(result).toEqual({ ok: true, newDid: vectors.new.did });
  });
});

describe("verifyRecoveryEvidence — every denial path", () => {
  test("step 3: an authentic record for a DIFFERENT identity cannot claim this name", async () => {
    // The anchor. Without it anyone could submit any well-formed record.
    const result = await verifyRecoveryEvidence(
      { ...baseEvidence(), oldRecordJws: vectors.unrelated.jws },
      resolverFor(vectors.new.did),
    );
    expect(result).toEqual({ ok: false, detail: "pubkey_mismatch" });
  });

  test("step 3: stored pubkey that does not match the old record is refused", async () => {
    const result = await verifyRecoveryEvidence(
      { ...baseEvidence(), storedPubkey: vectors.unrelated.nostrPubkeyHex },
      resolverFor(vectors.new.did),
    );
    expect(result).toEqual({ ok: false, detail: "pubkey_mismatch" });
  });

  test("step 4: a binding the old record never claimed is refused", async () => {
    const result = await verifyRecoveryEvidence(
      { ...baseEvidence(), binding: "dns:attacker.example" },
      resolverFor(vectors.new.did),
    );
    expect(result).toEqual({ ok: false, detail: "binding_not_claimed" });
  });

  test("step 5: the NIP-98 signer must be the npub the new record claims", async () => {
    const result = await verifyRecoveryEvidence(
      { ...baseEvidence(), newPubkey: vectors.unrelated.nostrPubkeyHex },
      resolverFor(vectors.new.did),
    );
    expect(result).toEqual({ ok: false, detail: "pubkey_mismatch" });
  });

  test("step 5: a new record that does not re-claim the binding is refused", async () => {
    const result = await verifyRecoveryEvidence(
      { ...baseEvidence(), newRecordJws: vectors.new.jwsWithoutBinding },
      resolverFor(vectors.new.did),
    );
    expect(result).toEqual({ ok: false, detail: "binding_not_claimed" });
  });

  test("step 5: reusing the SAME did is a rename, not a recovery", async () => {
    const result = await verifyRecoveryEvidence(
      {
        ...baseEvidence(),
        newRecordJws: vectors.old.jws,
        newPubkey: vectors.old.nostrPubkeyHex,
      },
      resolverFor(vectors.old.did),
    );
    expect(result).toEqual({ ok: false, detail: "pubkey_mismatch" });
  });

  test("step 6: a domain still pointing at the OLD did has not been transferred", async () => {
    const result = await verifyRecoveryEvidence(
      baseEvidence(),
      resolverFor(vectors.old.did),
    );
    expect(result).toEqual({ ok: false, detail: "binding_not_transferred" });
  });

  test("step 6: a domain pointing at an unrelated did is refused", async () => {
    const result = await verifyRecoveryEvidence(
      baseEvidence(),
      resolverFor(vectors.unrelated.did),
    );
    expect(result).toEqual({ ok: false, detail: "binding_not_transferred" });
  });

  test("step 6: no pointer at all is refused", async () => {
    const result = await verifyRecoveryEvidence(baseEvidence(), resolverFor(null));
    expect(result).toEqual({ ok: false, detail: "binding_not_transferred" });
  });

  test("step 6: an unreachable resolver denies rather than proceeding", async () => {
    const result = await verifyRecoveryEvidence(
      baseEvidence(),
      unreachableResolver,
    );
    expect(result).toEqual({ ok: false, detail: "binding_unreachable" });
  });

  test("step 6: conflicting TXT pointers fail closed instead of picking one", async () => {
    const conflicting: ResolverIO = {
      async dnsTxt() {
        return {
          ok: true,
          records: [`"did=${vectors.new.did}"`, `"did=${vectors.unrelated.did}"`],
        };
      },
      async fetchText() {
        return { ok: true, value: null };
      },
    };
    const result = await verifyRecoveryEvidence(baseEvidence(), conflicting);
    expect(result).toEqual({ ok: false, detail: "binding_not_transferred" });
  });

  test("step 2: a tampered old record is refused", async () => {
    const tampered = `${vectors.old.jws.slice(0, -4)}AAAA`;
    const result = await verifyRecoveryEvidence(
      { ...baseEvidence(), oldRecordJws: tampered },
      resolverFor(vectors.new.did),
    );
    expect(result).toEqual({ ok: false, detail: "jws_invalid" });
  });

  test.each([
    ["", "empty"],
    ["not-a-jws", "not three parts"],
    ["a.b.c", "garbage segments"],
    ["x".repeat(20_000), "over the size cap"],
  ])("step 2: rejects %s old record (%s)", async (jws) => {
    const result = await verifyRecoveryEvidence(
      { ...baseEvidence(), oldRecordJws: jws },
      resolverFor(vectors.new.did),
    );
    expect(result).toEqual({ ok: false, detail: "jws_invalid" });
  });
});
