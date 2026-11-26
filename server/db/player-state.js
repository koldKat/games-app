// Decorate shared library records with actor ownership and a separate aggregate rating.
const { db,crews }=require('./connection');
const { catalogueRatingSql }=require('../rating-queries');
function decorateGames(userId,games) {
  if (!games.length) return games;
  const owners=new Map(db.prepare(`SELECT id,username FROM users WHERE id IN ${crews.memberIdsSql()}`).all({userId}).map(row=>[row.id,row.username]));
  const hasCatalogue=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='catalogue_entries'").get());
  const averages=new Map();
  return games.map(game=>{
    const key=game.canonicalReleaseId?`release:${game.canonicalReleaseId}:${game.ownerUserId}`:'game:'+game.id;
    let average=averages.get(key);
    if (!average) {
      const entry=hasCatalogue ? db.prepare(`SELECT id FROM catalogue_entries WHERE status='public' AND
        ((canonical_release_id=@releaseId AND @releaseId IS NOT NULL) OR id IN(SELECT catalogue_id FROM catalogue_game_links WHERE game_id=@gameId)) ORDER BY id LIMIT 1`)
        .get({releaseId:game.canonicalReleaseId??null,gameId:game.id}) : null;
      if(entry) {
        const result=db.prepare(`SELECT ${catalogueRatingSql('average','@entryId')} AS average,${catalogueRatingSql('count','@entryId')} AS count`).get({entryId:entry.id});
        average={ratingAverage:result.average,ratingCount:result.count,ratingScope:'app'};
      } else {
        const result=db.prepare(`SELECT AVG(rating) AS average,COUNT(*) AS count FROM (
          SELECT ps.rating,ROW_NUMBER() OVER(PARTITION BY ps.user_id ORDER BY ps.updated_at DESC,ps.game_id DESC) AS position
          FROM game_player_state ps JOIN games g ON g.id=ps.game_id
          WHERE ps.rating IS NOT NULL AND ps.user_id IN ${crews.memberIdsSql('@userId', '@ownerId')} AND g.user_id IN ${crews.memberIdsSql('@userId', '@ownerId')}
          AND ((g.canonical_game_id=@canonicalId AND @canonicalId IS NOT NULL) OR g.id=@gameId)) WHERE position=1`)
          .get({userId,ownerId:game.ownerUserId,canonicalId:game.canonicalGameId??null,gameId:game.id});
        average={ratingAverage:result.average,ratingCount:result.count,ratingScope:'crew'};
      }
      averages.set(key,average);
    }
    return {...game,...average,ownerUsername:owners.get(game.ownerUserId)||'',canDelete:Number(game.ownerUserId)===Number(userId)};
  });
}
module.exports={decorateGames};
