CREATE TABLE IF NOT EXISTS inbox (
	id TEXT PRIMARY KEY NOT NULL,
	owner_pubkey TEXT NOT NULL,
	blob TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_owner ON inbox (owner_pubkey);

