// Shared collection membership and invitations; game ownership remains with its creator.
function createCrewStore(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS crews(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS crew_members(
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      crew_id INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON crew_members(crew_id,user_id);
    CREATE TABLE IF NOT EXISTS crew_invites(
      id INTEGER PRIMARY KEY, crew_id INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
      inviter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, responded_at TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_invites_pending ON crew_invites(crew_id,invitee_user_id) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS idx_crew_invites_incoming ON crew_invites(invitee_user_id,status);
    CREATE TABLE IF NOT EXISTS game_player_state(
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating REAL CHECK(rating IS NULL OR (rating>=0.5 AND rating<=5 AND rating*2=CAST(rating*2 AS INTEGER))),
      play_status TEXT NOT NULL DEFAULT 'backlog', hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN(0,1)),
      favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN(0,1)),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(game_id,user_id));
    CREATE INDEX IF NOT EXISTS idx_game_player_state_user ON game_player_state(user_id,game_id);
  `);
  if (!database.prepare("SELECT 1 FROM runtime_settings WHERE key='crew-personal-state-v1'").get()) {
    database.transaction(() => {
      database.exec(`INSERT OR IGNORE INTO game_player_state(game_id,user_id,rating,play_status,hidden,favorite)
        SELECT id,user_id,rating,play_status,hidden,favorite FROM games WHERE user_id IS NOT NULL`);
      database.prepare("INSERT INTO runtime_settings(key,value) VALUES('crew-personal-state-v1','1')").run();
    })();
  }
  const columns = database.prepare('PRAGMA table_info(games)').all().map(row => row.name);
  const personal = new Set(['rating','play_status','hidden','favorite']);
  function memberIdsSql(parameter = '@userId') {
    return `(SELECT peer.user_id FROM crew_members peer JOIN crew_members self ON self.crew_id=peer.crew_id
      WHERE self.user_id=${parameter} UNION SELECT ${parameter})`;
  }
  function gameSource(parameter = '@userId') {
    return `(SELECT ${columns.filter(column => !personal.has(column)).map(column => `g."${column}"`).join(',')},
      ps.rating, COALESCE(ps.play_status,'backlog') AS play_status,
      COALESCE(ps.hidden,0) AS hidden, COALESCE(ps.favorite,0) AS favorite
      FROM games g LEFT JOIN game_player_state ps ON ps.game_id=g.id AND ps.user_id=${parameter}
      WHERE g.user_id IN ${memberIdsSql(parameter)}) AS games`;
  }
  const crewId = userId => database.prepare('SELECT crew_id FROM crew_members WHERE user_id=?').get(userId)?.crew_id;
  function ensureCrew(userId) {
    let id = crewId(userId);
    if (!id) {
      id = Number(database.prepare('INSERT INTO crews DEFAULT VALUES').run().lastInsertRowid);
      database.prepare('INSERT INTO crew_members(user_id,crew_id) VALUES(?,?)').run(userId,id);
    }
    return id;
  }
  function memberIds(userId) {
    return database.prepare(`SELECT id FROM users WHERE id IN ${memberIdsSql()} ORDER BY id`).all({ userId }).map(row => row.id);
  }
  function snapshot(userId) {
    const id = crewId(userId);
    return {
      members: database.prepare(`SELECT u.id,u.username,u.is_sidekick AS sidekick,u.avatar_path AS avatarPath,m.joined_at AS joinedAt
        FROM users u LEFT JOIN crew_members m ON m.user_id=u.id WHERE u.id IN ${memberIdsSql()} ORDER BY u.id`).all({userId})
        .map(({avatarPath,...member})=>({...member,avatarUrl:avatarPath?'/avatars/'+encodeURIComponent(avatarPath):null})),
      incoming: database.prepare(`SELECT i.id,i.created_at AS createdAt,u.username AS username
        FROM crew_invites i JOIN users u ON u.id=i.inviter_user_id
        WHERE i.invitee_user_id=? AND i.status='pending' ORDER BY i.id DESC`).all(userId),
      outgoing: id ? database.prepare(`SELECT i.id,i.created_at AS createdAt,u.username AS username
        FROM crew_invites i JOIN users u ON u.id=i.invitee_user_id
        WHERE i.crew_id=? AND i.status='pending' ORDER BY i.id DESC`).all(id) : [],
    };
  }
  const invite = database.transaction((userId,username) => {
    const clean = String(username || '').trim();
    if (!clean || clean.length>80) throw new Error('Enter a player username.');
    const target = database.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(clean);
    if (!target) throw new Error('Player not found.');
    if (memberIds(userId).includes(target.id)) throw new Error('That player is already in your crew.');
    const id = ensureCrew(userId);
    if (database.prepare("SELECT 1 FROM crew_invites WHERE crew_id=? AND invitee_user_id=? AND status='pending'").get(id,target.id)) throw new Error('An invitation is already pending.');
    const result = database.prepare('INSERT INTO crew_invites(crew_id,inviter_user_id,invitee_user_id) VALUES(?,?,?)').run(id,userId,target.id);
    return {id:Number(result.lastInsertRowid),affectedUserIds:[...memberIds(userId),target.id]};
  });
  const accept = database.transaction((userId,inviteId) => {
    const invitation = database.prepare("SELECT * FROM crew_invites WHERE id=? AND invitee_user_id=? AND status='pending'").get(inviteId,userId);
    if (!invitation) throw new Error('Invitation not found.');
    const source = crewId(userId), target = invitation.crew_id;
    const pendingRecipients=database.prepare("SELECT invitee_user_id AS id FROM crew_invites WHERE status='pending' AND (crew_id=? OR crew_id=?)").all(source??target,target).map(row=>row.id);
    database.prepare("UPDATE crew_invites SET status='accepted',responded_at=CURRENT_TIMESTAMP WHERE id=?").run(inviteId);
    if (source && source!==target) {
      // Cancel duplicates before moving pending invitations to the combined crew.
      database.prepare(`UPDATE crew_invites SET status='cancelled',responded_at=CURRENT_TIMESTAMP WHERE crew_id=? AND status='pending'
        AND invitee_user_id IN(SELECT invitee_user_id FROM crew_invites WHERE crew_id=? AND status='pending')`).run(source,target);
      database.prepare('UPDATE crew_members SET crew_id=? WHERE crew_id=?').run(target,source);
      database.prepare('UPDATE crew_invites SET crew_id=? WHERE crew_id=?').run(target,source);
      database.prepare('DELETE FROM crews WHERE id=?').run(source);
    } else database.prepare('INSERT OR IGNORE INTO crew_members(user_id,crew_id) VALUES(?,?)').run(userId,target);
    database.prepare(`UPDATE crew_invites SET status='cancelled',responded_at=CURRENT_TIMESTAMP
      WHERE status='pending' AND invitee_user_id IN(SELECT user_id FROM crew_members WHERE crew_id=?)`).run(target);
    return {affectedUserIds:[...new Set([...memberIds(userId),...pendingRecipients])]};
  });
  function cancel(userId,inviteId) {
    const row=database.prepare("SELECT * FROM crew_invites WHERE id=? AND status='pending'").get(inviteId);
    if (!row || (row.invitee_user_id!==userId && row.crew_id!==crewId(userId))) throw new Error('Invitation not found.');
    database.prepare("UPDATE crew_invites SET status=?,responded_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'")
      .run(row.invitee_user_id===userId?'declined':'cancelled',inviteId);
    return {affectedUserIds:[...memberIds(row.inviter_user_id),row.invitee_user_id]};
  }
  function savePlayerState(userId,gameId,input) {
    const row=database.prepare(`SELECT id FROM games WHERE id=@gameId AND user_id IN ${memberIdsSql()}`).get({userId,gameId});
    if (!row) throw new Error('Game not found.');
    database.prepare(`INSERT INTO game_player_state(game_id,user_id,rating,play_status,hidden,favorite)
      VALUES(@gameId,@userId,@rating,@playStatus,@hidden,@favorite)
      ON CONFLICT(game_id,user_id) DO UPDATE SET rating=excluded.rating,play_status=CASE WHEN excluded.hidden=1 THEN game_player_state.play_status ELSE excluded.play_status END,
      hidden=excluded.hidden,favorite=excluded.favorite,updated_at=CURRENT_TIMESTAMP`)
      .run({gameId,userId,rating:input.rating??null,playStatus:input.playStatus,hidden:input.hidden?1:0,favorite:input.favorite?1:0});
  }
  return {memberIdsSql,gameSource,memberIds,snapshot,invite,accept,cancel,savePlayerState};
}
module.exports={createCrewStore};
