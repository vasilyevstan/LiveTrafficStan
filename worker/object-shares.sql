CREATE TABLE IF NOT EXISTS object_share_days (
  day INTEGER PRIMARY KEY,
  created INTEGER NOT NULL DEFAULT 0,
  resolved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS object_shares (
  token TEXT PRIMARY KEY CHECK (length(token) = 12),
  kind TEXT NOT NULL CHECK (kind IN ('aircraft', 'vessel', 'orbital')),
  identifier TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (length(CAST(payload AS BLOB)) <= 1024 AND json_valid(payload)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 86400000),
  created_day INTEGER NOT NULL,
  resolution_day INTEGER
);
CREATE INDEX IF NOT EXISTS object_shares_expiry ON object_shares(expires_at);
CREATE TABLE IF NOT EXISTS object_share_statistics (
  day INTEGER NOT NULL,
  kind TEXT NOT NULL,
  identifier TEXT NOT NULL,
  created INTEGER NOT NULL DEFAULT 0,
  resolved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, identifier)
);
CREATE TRIGGER IF NOT EXISTS object_share_created AFTER INSERT ON object_shares
BEGIN
  UPDATE object_share_days SET created = created + 1 WHERE day = NEW.created_day;
  INSERT INTO object_share_statistics(day, kind, identifier, created)
    VALUES (NEW.created_day, NEW.kind, NEW.identifier, 1)
    ON CONFLICT(day, kind, identifier) DO UPDATE SET created = created + 1;
END;
CREATE TRIGGER IF NOT EXISTS object_share_resolved AFTER UPDATE OF resolution_day ON object_shares
BEGIN
  UPDATE object_share_days SET resolved = resolved + 1 WHERE day = NEW.resolution_day;
  INSERT INTO object_share_statistics(day, kind, identifier, resolved)
    VALUES (NEW.resolution_day, NEW.kind, NEW.identifier, 1)
    ON CONFLICT(day, kind, identifier) DO UPDATE SET resolved = resolved + 1;
END;
