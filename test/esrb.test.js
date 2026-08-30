'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseResults } = require('../server/esrb');
const { bestExactEsrb, needsEsrbMetadata } = require('../server/esrb-bulk');

test('ESRB parser returns a safe rating candidate from public search markup', () => {
  const [result] = parseResults('<h2>Refine Search</h2><div class="game"><div class="heading"><img alt="E10+"><div class="heading-content"><h2><a href="https://www.esrb.org/ratings/1234/example/">Example</a></h2><div class="platforms">PlayStation 5, Nintendo Switch</div></div></div><div class="content"><table><tr><td><img alt="E10+"></td><td>Fantasy Violence</td><td><p>Users Interact</p></td><td><div class="synopsis">An adventure.</div></td></tr></table></div></div>');
  assert.deepEqual(result, { title: 'Example', esrbRating: 'E10+', descriptors: ['Fantasy Violence'], interactiveElements: ['Users Interact'], platforms: ['PlayStation 5', 'Nintendo Switch'], summary: 'An adventure.', esrbUrl: 'https://www.esrb.org/ratings/1234/example/' });
});
test('ESRB parser ignores the search filter headings entirely', () => {
  assert.deepEqual(parseResults('<h2>Refine Search</h2><div class="platforms">Platforms Included</div>'), []);
});
test('ESRB bulk selection stays exact and platform-aware', () => {
  const game = { title: 'Example', platform: 'PlayStation 5' };
  assert.equal(bestExactEsrb(game, [{ title: 'Example', platforms: ['PlayStation 5'] }]).title, 'Example');
  assert.equal(bestExactEsrb(game, [{ title: 'Example Redux', platforms: ['PlayStation 5'] }]), null);
  assert.equal(needsEsrbMetadata({ esrbRating: '', esrbUrl: '', esrbDescriptors: [], esrbInteractiveElements: [], esrbSummary: '' }), true);
});
test('ESRB batch accepts equivalent platform duplicates but not conflicting editions', () => {
  const game = { title: 'Example', platform: 'PlayStation 5' };
  const shared = [{ title: 'Example', esrbRating: 'Teen', descriptors: ['Violence'], platforms: ['Nintendo Switch'] }, { title: 'Example', esrbRating: 'Teen', descriptors: ['Violence'], platforms: ['Xbox Series'] }];
  assert.equal(bestExactEsrb(game, shared).esrbRating, 'Teen');
  assert.equal(bestExactEsrb(game, [{ ...shared[0], esrbRating: 'Teen' }, { ...shared[1], esrbRating: 'Mature 17+' }]), null);
});
