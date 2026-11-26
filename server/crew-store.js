// Shared collection membership and invitations; game ownership remains with its creator.
const membershipTable = name => `CREATE TABLE ${name}(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crew_id INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,crew_id))`;
function createCrewStore(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS crews(
      id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    ${membershipTable('IF NOT EXISTS crew_members')};
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
  if (!database.pragma('table_info(crews)').some(column => column.name === 'name')) {
    database.exec("ALTER TABLE crews ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  }
  if (!database.pragma('table_info(crews)').some(column => column.name === 'created_by')) {
    database.transaction(() => {
      database.exec(`
        ALTER TABLE crews ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
        UPDATE crews AS c SET created_by=(
          SELECT CASE WHEN COUNT(DISTINCT i.inviter_user_id)=1 THEN MIN(i.inviter_user_id) END
          FROM crew_invites i WHERE i.crew_id=c.id AND i.created_at=c.created_at
        );
        UPDATE crews AS c SET created_by=(
          SELECT CASE WHEN COUNT(*)=1 THEN MIN(m.user_id) END
          FROM crew_members m WHERE m.crew_id=c.id AND m.joined_at=c.created_at
        ) WHERE c.created_by IS NULL;
      `);
    })();
  }
  if (!database.pragma('table_info(crew_members)').some(column => column.name === 'crew_id' && column.pk)) {
    database.transaction(() => database.exec(`
      ${membershipTable('crew_members_next')};
      INSERT INTO crew_members_next SELECT user_id,crew_id,joined_at FROM crew_members;
      DROP TABLE crew_members;
      ALTER TABLE crew_members_next RENAME TO crew_members;
      CREATE INDEX idx_crew_members_crew ON crew_members(crew_id,user_id);
    `))();
  }
  if (!database.prepare("SELECT 1 FROM runtime_settings WHERE key='crew-personal-state-v1'").get()) {
    database.transaction(() => {
      database.exec(`INSERT OR IGNORE INTO game_player_state(game_id,user_id,rating,play_status,hidden,favorite)
        SELECT id,user_id,rating,play_status,hidden,favorite FROM games WHERE user_id IS NOT NULL`);
      database.prepare("INSERT INTO runtime_settings(key,value) VALUES('crew-personal-state-v1','1')").run();
    })();
  }
  const columns = database.prepare('PRAGMA table_info(games)').all().map(row => row.name);
  const personal = new Set(['rating','play_status','hidden','favorite']);
  function memberIdsSql(parameter = '@userId', owner) {
    return `(SELECT peer.user_id FROM crew_members peer JOIN crew_members self ON self.crew_id=peer.crew_id
      WHERE self.user_id=${parameter}${owner ? ` AND EXISTS (
        SELECT 1 FROM crew_members shelf WHERE shelf.crew_id=self.crew_id AND shelf.user_id=${owner})` : ''}
      UNION SELECT ${parameter})`;
  }
  function gameSource(parameter = '@userId') {
    return `(SELECT ${columns.filter(column => !personal.has(column)).map(column => `g."${column}"`).join(',')},
      ps.rating, COALESCE(ps.play_status,'backlog') AS play_status,
      COALESCE(ps.hidden,0) AS hidden, COALESCE(ps.favorite,0) AS favorite
      FROM games g LEFT JOIN game_player_state ps ON ps.game_id=g.id AND ps.user_id=${parameter}
      WHERE g.user_id IN ${memberIdsSql(parameter)}) AS games`;
  }
  const memberships = database.prepare(`SELECT c.id,c.name,c.created_by AS creatorId FROM crews c JOIN crew_members m ON m.crew_id=c.id
    WHERE m.user_id=? ORDER BY c.id`);
  const isMember = database.prepare('SELECT 1 FROM crew_members WHERE user_id=? AND crew_id=?');
  const insertCrew = database.prepare('INSERT INTO crews(name,created_by) VALUES(?,?)');
  const insertMember = database.prepare('INSERT INTO crew_members(user_id,crew_id) VALUES(?,?)');
  const crewMemberIds = database.prepare('SELECT user_id AS id FROM crew_members WHERE crew_id=?');
  function cleanCrewName(name) {
    if (typeof name !== 'string') throw new Error('Enter a Crew name.');
    const clean = name.trim();
    if (clean.length > 60) throw new Error('Crew names can be at most 60 characters.');
    return clean;
  }
  const create = database.transaction((userId, name) => {
    const id = Number(insertCrew.run(cleanCrewName(name),userId).lastInsertRowid);
    insertMember.run(userId,id);
    return { crewId:id, affectedUserIds:[userId] };
  });
  function memberIds(userId) {
    return database.prepare(`SELECT id FROM users WHERE id IN ${memberIdsSql()} ORDER BY id`).all({ userId }).map(row => row.id);
  }
  const crewMembers = database.prepare(`SELECT u.id,u.username,u.is_sidekick AS sidekick,u.avatar_path AS avatarPath,m.joined_at AS joinedAt
    FROM crew_members m JOIN users u ON u.id=m.user_id WHERE m.crew_id=? ORDER BY u.id`);
  function snapshot(userId) {
    const crews = memberships.all(userId).map(({id,name,creatorId}) => ({ id,name,canRename:creatorId===userId,
      members:crewMembers.all(id).map(({avatarPath,...member})=>({...member,avatarUrl:avatarPath?'/avatars/'+encodeURIComponent(avatarPath):null})),
    }));
    return {
      crews,
      incoming: database.prepare(`SELECT i.id,i.created_at AS createdAt,u.username,c.name AS crewName
        FROM crew_invites i JOIN users u ON u.id=i.inviter_user_id JOIN crews c ON c.id=i.crew_id
        WHERE i.invitee_user_id=? AND i.status='pending' ORDER BY i.id DESC`).all(userId),
      outgoing: database.prepare(`SELECT i.id,i.created_at AS createdAt,u.username,c.id AS crewId,c.name AS crewName
        FROM crew_invites i JOIN users u ON u.id=i.invitee_user_id JOIN crews c ON c.id=i.crew_id
        JOIN crew_members m ON m.crew_id=c.id WHERE m.user_id=? AND i.status='pending' ORDER BY i.id DESC`).all(userId),
    };
  }
  const rename = database.transaction((userId,crewId,name) => {
    const crew = memberships.all(userId).find(item => item.id===crewId);
    if (!crew) throw new Error('Crew not found.');
    if (crew.creatorId!==userId) throw new Error('Only the Crew creator can rename it.');
    const clean = cleanCrewName(name);
    if (!clean) throw new Error('Enter a Crew name.');
    database.prepare('UPDATE crews SET name=? WHERE id=?').run(clean,crewId);
    const pending = database.prepare("SELECT invitee_user_id AS id FROM crew_invites WHERE crew_id=? AND status='pending'").all(crewId);
    return {affectedUserIds:[...crewMemberIds.all(crewId),...pending].map(row=>row.id)};
  });
  const invite = database.transaction((userId, username, crewId) => {
    const clean = String(username ?? '').trim();
    if (!clean || clean.length>80) throw new Error('Enter a player username.');
    const target = database.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(clean);
    if (!target) throw new Error('Player not found.');
    if (target.id === userId) throw new Error('You are already in your crew.');
    const current = memberships.all(userId);
    if (crewId == null && current.length > 1) throw new Error('Choose a crew to invite this player to.');
    const id = crewId == null ? current[0]?.id ?? create(userId, '').crewId : Number(crewId);
    if (!Number.isSafeInteger(id) || !isMember.get(userId,id)) throw new Error('Crew not found.');
    if (isMember.get(target.id,id)) throw new Error('That player is already in this crew.');
    if (database.prepare("SELECT 1 FROM crew_invites WHERE crew_id=? AND invitee_user_id=? AND status='pending'").get(id,target.id)) throw new Error('An invitation is already pending.');
    const result = database.prepare('INSERT INTO crew_invites(crew_id,inviter_user_id,invitee_user_id) VALUES(?,?,?)').run(id,userId,target.id);
    return {id:Number(result.lastInsertRowid),affectedUserIds:[...crewMemberIds.all(id).map(row=>row.id),target.id]};
  });
  const accept = database.transaction((userId,inviteId,onAccept) => {
    const invitation = database.prepare("SELECT * FROM crew_invites WHERE id=? AND invitee_user_id=? AND status='pending'").get(inviteId,userId);
    if (!invitation || isMember.get(userId,invitation.crew_id)) throw new Error('Invitation not found.');
    const crewId = invitation.crew_id;
    insertMember.run(userId,crewId);
    database.prepare("UPDATE crew_invites SET status='accepted',responded_at=CURRENT_TIMESTAMP WHERE id=?").run(inviteId);
    return {crewId,collectionChanged:true,affectedUserIds:crewMemberIds.all(crewId).map(row=>row.id),...onAccept?.(crewId)};
  });
  const leave = database.transaction((userId,crewId) => {
    if (!isMember.get(userId,crewId)) throw new Error('Crew not found.');
    const affectedUserIds=crewMemberIds.all(crewId).map(row=>row.id);
    database.prepare('DELETE FROM crew_members WHERE user_id=? AND crew_id=?').run(userId,crewId);
    if (affectedUserIds.length === 1) {
      const pending = database.prepare("SELECT invitee_user_id AS id FROM crew_invites WHERE crew_id=? AND status='pending'").all(crewId);
      affectedUserIds.push(...pending.map(row=>row.id));
      database.prepare("UPDATE crew_invites SET status='cancelled',responded_at=CURRENT_TIMESTAMP WHERE crew_id=? AND status='pending'").run(crewId);
    }
    return {affectedUserIds,collectionChanged:true};
  });
  function cancel(userId,inviteId) {
    const row=database.prepare("SELECT * FROM crew_invites WHERE id=? AND status='pending'").get(inviteId);
    if (!row || (row.invitee_user_id!==userId && !isMember.get(userId,row.crew_id))) throw new Error('Invitation not found.');
    database.prepare("UPDATE crew_invites SET status=?,responded_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'")
      .run(row.invitee_user_id===userId?'declined':'cancelled',inviteId);
    return {affectedUserIds:[...crewMemberIds.all(row.crew_id).map(member=>member.id),row.invitee_user_id]};
  }
  function acceptedInvitations() {
    return database.prepare(`SELECT id,invitee_user_id AS userId,crew_id AS crewId,responded_at AS acceptedAt
      FROM crew_invites WHERE status='accepted' ORDER BY id`).all();
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
  return {memberIdsSql,gameSource,memberIds,snapshot,create,rename,invite,accept,leave,cancel,acceptedInvitations,savePlayerState};
}
module.exports={createCrewStore};
