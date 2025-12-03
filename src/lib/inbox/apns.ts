import type { CloudflareBindings } from "../../types/bindings";
import { base64ToBytes, bytesToBase64Url, utf8Encode } from "./crypto";

const signingKeyCache = new Map<string, Promise<CryptoKey>>();
const jsonEncoder = new TextEncoder();

type JwtHeader = {
  alg: "ES256";
  kid: string;
};

type JwtPayload = {
  iss: string;
  iat: number;
};

function decodePemString(value: string): string {
  if (value.includes("BEGIN PRIVATE KEY")) {
    return value;
  }
  try {
    return new TextDecoder().decode(base64ToBytes(value));
  } catch {
    return value;
  }
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem.replace(/-----BEGIN [\w\s]+-----/g, "")
    .replace(/-----END [\w\s]+-----/g, "")
    .replace(/\s+/g, "");
  const bytes = base64ToBytes(cleaned);
  return bytes.buffer;
}

async function getSigningKey(p8Value: string): Promise<CryptoKey> {
  const cached = signingKeyCache.get(p8Value);
  if (cached) {
    return cached;
  }
  const pem = decodePemString(p8Value);
  const pkcs8 = pemToArrayBuffer(pem);
  const promise = crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  signingKeyCache.set(p8Value, promise);
  return promise;
}

function base64UrlEncodeString(input: string): string {
  return bytesToBase64Url(jsonEncoder.encode(input));
}

async function buildApnsJwt(env: CloudflareBindings): Promise<string> {
  const header: JwtHeader = { alg: "ES256", kid: env.APPLE_KEY_ID };
  const payload: JwtPayload = {
    iss: env.APPLE_TEAM_ID,
    iat: Math.floor(Date.now() / 1000),
  };

  const headerB64 = base64UrlEncodeString(JSON.stringify(header));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const unsigned = `${headerB64}.${payloadB64}`;

  const signingKey = await getSigningKey(env.APPLE_P8_KEY);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, utf8Encode(unsigned)),
  );
  const signatureB64 = bytesToBase64Url(signature);

  return `${unsigned}.${signatureB64}`;
}

export type ApnsResult =
  | { ok: true; status: number }
  | { ok: false; status?: number; body?: string; error: string };

type ApnsPayload = {
  aps: {
    alert?: {
      title?: string;
      body?: string;
      subtitle?: string;
    } | string;
    "content-available"?: number;
    sound?: string;
    badge?: number;
  };
  [key: string]: unknown;
};

export async function sendBackgroundPing(env: CloudflareBindings, deviceToken: string): Promise<ApnsResult> {
  const jwt = await buildApnsJwt(env);
  const host = (env.APNS_HOST || "https://api.push.apple.com").replace(/\/$/, "");
  const url = `${host}/3/device/${deviceToken}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `bearer ${jwt}`,
        "Content-Type": "application/json",
        "apns-topic": env.APNS_TOPIC,
        "apns-push-type": "background",
        "apns-priority": "5",
      },
      body: JSON.stringify({ aps: { "content-available": 1 } }),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to reach APNs",
    };
  }

  const responseText = await response.text().catch(() => undefined);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: responseText,
      error: "apns_request_failed",
    };
  }

  return { ok: true, status: response.status };
}

export async function sendNotification(
  env: CloudflareBindings,
  deviceToken: string,
  payload: ApnsPayload,
): Promise<ApnsResult> {
  const jwt = await buildApnsJwt(env);
  const host = (env.APNS_HOST || "https://api.push.apple.com").replace(/\/$/, "");
  const url = `${host}/3/device/${deviceToken}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `bearer ${jwt}`,
        "Content-Type": "application/json",
        "apns-topic": env.APNS_TOPIC,
        "apns-push-type": payload.aps.alert ? "alert" : "background",
        "apns-priority": payload.aps.alert ? "10" : "5",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to reach APNs",
    };
  }

  const responseText = await response.text().catch(() => undefined);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: responseText,
      error: "apns_request_failed",
    };
  }

  return { ok: true, status: response.status };
}


