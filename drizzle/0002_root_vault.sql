CREATE TABLE IF NOT EXISTS root_vaults (
	locator TEXT PRIMARY KEY NOT NULL,
	version INTEGER NOT NULL CHECK (version = 1),
	ciphertext TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
