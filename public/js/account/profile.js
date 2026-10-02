import { $, $$ } from '../core/dom.js';
import { state, runtime } from '../core/runtime.js';
import { coverProviderSettings, steamImporter, gogImporter, progressionUi, activityFeed } from '../boot/services.js';
import { loadCoverStatus, loadPegiStatus, loadHltbStatus, loadDescriptionStatus } from '../metadata/bulk-ui.js';
import { SOURCE_IMAGE_MAX_BYTES } from '../core/ui-policy.js';
import { api, toast } from '../core/api.js';
import { updateAvatarUI, showAuth } from './session.js';
import { closeOnTrueBackdrop } from '../ui-helpers/dialogs.js';
import { savePreferences } from './preferences.js';
import { connectEventStream } from '../core/live-updates.js';

let accountDialog;

function avatarBlob(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file.'));
    if (file.size > SOURCE_IMAGE_MAX_BYTES) return reject(new Error('Source image is too large (maximum 20 MB).'));
    const image = new Image(); const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - size) / 2; const sy = (image.naturalHeight - size) / 2;
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
      canvas.getContext('2d').drawImage(image, sx, sy, size, size, 0, 0, 512, 512);
      const encode = quality => canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Could not process that image.'));
        if (blob.size <= 256 * 1024 || quality <= .2) return blob.size <= 256 * 1024 ? resolve(blob) : reject(new Error('Could not compress avatar below 256 KB.'));
        encode(quality - .1);
      }, 'image/jpeg', quality);
      encode(.9);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read that image.')); };
    image.src = objectUrl;
  });
}

export function initializeAccountProfile() {
  accountDialog = $('#account-dialog');
  $('#account-button').addEventListener('click', () => {
    accountDialog.querySelectorAll('.integration-panel[open]').forEach(panel => { panel.open = false; });
    state.coverStatus = null; state.pegiStatus = null; state.hltbStatus = null; state.descriptionStatus = null;
    coverProviderSettings.reset();
    for (const [statusId, buttonId] of [
      ['cover-provider-status', 'cover-bulk-start'], ['pegi-provider-status', 'pegi-bulk-start'],
      ['hltb-provider-status', 'hltb-bulk-start'], ['description-provider-status', 'description-bulk-start'],
    ]) {
      $(`#${statusId}`).textContent = 'Checking library…';
      $(`#${buttonId}`).disabled = true;
    }
    $('#account-username').value = state.user?.username || '';
    $('#account-email').value = state.user?.email || '';
    $('#account-current-password').value = '';
    $('#account-new-password').value = '';
    $('#account-confirm-password').value = '';
    $('#account-hide-from-activity').checked = Boolean(state.user?.hideFromActivity);
    $('#account-public-profile').checked = Boolean(state.user?.publicProfile);
    $('#account-error').hidden = true;
    accountDialog.showModal();
    accountDialog.querySelector('[data-account-close]')?.focus({ preventScroll: true });
    Promise.all([loadCoverStatus(), coverProviderSettings.load(), loadPegiStatus(), loadHltbStatus(), loadDescriptionStatus(), steamImporter.load(), gogImporter.load(), progressionUi.load()]);
  });
}

export function bindProfileMutationsAndLifecycle() {
  $('#avatar-picker').addEventListener('click', () => $('#avatar-file').click());
  $('#avatar-upload').addEventListener('click', () => $('#avatar-file').click());
  $('#avatar-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    $('#account-error').hidden = true;
    try {
      const blob = await avatarBlob(file);
      const result = await api('/api/account/avatar', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      state.user.avatarUrl = `${result.avatarUrl}?v=${Date.now()}`; updateAvatarUI(); toast('Avatar updated.');
    } catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; }
  });
  $('#avatar-remove').addEventListener('click', async () => {
    try { await api('/api/account/avatar', { method: 'DELETE' }); state.user.avatarUrl = null; updateAvatarUI(); toast('Avatar removed.'); }
    catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; }
  });
  $$('[data-account-close]').forEach(button => button.addEventListener('click', () => accountDialog.close()));
  closeOnTrueBackdrop(accountDialog, () => accountDialog.close());
  $('#logout-button').addEventListener('click', async () => {
    await savePreferences();
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    runtime.sessionGeneration++;
    accountDialog.close();
    $('#auth-form').reset();
    showAuth();
  });
  window.addEventListener('pagehide', () => {
    state.stopEvents?.(); state.stopEvents = null;
    activityFeed.stop();
    void savePreferences(true);
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !state.user) return;
    connectEventStream();
    activityFeed.start();
  });
  $('#account-form').addEventListener('submit', async event => {
    event.preventDefault();
    const newPassword = $('#account-new-password').value;
    if (newPassword !== $('#account-confirm-password').value) {
      $('#account-error').textContent = 'New passwords do not match.'; $('#account-error').hidden = false; return;
    }
    const save = $('#account-save'); save.disabled = true; save.textContent = 'Saving…';
    try {
      const result = await api('/api/account', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        username: $('#account-username').value, email: $('#account-email').value, currentPassword: $('#account-current-password').value, newPassword,
        publicProfile: $('#account-public-profile').checked,
        hideFromActivity: $('#account-hide-from-activity').checked,
      }) });
      accountDialog.close();
      if (result.user.sessionInvalidated) {
        runtime.sessionGeneration++; showAuth('Password changed. Log in with the new password.');
      } else {
        state.user = result.user; $('#account-name').textContent = result.user.username; $('#account-current-name').textContent = result.user.username; updateAvatarUI(); toast('Account updated.');
      }
    } catch (error) { $('#account-error').textContent = error.message; $('#account-error').hidden = false; }
    finally { save.disabled = false; save.textContent = 'Save account'; }
  });
}
