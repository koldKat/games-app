"use strict";

const CREW_SHARED_EVENT = "crew_shared_xp";
const CREW_SHARES = Symbol("crewShares");

function isShareable(event, amount) {
  return amount > 0 && event !== "crew_joined" && event !== CREW_SHARED_EVENT;
}

// A player seen through overlapping crews still receives only one share.
function createCrewXp(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_crew_shared_xp_ref ON progression_events(ref)
      WHERE event='${CREW_SHARED_EVENT}';
    CREATE TABLE IF NOT EXISTS crew_xp_remainders (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      peers TEXT NOT NULL,
      next_index INTEGER NOT NULL,
      PRIMARY KEY (user_id, peers)
    );
  `);
  const peers = db.prepare(`
    SELECT DISTINCT peer.user_id AS id
    FROM crew_members AS self JOIN crew_members AS peer ON peer.crew_id=self.crew_id
    WHERE self.user_id=@userId AND peer.user_id<>@userId
      AND (@when IS NULL OR (self.joined_at<=@when AND peer.joined_at<=@when))
    ORDER BY peer.user_id
  `).pluck();
  const nextIndex = db.prepare("SELECT next_index FROM crew_xp_remainders WHERE user_id=? AND peers=?").pluck();
  const saveIndex = db.prepare(`
    INSERT INTO crew_xp_remainders(user_id,peers,next_index) VALUES (?,?,?)
    ON CONFLICT(user_id,peers) DO UPDATE SET next_index=excluded.next_index
  `);

  return function splitCrewXp(userId, amount, when = null) {
    const recipients = peers.all({ userId, when });
    if (!recipients.length) return [];
    const remainder = amount % recipients.length;
    const perMember = Math.floor(amount / recipients.length);
    const key = recipients.join(",");
    const start = remainder ? (nextIndex.get(userId, key) ?? 0) : 0;
    if (remainder) saveIndex.run(userId, key, (start + remainder) % recipients.length);
    return recipients.map((recipientId, index) => ({
      userId: recipientId,
      amount: perMember + Number((index - start + recipients.length) % recipients.length < remainder),
    })).filter(share => share.amount > 0);
  };
}

module.exports = { CREW_SHARED_EVENT, CREW_SHARES, createCrewXp, isShareable };
