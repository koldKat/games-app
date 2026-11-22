const {test,after}=require('node:test');
const assert=require('node:assert/strict');
process.env.DB_PATH=':memory:';
const data=require('../server/db');
const users=['Alice','Bob','Carol','Dan'].map(username=>Number(data.db.prepare("INSERT INTO users(username,password_hash,salt) VALUES(?,'unused','unused')").run(username).lastInsertRowid));
const [alice,bob,carol,dan]=users;
after(()=>data.db.close());
const input=(title,extra={})=>({title,platform:'Nintendo Switch',ownership:'owned',playStatus:'backlog',...extra});
let original;
test('invitations require recipient consent and keep unrelated collections private',()=>{
  original=data.createGame(alice,input('Crew adventure',{rating:4,playStatus:'playing',favorite:true}));
  data.createGame(bob,input('Bob adventure'));
  assert.equal(data.getGame(bob,original.id),undefined);
  assert.throws(()=>data.crews.invite(alice,'Alice'));
  const invite=data.crews.invite(alice,'Bob');
  assert.throws(()=>data.crews.invite(alice,'bob'));
  assert.throws(()=>data.crews.accept(carol,invite.id));
  assert.throws(()=>data.crews.cancel(carol,invite.id));
  assert.equal(data.listGames(bob).length,1);
  data.crews.accept(bob,invite.id);
  assert.equal(data.listGames(alice).length,2);
  assert.equal(data.listGames(bob).length,2);
  assert.equal(data.getGame(carol,original.id),undefined);
});
test('members edit shared details but ratings, status, favorites and deletion ownership stay personal',()=>{
  let theirs=data.getGame(bob,original.id);
  assert.equal(theirs.rating,null);assert.equal(theirs.playStatus,'backlog');assert.equal(theirs.favorite,0);
  assert.equal(theirs.canDelete,false);assert.equal(theirs.ownerUserId,alice);
  assert.equal(data.deleteGame(bob,original.id),false);
  const edited=data.updateGame(bob,original.id,{...theirs,title:'Edited shared adventure',rating:2,playStatus:'completed',favorite:true});
  assert.equal(edited.rating,2);assert.equal(edited.playStatus,'completed');
  const mine=data.getGame(alice,original.id);
  assert.equal(mine.title,'Edited shared adventure');assert.equal(mine.rating,4);assert.equal(mine.playStatus,'playing');assert.equal(mine.canDelete,true);
  assert.equal(mine.ratingAverage,3);assert.equal(mine.ratingCount,2);assert.equal(mine.ratingScope,'crew');
  assert.equal(data.listGames(bob,{playStatus:'completed'}).length,1);
  assert.equal(data.listGames(alice,{playStatus:'completed'}).length,0);
  assert.equal(data.stats(bob).play.find(s=>s.label==='completed').count,1);
  assert.equal(data.listGamesPage(bob).total,2);
  assert.equal(data.randomGame(bob,{playStatus:'completed'}).id,original.id);
  assert.ok(data.searchGameTitles(bob,'Edited').some(g=>g.id===original.id));
});
test('joining combines both crews without changing owners or ratings',()=>{
  const invite=data.crews.invite(carol,'Dan');data.crews.accept(dan,invite.id);
  const other=data.createGame(carol,input('Carol adventure',{rating:5}));
  const merge=data.crews.invite(alice,'Carol');data.crews.accept(carol,merge.id);
  assert.deepEqual(data.crews.memberIds(dan),users);
  assert.equal(data.getGame(dan,other.id).ownerUserId,carol);
  assert.equal(data.getGame(dan,other.id).rating,null);
  assert.equal(data.getGame(carol,other.id).rating,5);
  assert.equal(data.getGame(bob,original.id).rating,2);
  assert.throws(()=>data.crews.accept(carol,merge.id));
});

