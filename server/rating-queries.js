// One current rating per player, regardless of duplicate collection copies.
function catalogueRatingSql(column, entry = 'catalogue_entries.id') {
  return `(SELECT ${column === 'count' ? 'COUNT(*)' : 'AVG(rating)'} FROM (
    SELECT ps.rating,ROW_NUMBER() OVER(PARTITION BY ps.user_id ORDER BY ps.updated_at DESC,ps.game_id DESC) AS position
    FROM game_player_state ps JOIN catalogue_game_links link ON link.game_id=ps.game_id
    WHERE link.catalogue_id=${entry} AND ps.rating IS NOT NULL) WHERE position=1)`;
}
module.exports={catalogueRatingSql};
