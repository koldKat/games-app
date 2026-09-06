const test = require('node:test');
const assert = require('node:assert/strict');
const { patchNoticeHtml, patchNoticeText } = require('../server/mailer');

test('Patch notices use the themed Game Kat·a·log template with a safe app link', () => {
  const notice = { heading: 'New reply in Ping', detail: 'An operator replied.', body: '<script>nope</script>\nSecond line' };
  const html = patchNoticeHtml(notice); const text = patchNoticeText(notice);
  assert.match(html, /GAME KAT·A·LOG/);
  assert.match(html, /https:\/\/gamekat\.net\//);
  assert.match(html, /&lt;script&gt;nope&lt;\/script&gt;<br>Second line/);
  assert.match(text, /Open Game Kat·a·log:\nhttps:\/\/gamekat\.net\//);
});
