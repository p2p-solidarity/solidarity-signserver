import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import type { CloudflareBindings } from "../../types/bindings";
import { rootVaultRouter } from "./index";

class TestPreparedStatement {
  constructor(
    private readonly database: Database,
    readonly sql: string,
    readonly bindings: unknown[] = [],
  ) {}

  bind(...bindings: unknown[]) {
    return new TestPreparedStatement(this.database, this.sql, bindings);
  }

  async first<T>(): Promise<T | null> {
    return (this.database.query(this.sql).get(...this.bindings) as T | null) ?? null;
  }

  run() {
    const result = this.database.query(this.sql).run(...this.bindings);
    return { success: true, meta: { changes: result.changes }, results: [] };
  }
}

class TestD1Database {
  constructor(private readonly database: Database) {}

  prepare(sql: string) {
    return new TestPreparedStatement(this.database, sql);
  }
}

const LOCATOR = "A".repeat(43);
const RECORD = { v: 1, ciphertext: "B".repeat(80) };

let sqlite: Database;
let env: CloudflareBindings;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE root_vaults (
      locator TEXT PRIMARY KEY NOT NULL,
      version INTEGER NOT NULL,
      ciphertext TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  env = {
    INBOX_DB: new TestD1Database(sqlite) as unknown as D1Database,
  } as CloudflareBindings;
});

async function fetchRoute(request: Request) {
  return rootVaultRouter.fetch(request, env);
}

describe("root vault endpoints", () => {
  test("creates and reads an opaque vault record", async () => {
    const created = await fetchRoute(
      new Request(`https://creds.id/vault/root/${LOCATOR}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(RECORD),
      }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual(RECORD);

    const fetched = await fetchRoute(
      new Request(`https://creds.id/vault/root/${LOCATOR}`),
    );
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("cache-control")).toBe("no-store");
    expect(await fetched.json()).toEqual(RECORD);
  });

  test("is idempotent for the same bytes and rejects replacement ciphertext", async () => {
    const put = (record: typeof RECORD) =>
      fetchRoute(
        new Request(`https://creds.id/vault/root/${LOCATOR}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(record),
        }),
      );

    expect((await put(RECORD)).status).toBe(201);
    expect((await put(RECORD)).status).toBe(200);

    const replaced = await put({ ...RECORD, ciphertext: "C".repeat(80) });
    expect(replaced.status).toBe(409);
    expect(await replaced.json()).toEqual({ error: "vault_already_exists" });
  });

  test("accepts no identity metadata and discloses no existence for malformed locators", async () => {
    const metadata = await fetchRoute(
      new Request(`https://creds.id/vault/root/${LOCATOR}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...RECORD, did: "did:key:plaintext" }),
      }),
    );
    expect(metadata.status).toBe(400);

    const malformed = await fetchRoute(
      new Request("https://creds.id/vault/root/not-a-valid-locator"),
    );
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("cache-control")).toBe("no-store");

    const missing = await fetchRoute(
      new Request(`https://creds.id/vault/root/${LOCATOR}`),
    );
    expect(missing.status).toBe(404);
  });

  test("stops a headerless request body once it exceeds 4 KB", async () => {
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(5_000)));
        controller.close();
      },
    });
    const request = new Request(`https://creds.id/vault/root/${LOCATOR}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: oversized,
    });
    request.headers.delete("content-length");

    const response = await fetchRoute(request);
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
