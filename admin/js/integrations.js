import { api, busy, toast } from './core.js';

const forms = [...document.querySelectorAll('[data-app-integration]')];

function render(form, status = {}) {
  const state = form.querySelector('[data-integration-state]');
  state.textContent = status.configured ? 'Connected' : 'Not connected';
  state.classList.toggle('connected', Boolean(status.configured));
}

export async function loadIntegrations() {
  try {
    const statuses = await api('GET', '/api/admin/integrations');
    for (const form of forms) render(form, statuses[form.dataset.appIntegration]);
  } catch (error) { toast(error.message, true); }
}

for (const form of forms) form.addEventListener('submit', async event => {
  event.preventDefault();
  const provider = form.dataset.appIntegration;
  const submit = form.querySelector('button[type="submit"]');
  await busy(submit, async () => {
    const payload = Object.fromEntries(new FormData(form));
    if (Object.values(payload).some(value => !String(value).trim())) throw new Error('Complete every credential field first.');
    const status = await api('PUT', `/api/admin/integrations/${provider}`, payload);
    form.reset(); render(form, status); toast(`${provider === 'igdb' ? 'IGDB' : 'SteamGridDB'} connected for every account.`);
  });
});
