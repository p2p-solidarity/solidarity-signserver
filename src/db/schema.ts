import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const inbox = sqliteTable("inbox", {
  id: text("id").primaryKey(),
  ownerPubkey: text("owner_pubkey").notNull(),
  blob: text("blob").notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const schema = {
  inbox,
};

export type InboxRecord = typeof inbox.$inferSelect;
export type NewInboxRecord = typeof inbox.$inferInsert;

