-- The sealed inbox / APNs relay was removed; this database only holds the
-- NIP-05 directory and root vaults. 0000_inbox created the table here but no
-- deployed worker ever wrote to it, so dropping it loses nothing.
DROP TABLE IF EXISTS inbox;
