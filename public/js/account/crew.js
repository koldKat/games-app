import { roleBadgesMarkup } from './role-badges.js';
import { api, escapeHtml, toast } from '../core/api.js';
import { state } from '../core/runtime.js';
import { confirmAction, closeOnTrueBackdrop } from '../ui-helpers/dialogs.js';

let current = null;
let sequence = 0;
let onCollectionChanged = () => {};
const element = id => document.getElementById(id);
const crewName = crew => crew.name || 'Crew';
const selectedCrew = () => current?.crews.find(crew => String(crew.id) === element('crew-selected').value);
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function paintMembers() {
  const crew = selectedCrew();
  element('crew-leave').hidden = !crew;
  element('crew-members').innerHTML = (crew?.members ?? []).map(member =>
    `<li><strong>${escapeHtml(member.username)}${roleBadgesMarkup(member)}</strong>${member.id === state.user?.id ? '<span class="badge">You</span>' : ''}</li>`).join('');
}

function paintCrew(data, preferredId = element('crew-selected').value) {
  current = data;
  const count = data.incoming.length;
  const button = element('crew-button');
  const badge = element('crew-invite-count');
  button.classList.toggle('has-invites', count > 0);
  badge.hidden = !count;
  badge.textContent = String(count);
  button.dataset.tooltip = count ? `Review ${count} pending Crew invitation${count === 1 ? '' : 's'}.` : 'Share collections with friends and manage Crew invitations.';
  button.setAttribute('aria-label', button.dataset.tooltip);

  const select = element('crew-selected');
  element('crew-picker').hidden = !data.crews.length;
  select.replaceChildren(...data.crews.map(crew => new Option(crewName(crew), String(crew.id))));
  if (data.crews.some(crew => String(crew.id) === String(preferredId))) select.value = String(preferredId);
  paintMembers();

  for (const direction of ['incoming', 'outgoing']) {
    const section = element('crew-' + direction);
    const incoming = direction === 'incoming';
    section.hidden = !data[direction].length;
    section.querySelector('ul').innerHTML = data[direction].map(invite => {
      const name = escapeHtml(invite.username);
      const destination = invite.crewName ? `<small>${escapeHtml(invite.crewName)}</small>` : '';
      const join = incoming ? `<button type="button" class="button secondary" data-crew-accept="${invite.id}">Join Crew</button>` : '';
      return `<li><span class="crew-invite-name">${name}${destination}</span><span class="crew-invite-actions">${join}<button type="button" class="button ghost" data-crew-cancel="${invite.id}">${incoming ? 'Decline' : 'Cancel invitation'}</button></span></li>`;
    }).join('');
  }
}

function showError(message) {
  const target = element('crew-error');
  target.textContent = message;
  target.hidden = !message;
}

export async function refreshCrew() {
  if (!state.user || !element('crew-button')) return;
  const userId = state.user.id;
  const request = ++sequence;
  try {
    const data = await api('/api/crew');
    if (request === sequence && state.user?.id === userId) paintCrew(data);
  } catch (error) {
    if (element('crew-dialog').open) showError(error.message);
  }
}

export function resetCrew() {
  sequence++;
  current = null;
  element('crew-button')?.classList.remove('has-invites');
  const badge = element('crew-invite-count');
  if (badge) badge.hidden = true;
  for (const id of ['crew-picker', 'crew-leave', 'crew-incoming', 'crew-outgoing']) element(id).hidden = true;
  for (const id of ['crew-selected', 'crew-members', 'crew-incoming-list', 'crew-outgoing-list']) element(id).replaceChildren();
}

async function submitCrew(button, action) {
  button.disabled = true;
  showError('');
  sequence++;
  try { await action(); }
  catch (error) { showError(error.message); }
  finally { button.disabled = false; }
}

export function initializeCrew(options = {}) {
  onCollectionChanged = options.onCollectionChanged || (() => {});
  const dialog = element('crew-dialog');
  element('crew-button').addEventListener('click', () => {
    showError('');
    dialog.showModal();
    void refreshCrew();
  });
  dialog.querySelectorAll('[data-crew-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  closeOnTrueBackdrop(dialog, () => dialog.close());
  element('crew-selected').addEventListener('change', paintMembers);
  element('crew-create-form').addEventListener('submit', event => {
    event.preventDefault();
    void submitCrew(event.submitter, async () => {
      const input = element('crew-name');
      const data = await api('/api/crew', post({ name: input.value }));
      paintCrew(data, data.crews.at(-1)?.id);
      input.value = '';
      element('crew-create').open = false;
      toast('Crew created.');
    });
  });
  element('crew-invite-form').addEventListener('submit', event => {
    event.preventDefault();
    void submitCrew(event.submitter, async () => {
      const input = element('crew-username');
      paintCrew(await api('/api/crew/invites', post({ username: input.value, crewId: selectedCrew()?.id })));
      input.value = '';
      toast('Crew invitation sent.');
    });
  });
  element('crew-leave').addEventListener('click', async event => {
    const button = event.currentTarget;
    const crew = selectedCrew();
    if (!crew || !await confirmAction({
      title: 'Leave Crew?', message: `Leave ${crewName(crew)} and remove its shared shelf from your collection? You keep the games you added.`, confirmLabel: 'Leave Crew',
    })) return;
    await submitCrew(button, async () => {
      paintCrew(await api(`/api/crew/${crew.id}`, { method: 'DELETE' }));
      await onCollectionChanged();
      toast('Left the Crew.');
    });
  });
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('[data-crew-accept],[data-crew-cancel]');
    if (!button || button.disabled) return;
    const accepting = button.hasAttribute('data-crew-accept');
    const id = button.dataset.crewAccept || button.dataset.crewCancel;
    if (accepting) {
      const invite = current?.incoming.find(item => String(item.id) === id);
      const name = invite?.crewName || `${invite?.username || 'This player'}’s Crew`;
      if (!await confirmAction({
        title: 'Join Crew?', message: `Join ${name} and share game entries? Your ratings and play status stay personal.`, confirmLabel: 'Join Crew',
      })) return;
    }
    await submitCrew(button, async () => {
      const previous = new Set(current?.crews.map(crew => crew.id));
      const data = await api(`/api/crew/invites/${id}${accepting ? '/accept' : ''}`, { method: accepting ? 'POST' : 'DELETE' });
      paintCrew(data, accepting ? data.crews.find(crew => !previous.has(crew.id))?.id : undefined);
      if (accepting) {
        await onCollectionChanged();
        toast('Joined the Crew.');
      }
    });
  });
}
