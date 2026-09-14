import { Hono } from "hono";
import type { CloudflareBindings } from "../../types/bindings";

const LOCATOR_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const CIPHERTEXT_PATTERN = /^[A-Za-z0-9_-]+$/u;
const MAX_REQUEST_BYTES = 4_096;
const MAX_CIPHERTEXT_CHARS = 2_048;

interface RootVaultRow {
  readonly version: number;
  readonly ciphertext: string;
}

interface RootVaultRecord {
  readonly v: 1;
  readonly ciphertext: string;
}

type LimitedJson =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly tooLarge: boolean };

async function readLimitedJson(
  request: Request,
  maxBytes: number,
): Promise<LimitedJson> {
  const reader = request.body?.getReader();
  if (reader === undefined) return { ok: false, tooLarge: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

function noStoreHeaders(): Record<string, string> {
  return {
    "cache-control": "no-store",
    pragma: "no-cache",
  };
}

function isRecord(value: unknown): value is RootVaultRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.v === 1 &&
    typeof record.ciphertext === "string" &&
    record.ciphertext.length >= 38 &&
    record.ciphertext.length <= MAX_CIPHERTEXT_CHARS &&
    CIPHERTEXT_PATTERN.test(record.ciphertext)
  );
}

export const rootVaultRouter = new Hono<{ Bindings: CloudflareBindings }>()
  .put("/vault/root/:locator", async (c) => {
    const locator = c.req.param("locator");
    if (!LOCATOR_PATTERN.test(locator)) {
      return c.json({ error: "invalid_locator" }, 400, noStoreHeaders());
    }

    const contentLength = Number(c.req.header("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return c.json({ error: "record_too_large" }, 413, noStoreHeaders());
    }

    const decoded = await readLimitedJson(c.req.raw, MAX_REQUEST_BYTES);
    if (!decoded.ok) {
      return c.json(
        { error: decoded.tooLarge ? "record_too_large" : "invalid_record" },
        decoded.tooLarge ? 413 : 400,
        noStoreHeaders(),
      );
    }
    const body = decoded.value;
    if (!isRecord(body)) {
      return c.json({ error: "invalid_record" }, 400, noStoreHeaders());
    }

    const createdAt = Math.floor(Date.now() / 1_000);
    const insert = await c.env.INBOX_DB.prepare(
      `INSERT OR IGNORE INTO root_vaults (locator, version, ciphertext, created_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(locator, body.v, body.ciphertext, createdAt)
      .run();

    if ((insert.meta.changes ?? 0) > 0) {
      return c.json(body, 201, noStoreHeaders());
    }

    const existing = await c.env.INBOX_DB.prepare(
      "SELECT version, ciphertext FROM root_vaults WHERE locator = ?",
    )
      .bind(locator)
      .first<RootVaultRow>();
    if (existing?.version === body.v && existing.ciphertext === body.ciphertext) {
      return c.json(body, 200, noStoreHeaders());
    }
    return c.json({ error: "vault_already_exists" }, 409, noStoreHeaders());
  })
  .get("/vault/root/:locator", async (c) => {
    const locator = c.req.param("locator");
    if (!LOCATOR_PATTERN.test(locator)) {
      return c.json({ error: "invalid_locator" }, 400, noStoreHeaders());
    }

    const row = await c.env.INBOX_DB.prepare(
      "SELECT version, ciphertext FROM root_vaults WHERE locator = ?",
    )
      .bind(locator)
      .first<RootVaultRow>();
    if (row === null) {
      return c.json({ error: "vault_not_found" }, 404, noStoreHeaders());
    }
    return c.json(
      { v: row.version, ciphertext: row.ciphertext },
      200,
      noStoreHeaders(),
    );
  });
