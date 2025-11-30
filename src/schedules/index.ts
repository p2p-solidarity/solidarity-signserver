import { createInboxDb, purgeExpiredMessages } from "../lib/inbox/repository";
import type { CloudflareBindings } from "../types/bindings";

export async function runInboxCleanup(env: CloudflareBindings) {
  const db = createInboxDb(env.INBOX_DB);
  const cutoffSeconds = Math.floor(Date.now() / 1000) - 60 * 60 * 24;
  const removed = await purgeExpiredMessages(db, cutoffSeconds);
  console.log(`🧹 Purged ${removed} expired inbox entries`);
}