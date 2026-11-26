// Crew invitation endpoints expose only the authenticated player's memberships.
function createCrewRoutes({ db, auth, activity, progression, publishProgression, events, readJson, sendJson }) {
  function snapshot(userId) {
    const result = db.crews.snapshot(userId);
    for (const crew of result.crews) {
      crew.members = crew.members.map(member => ({
        ...member, badges: auth.roleBadges(member.username, undefined, member.sidekick),
      }));
    }
    return { ...result, members: result.crews[0]?.members ?? [] };
  }

  return async function crewRoutes(request, response, url, user) {
    const path = url.pathname;
    const method = request.method;
    if (path === '/api/crew' && method === 'GET') return sendJson(response, 200, snapshot(user.id));
    let result;
    try {
      const invite = path.match(/^\/api\/crew\/invites\/(\d+)(\/accept)?$/);
      const crew = path.match(/^\/api\/crew\/(\d+)$/);
      if (path === '/api/crew' && method === 'POST') result = db.crews.create(user.id, (await readJson(request)).name);
      else if (path === '/api/crew/invites' && method === 'POST') {
        const { username, crewId } = await readJson(request);
        result = db.crews.invite(user.id, username, crewId);
      } else if (invite?.[2] && method === 'POST') {
        const invitationId = Number(invite[1]);
        result = db.crews.accept(user.id, invitationId, crewId => ({
          signalChanged: activity.recordCrewJoin(user.id, invitationId),
          progression: progression.recordCrewJoin(user.id, crewId),
        }));
      } else if (invite && !invite[2] && method === 'DELETE') result = db.crews.cancel(user.id, Number(invite[1]));
      else if (crew && method === 'DELETE') result = db.crews.leave(user.id, Number(crew[1]));
      else return;

      for (const id of new Set(result.affectedUserIds)) {
        events.publish(id, 'crew-changed', {});
        events.publish(id, 'library-changed', {});
      }
      if (result.progression) publishProgression(user.id, result.progression);
      if (result.signalChanged) events.publishPublicActivity();
      return sendJson(response, 200, snapshot(user.id));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  };
}
module.exports = { createCrewRoutes };
