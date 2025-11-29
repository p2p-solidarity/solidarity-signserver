import type { D1Database, D1Result } from "@cloudflare/workers-types";
import { asc, eq, inArray, lt } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { inbox, schema, type InboxRecord, type NewInboxRecord } from "../../db/schema";

export type InboxDatabase = DrizzleD1Database<typeof schema>;

export const createInboxDb = (binding: D1Database): InboxDatabase =>
  drizzle(binding, { schema });

export const insertInboxMessage = (db: InboxDatabase, record: NewInboxRecord) =>
  db.insert(inbox).values(record);

export const listInboxMessages = (db: InboxDatabase, ownerPubkey: string): Promise<InboxRecord[]> =>
  db
    .select()
    .from(inbox)
    .where(eq(inbox.ownerPubkey, ownerPubkey))
    .orderBy(asc(inbox.createdAt));

export const deleteInboxMessages = async (db: InboxDatabase, ids: string[]): Promise<number> => {
  if (!ids.length) {
    return 0;
  }
  const result = await db.delete(inbox).where(inArray(inbox.id, ids));
  return getChangeCount(result);
};

export const purgeExpiredMessages = async (db: InboxDatabase, cutoffSeconds: number): Promise<number> => {
  const result = await db.delete(inbox).where(lt(inbox.createdAt, cutoffSeconds));
  return getChangeCount(result);
};

const getChangeCount = (result: D1Result | undefined) => result?.meta?.changes ?? 0;

