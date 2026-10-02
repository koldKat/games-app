import { $ } from '../core/dom.js';

function closeOnTrueBackdrop(targetDialog, close) {
  let startedOnBackdrop = false;
  targetDialog.addEventListener('pointerdown', event => { startedOnBackdrop = event.target === targetDialog; });
  targetDialog.addEventListener('pointerup', event => {
    if (startedOnBackdrop && event.target === targetDialog) close();
    startedOnBackdrop = false;
  });
  targetDialog.addEventListener('pointercancel', () => { startedOnBackdrop = false; });
}

function confirmAction({ title = 'Confirm action', message = '', confirmLabel = 'Confirm', kicker = 'Destructive action' } = {}) {
  const actionDialog = $('#action-dialog');
  if (actionDialog.open) return Promise.resolve(false);
  $('#action-title').textContent = title; $('#action-message').textContent = message;
  $('#action-kicker').textContent = kicker; $('#action-confirm').textContent = confirmLabel;
  return new Promise(resolve => {
    let startedOnBackdrop = false; let settled = false;
    const onClosed = () => { if (!actionDialog.open) finish(false); };
    const finish = value => {
      if (settled) return; settled = true;
      actionDialog.removeEventListener('close', onClosed);
      actionDialog.oncancel = null; actionDialog.onpointerdown = null; actionDialog.onpointerup = null; actionDialog.onpointercancel = null;
      $('#action-close').onclick = null; $('#action-cancel').onclick = null; $('#action-confirm').onclick = null;
      actionDialog.close(); resolve(value);
    };
    $('#action-close').onclick = () => finish(false); $('#action-cancel').onclick = () => finish(false); $('#action-confirm').onclick = () => finish(true);
    actionDialog.oncancel = event => { event.preventDefault(); finish(false); };
    actionDialog.onpointerdown = event => { startedOnBackdrop = event.target === actionDialog; };
    actionDialog.onpointerup = event => { if (startedOnBackdrop && event.target === actionDialog) finish(false); startedOnBackdrop = false; };
    actionDialog.onpointercancel = () => { startedOnBackdrop = false; };
    actionDialog.addEventListener('close', onClosed);
    actionDialog.showModal(); requestAnimationFrame(() => { if (actionDialog.open) $('#action-cancel').focus(); });
  });
}

export { closeOnTrueBackdrop, confirmAction };
