// Crew invitation endpoints expose only the authenticated player's membership.
function createCrewRoutes({db,events,readJson,sendJson}) {
  return async function crewRoutes(request,response,url,user) {
    if (url.pathname==='/api/crew' && request.method==='GET') return sendJson(response,200,db.crews.snapshot(user.id));
    let result;
    try {
      if(url.pathname==='/api/crew/invites' && request.method==='POST') result=db.crews.invite(user.id,(await readJson(request)).username);
      else {
        const match=url.pathname.match(/^\/api\/crew\/invites\/(\d+)(\/accept)?$/);
        if(!match) return;
        if(match[2] && request.method==='POST') result=db.crews.accept(user.id,Number(match[1]));
        else if(!match[2] && request.method==='DELETE') result=db.crews.cancel(user.id,Number(match[1]));
        else return;
      }
      for(const id of new Set(result.affectedUserIds)) {
        events.publish(id,'crew-changed',{});
        events.publish(id,'library-changed',{});
      }
      return sendJson(response,200,db.crews.snapshot(user.id));
    } catch(error) { return sendJson(response,400,{error:error.message}); }
  };
}
module.exports={createCrewRoutes};
