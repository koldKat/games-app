import { api, busy, toast } from './core.js';

const form = document.getElementById('mail-settings-form');

export async function loadMailSettings() {
  const settings = await api('GET', '/api/admin/mail');
  for (const name of ['host', 'port', 'security', 'username', 'sender']) form.elements[name].value = settings[name] ?? '';
  form.elements.password.value = '';
}

form.addEventListener('submit', async event => {
  event.preventDefault(); const save = form.querySelector('button[type="submit"]');
  await busy(save, async () => { await api('PUT', '/api/admin/mail', Object.fromEntries(new FormData(form))); form.elements.password.value = ''; toast('Mail settings saved.'); });
});
document.getElementById('mail-test').addEventListener('click', async event => {
  await busy(event.currentTarget, async () => { await api('POST', '/api/admin/mail/test', { to: form.elements.sender.value }); toast('SMTP test email sent.'); });
});
