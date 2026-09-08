/**
 * Cross-repo parity: these are the SAME golden vectors the app
 * (`packages/shared/vectors/{jws,didkey}.json`) and the web viewer replay.
 * If this port ever drifts from the app's `verifyCompact` / `resolveDidKey`,
 * a record that verifies in the app would be rejected during recovery — or,
 * far worse, a record the app rejects would be accepted here.
 */
import { describe, expect, test } from "bun:test";

import { resolveDidKeyToPublicKey } from "./didKey";
import { verifyCompact } from "./jws";
import didKeyVectors from "./vectors/didkey.json";
import jwsVectors from "./vectors/jws.json";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

describe("resolveDidKeyToPublicKey (didkey.json parity)", () => {
  test.each(didKeyVectors.valid.map((vector) => [vector.name, vector] as const))(
    "resolves %s to the vector's uncompressed point",
    (_name, vector) => {
      expect(resolveDidKeyToPublicKey(vector.did)).toEqual(
        hexToBytes(vector.publicKeyUncompressedHex),
      );
    },
  );

  test.each(didKeyVectors.invalid.map((vector) => [vector.name, vector] as const))(
    "rejects %s",
    (_name, vector) => {
      expect(() => resolveDidKeyToPublicKey(vector.did)).toThrow();
    },
  );
});

describe("verifyCompact (jws.json parity)", () => {
  const { testKey } = jwsVectors;

  test.each(jwsVectors.valid.map((vector) => [vector.name, vector] as const))(
    "accepts %s and returns the exact payload",
    (_name, vector) => {
      const result = verifyCompact(vector.jws, testKey.did);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.payload).toEqual(vector.payload);
    },
  );

  test.each(jwsVectors.invalid.map((vector) => [vector.name, vector] as const))(
    "rejects %s",
    (_name, vector) => {
      const did = "did" in vector && typeof vector.did === "string" ? vector.did : testKey.did;
      expect(verifyCompact(vector.jws, did).ok).toBe(false);
    },
  );

  test("never throws on structurally garbage input", () => {
    for (const garbage of ["", ".", "a.b", "a.b.c.d", "!!!.???.###"]) {
      expect(verifyCompact(garbage, testKey.did).ok).toBe(false);
    }
  });

  test("rejects a valid JWS presented under a different did", () => {
    const otherDid = didKeyVectors.valid[0]!.did;
    expect(otherDid).not.toBe(testKey.did);
    expect(verifyCompact(jwsVectors.valid[0]!.jws, otherDid).ok).toBe(false);
  });
});
