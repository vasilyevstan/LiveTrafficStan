export const OBJECT_SHARE_SQL = {
  startDay: 'INSERT INTO object_share_days(day) VALUES (?) ON CONFLICT(day) DO NOTHING',
  dayCounts: 'SELECT created, resolved FROM object_share_days WHERE day = ?',
  create: `INSERT INTO object_shares(token, kind, identifier, payload, created_at, expires_at, created_day)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT created FROM object_share_days WHERE day = ?) < ?
    ON CONFLICT(token) DO NOTHING RETURNING token`,
  resolve: `UPDATE object_shares SET resolution_day = ?
    WHERE token = ? AND expires_at > ? AND (SELECT resolved FROM object_share_days WHERE day = ?) < ?
    RETURNING payload, created_at, expires_at`,
  expiry: 'SELECT expires_at FROM object_shares WHERE token = ?',
  cleanupLinks: `DELETE FROM object_shares WHERE token IN
    (SELECT token FROM object_shares WHERE expires_at <= ? ORDER BY expires_at LIMIT ?)`,
  cleanupStatistics: `DELETE FROM object_share_statistics WHERE rowid IN
    (SELECT rowid FROM object_share_statistics WHERE day < ? LIMIT ?)`,
  cleanupDays: 'DELETE FROM object_share_days WHERE day < ?',
} as const
