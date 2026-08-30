import { api, busy, toast } from './core.js';

let config = [];
function render() {
  const target = document.getElementById('progression-config'); target.replaceChildren();
  config.forEach(item => {
    const label = document.createElement('label'); const name = document.createElement('span'); name.textContent = item.label;
    const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '100000'; input.step = '1'; input.value = String(item.amount); input.dataset.event = item.event; input.setAttribute('aria-label', `${item.label} XP amount`);
    label.append(name, input); target.append(label);
  });
}
export async function loadProgression() {
  try { config = (await api('GET', '/api/admin/progression')).config; render(); }
  catch (error) { toast(error.message, true); }
}
document.getElementById('save-progression').addEventListener('click', event => busy(event.currentTarget, async () => {
  const amounts = Object.fromEntries([...document.querySelectorAll('#progression-config input')].map(input => [input.dataset.event, Number(input.value)]));
  config = (await api('PUT', '/api/admin/progression', { amounts })).config; render(); toast('XP amounts saved.');
}));
