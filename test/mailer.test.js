const test = require('node:test');
const assert = require('node:assert/strict');
const { patchReply, passwordReset } = require('../server/email-templates');

test('Patch notices use the themed Game Kat·a·log template with a safe app link', () => {
  const notice = patchReply({ body: '<script>nope</script>\nSecond line' });
  const html = notice.html; const text = notice.text;
  assert.match(html, /GAME KAT·A·LOG/);
  assert.match(html, /https:\/\/gamekat\.net(?:\/|\")/);
  assert.match(html, /&lt;script&gt;nope&lt;\/script&gt;<br>Second line/);
  assert.match(text, /OPEN GAME KAT·A·LOG:\nhttps:\/\/gamekat\.net/);
  const reset = passwordReset({ username: 'player', link: 'https://gamekat.net/?reset=token' });
  assert.match(reset.html, /RESET PASSWORD/);
  assert.match(reset.text, /https:\/\/gamekat\.net\/\?reset=token/);
});