test('public averages include other crews while each rating control keeps its own vote',()=>{
  const {createKatalogStore}=require('../server/katalog-store');
  const {evaluateKatalogGame}=require('../server/katalog-policy');
  const store=createKatalogStore(data.db);
  const complete={...data.getGame(alice,original.id),pegi:12,publisher:'Test publisher',releaseYear:2020,
    pegiUrl:'https://pegi.info/test',pegiDescriptors:['Violence'],hltbId:700,hltbTitle:'Edited shared adventure',
    hltbUrl:'https://howlongtobeat.com/game/700',hltbMainStory:8,coverSource:'steamgriddb',
    coverMatchTitle:'Edited shared adventure',coverUrl:'/covers/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg'};
  data.updateGame(alice,original.id,complete);
  const published=store.upsertFromGame(alice,data.getGame(alice,original.id),evaluateKatalogGame(complete),complete.coverUrl);
  assert.equal(published.entry.status,'public');
  const eve=Number(data.db.prepare("INSERT INTO users(username,password_hash,salt) VALUES('Eve','unused','unused')").run().lastInsertRowid);
  const outsider=data.createGame(eve,{...complete,rating:5});
  store.upsertFromGame(eve,outsider,evaluateKatalogGame(outsider),complete.coverUrl);
  const mine=data.getGame(alice,original.id),theirs=data.getGame(bob,original.id);
  assert.equal(mine.rating,4);assert.equal(theirs.rating,2);
  assert.equal(mine.ratingScope,'app');assert.equal(mine.ratingCount,3);
  assert.ok(Math.abs(mine.ratingAverage-11/3)<0.00001);
  assert.equal(store.getPublicBySlug(published.entry.slug).ratingCount,3);
  assert.equal(data.getGame(eve,original.id),undefined);
});
test('metadata edits use shared access without exposing unrelated entries',()=>{
  const game=data.createGame(alice,input('Shared metadata'));
  assert.ok(data.gamesMissingDescriptions(bob).some(item=>item.id===game.id));
  assert.equal(data.updateGameDescription(bob,game.id,{description:'A shared description.'}).description,'A shared description.');
  const eve=data.db.prepare("SELECT id FROM users WHERE username='Eve'").get().id;
  assert.equal(data.updateGameDescription(eve,game.id,{description:'Unauthorized'}),null);
  assert.equal(data.getGame(alice,game.id).description,'A shared description.');
});

test('SSE reloads peers without sending the acting player personal fields',()=>{
  const {createProgressionBridge}=require('../server/runtime/progression');
  const messages=[];
  const bridge=createProgressionBridge({progression:{recordGame:()=>({awards:[]})},katalog:{syncGameSafely:()=>null},activity:{},
    events:{publish:(id,event,payload)=>messages.push({id,event,payload})}});
  bridge.publishAppEvent(alice,'game-updated',{game:data.getGame(alice,original.id)});
  const peer=messages.filter(message=>message.id===bob);
  assert.deepEqual(peer,[{id:bob,event:'library-changed',payload:{}}]);
  const eve=data.db.prepare("SELECT id FROM users WHERE username='Eve'").get().id;
  assert.equal(messages.some(message=>message.id===eve),false);
});
test('personal-state migration runs once and does not restore cleared ratings',()=>{
  const {createCrewStore}=require('../server/crew-store');
  data.updateGame(bob,original.id,{...data.getGame(bob,original.id),rating:null});
  createCrewStore(data.db);
  assert.equal(data.getGame(bob,original.id).rating,null);
  assert.equal(data.getGame(alice,original.id).rating,4);
});

test('milestone games mirror the visible crew collection and use the current player’s statuses', () => {
  const { isEnriched } = require('../server/progression-service');
  const hidden = data.createGame(alice, input('Only hidden from Bob', { rating: 5 }));
  data.updateGame(bob, hidden.id, { ...data.getGame(bob, hidden.id), playStatus: 'hidden' });

  const milestones = data.listLibraryMilestoneGames(bob);
  const library = data.listGames(bob);
  const facts = game => ({
    title: game.title, status: game.playStatus, owned: game.ownership,
    enriched: isEnriched(game), formatPhysical: game.formatPhysical, formatDigital: game.formatDigital,
  });
  assert.deepEqual(milestones.map(facts), library.map(facts));
  assert.equal(milestones.find(game => game.title === 'Edited shared adventure').playStatus, 'completed');
  assert.ok(milestones.some(game => game.title === 'Carol adventure'));
  assert.ok(!milestones.some(game => game.title === 'Only hidden from Bob'));
  assert.ok(data.listLibraryMilestoneGames(alice).some(game => game.title === 'Only hidden from Bob'));
});
