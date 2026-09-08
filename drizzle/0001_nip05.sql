CREATE TABLE IF NOT EXISTS nip05_handles (
	name TEXT PRIMARY KEY NOT NULL,
	pubkey TEXT NOT NULL,
	relays TEXT DEFAULT '[]' NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('active', 'released', 'redirected')),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	released_at INTEGER,
	redirect_to TEXT,
	redirect_until INTEGER,
	-- G5: >= 1 means this name went through §3.5 recovery.永久累加、永不歸零 —
	-- viewer 靠它顯示「曾經重新綁定」,讓拿著舊名片的人有機會察覺背後已換人。
	rebind_generation INTEGER NOT NULL DEFAULT 0,
	rebound_at INTEGER,
	CHECK (
		(status = 'active' AND released_at IS NULL)
		OR (status IN ('released', 'redirected') AND released_at IS NOT NULL)
	),
	CHECK (
		(status IN ('active', 'released') AND redirect_to IS NULL AND redirect_until IS NULL)
		OR (status = 'redirected' AND redirect_to IS NOT NULL AND redirect_until IS NOT NULL)
	),
	CHECK (
		(rebind_generation = 0 AND rebound_at IS NULL)
		OR (rebind_generation > 0 AND rebound_at IS NOT NULL)
	)
);

CREATE UNIQUE INDEX IF NOT EXISTS nip05_handles_active_pubkey_unique
	ON nip05_handles (pubkey)
	WHERE status = 'active';

-- Released rows are PERMANENT tombstones (G3) and are never purged, so this
-- index exists for reclaim lookups by the original holder, not for cleanup.
CREATE INDEX IF NOT EXISTS nip05_handles_status_idx
	ON nip05_handles (status, released_at);

CREATE TABLE IF NOT EXISTS nip05_audit (
	event_id TEXT PRIMARY KEY NOT NULL,
	-- 'recovery_rebind' 也是 NIP-98 簽過的(由「新」key 簽),所以 auth_event
	-- 仍然 NOT NULL。刻意沒有 'admin_*' 動作:本服務沒有人工核准路徑(G4)。
	action TEXT NOT NULL CHECK (action IN ('register', 'release', 'recovery_rebind')),
	name TEXT NOT NULL,
	pubkey TEXT NOT NULL,
	auth_event TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS nip05_audit_pubkey_register_idx
	ON nip05_audit (pubkey, action, created_at);

CREATE INDEX IF NOT EXISTS nip05_audit_cleanup_idx
	ON nip05_audit (created_at);
