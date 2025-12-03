const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const aesKeyCache = new Map<string, Promise<CryptoKey>>();

function normalizeBase64(value: string): string {
  let normalized = value.replace(/[\r\n\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  if (padding) {
    normalized = normalized.padEnd(normalized.length + (4 - padding), "=");
  }
  return normalized;
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBinary(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return chunks.join("");
}

export function base64ToBytes(value: string): Uint8Array {
  try {
    // Remove URL encoding if present (e.g., %2B -> +)
    const decoded = decodeURIComponent(value);
    const normalized = normalizeBase64(decoded);
    const binary = atob(normalized);
    return binaryToBytes(binary);
  } catch (error) {
    // If decodeURIComponent fails (e.g., already decoded), try direct normalization
    try {
      const normalized = normalizeBase64(value);
      const binary = atob(normalized);
      return binaryToBytes(binary);
    } catch (innerError) {
      throw new Error(`Invalid base64/base64url string: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export const utf8Encode = (value: string): Uint8Array => textEncoder.encode(value);
export const utf8Decode = (value: BufferSource): string => textDecoder.decode(value);

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return result;
}

function deriveSecretBytes(secret: string): Uint8Array {
  try {
    return base64ToBytes(secret);
  } catch {
    if (/^[0-9a-fA-F]+$/.test(secret) && secret.length % 2 === 0) {
      return hexToBytes(secret);
    }
    return utf8Encode(secret);
  }
}

async function importPushSecret(secret: string): Promise<CryptoKey> {
  const existing = aesKeyCache.get(secret);
  if (existing) {
    return existing;
  }
  const secretBytes = deriveSecretBytes(secret);
  const promise = crypto.subtle.importKey("raw", secretBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  aesKeyCache.set(secret, promise);
  return promise;
}

export async function sealDeviceToken(deviceToken: string, secret: string): Promise<string> {
  const key = await importPushSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    utf8Encode(deviceToken),
  );
  const cipherBytes = new Uint8Array(encrypted);
  const payload = new Uint8Array(iv.length + cipherBytes.length);
  payload.set(iv, 0);
  payload.set(cipherBytes, iv.length);
  return bytesToBase64(payload);
}

export async function unsealDeviceToken(sealedRoute: string, secret: string): Promise<string> {
  const payload = base64ToBytes(sealedRoute);
  if (payload.length <= 12) {
    throw new Error("Malformed sealed route");
  }
  const iv = payload.slice(0, 12);
  const cipher = payload.slice(12);
  const key = await importPushSecret(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher,
  );
  return utf8Decode(decrypted);
}

export async function verifyOwnerSignature(pubkeyB64: string, signatureB64: string, payload: Uint8Array): Promise<boolean> {
  try {
    const pubkeyBytes = base64ToBytes(pubkeyB64);
    const signatureBytes = base64ToBytes(signatureB64);
    
    // Validate Ed25519 key size (32 bytes)
    if (pubkeyBytes.length !== 32) {
      console.error(`Invalid pubkey length: expected 32 bytes, got ${pubkeyBytes.length}`);
      return false;
    }
    
    // Validate Ed25519 signature size (64 bytes)
    if (signatureBytes.length !== 64) {
      console.error(`Invalid signature length: expected 64 bytes, got ${signatureBytes.length}`);
      return false;
    }
    
    const key = await crypto.subtle.importKey("raw", pubkeyBytes, { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify("Ed25519", key, signatureBytes, payload);
  } catch (error) {
    console.error("Signature verification failed:", {
      error: error instanceof Error ? error.message : String(error),
      pubkeyLength: pubkeyB64.length,
      sigLength: signatureB64.length,
      pubkeyPreview: pubkeyB64.substring(0, 20) + "...",
      sigPreview: signatureB64.substring(0, 20) + "...",
    });
    return false;
  }
}

export const ownerAuthPayload = (pubkey: string) => utf8Encode(pubkey);


