import { $$, $ } from '../core/dom.js';
import { state, runtime } from '../core/runtime.js';
import { api } from '../core/api.js';
import { enterApp } from './session.js';
import { UI_TIMING } from '../core/ui-policy.js';
import { APP_NAME } from '../core/site-config.js';

let passwordResetToken;
let authInputs;

function clearAuthValidation() {
  $('#auth-password-confirm').setCustomValidity('');
  for (const input of authInputs) { input.classList.remove('input-invalid'); input.removeAttribute('aria-invalid'); }
}

function validateAuthForm() {
  const registration = state.authMode === 'register';
  const confirmation = $('#auth-password-confirm');
  confirmation.setCustomValidity(registration && confirmation.value !== $('#auth-password').value ? 'mismatch' : '');
  let firstInvalid = null;
  for (const input of authInputs) {
    const active = !input.closest('label')?.hidden;
    const invalid = active && !input.checkValidity();
    input.classList.toggle('input-invalid', invalid);
    if (invalid) { input.setAttribute('aria-invalid', 'true'); firstInvalid ||= input; }
    else input.removeAttribute('aria-invalid');
  }
  firstInvalid?.focus();
  return !firstInvalid;
}

function setAuthMode(mode) {
  state.authMode = mode;
  $('#auth-screen').dataset.authMode = mode;
  $$('[data-auth-mode]').forEach(button => button.classList.toggle('active', button.dataset.authMode === mode));
  $('#forgot-password').classList.remove('active');
  $('#auth-title').textContent = mode === 'register' ? 'Create an identity' : 'Access your library';
  $('#auth-copy').textContent = mode === 'register' ? 'Create an isolated library account on this server. Your games, settings, and progress stay yours.' : 'Enter your credentials to mount your personal collection.';
  $('#auth-submit').textContent = mode === 'register' ? 'Create account' : 'Authenticate';
  $('#auth-username').placeholder = mode === 'register' ? 'player_one' : '';
  $('#auth-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#auth-password').placeholder = mode === 'register' ? '4+ characters' : '';
  $('#auth-email-label').hidden = mode !== 'register';
  $('#auth-confirm-label').hidden = mode !== 'register';
  $('#auth-password-confirm').required = mode === 'register';
  $('#auth-hint').hidden = mode !== 'register';
  $('#auth-error').hidden = true;
  clearAuthValidation();
}

function showAuthForm() {
  passwordResetToken = '';
  $('#auth-form').hidden = false; $('.auth-tabs').hidden = false;
  $('#password-reset-request-form').hidden = true; $('#password-reset-complete-form').hidden = true;
  setAuthMode('login');
}

function showPasswordResetRequest() {
  passwordResetToken = '';
  $('#auth-form').hidden = true;
  $('#password-reset-complete-form').hidden = true; $('#password-reset-request-form').hidden = false;
  $$('[data-auth-mode]').forEach(button => button.classList.remove('active'));
  $('#forgot-password').classList.add('active');
  $('#auth-title').textContent = 'Reset your password';
  $('#auth-copy').textContent = 'Enter your username or email and we’ll send a one-time reset link.';
  $('#password-reset-request-form').reset(); $('#password-reset-request-error').hidden = true; $('#password-reset-request-success').hidden = true;
  $('#password-reset-identity').disabled = false; $('#password-reset-request-submit').hidden = false;
  setTimeout(() => $('#password-reset-identity').focus(), UI_TIMING.focusDelayMs);
}

function showPasswordResetComplete(token) {
  passwordResetToken = token;
  $('#auth-form').hidden = true;
  $('#password-reset-request-form').hidden = true; $('#password-reset-complete-form').hidden = false;
  $$('[data-auth-mode]').forEach(button => button.classList.remove('active'));
  $('#forgot-password').classList.add('active');
  $('#auth-title').textContent = 'Choose a new password';
  $('#auth-copy').textContent = `Set a new password for your ${APP_NAME} account.`;
  $('#password-reset-complete-form').reset(); $('#password-reset-complete-error').hidden = true; $('#password-reset-complete-success').hidden = true;
  $('#password-reset-new').disabled = false; $('#password-reset-confirm').disabled = false;
  $('#password-reset-complete-submit').hidden = false;
  setTimeout(() => $('#password-reset-new').focus(), UI_TIMING.focusDelayMs);
}

export function initializeAccountAuthentication() {
  authInputs = $$('#auth-form input');
  for (const input of authInputs) input.addEventListener('input', () => {
    input.classList.remove('input-invalid'); input.removeAttribute('aria-invalid');
    if (input === $('#auth-password') || input === $('#auth-password-confirm')) {
      const confirmation = $('#auth-password-confirm'); confirmation.setCustomValidity('');
      confirmation.classList.remove('input-invalid'); confirmation.removeAttribute('aria-invalid');
    }
  });
  $('#auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('#auth-error').hidden = true;
    if (!validateAuthForm()) return;
    const submit = $('#auth-submit'); submit.disabled = true; submit.textContent = state.authMode === 'register' ? 'Creating…' : 'Authenticating…';
    try {
      const result = await api(state.authMode === 'register' ? '/api/register' : '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: $('#auth-username').value, email: state.authMode === 'register' ? $('#auth-email').value : '', password: $('#auth-password').value, passwordConfirm: state.authMode === 'register' ? $('#auth-password-confirm').value : undefined }),
      });
      runtime.sessionGeneration++;
      $('#auth-error').hidden = true;
      await enterApp(result.user, result.preferences, result.progress);
    } catch (error) { $('#auth-error').textContent = error.message; $('#auth-error').hidden = false; }
    finally { submit.disabled = false; submit.textContent = state.authMode === 'register' ? 'Create account' : 'Authenticate'; }
  });
  passwordResetToken = '';
  $('.auth-tabs').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'forgot-password') { showPasswordResetRequest(); return; }
    const mode = button.dataset.authMode;
    if (!mode) return;
    showAuthForm(); setAuthMode(mode);
    setTimeout(() => $('#auth-username').focus(), UI_TIMING.focusDelayMs);
  });
  $('#password-reset-request-form').addEventListener('submit', async event => {
    event.preventDefault(); const submit = $('#password-reset-request-submit'); submit.disabled = true;
    try {
      const identity = $('#password-reset-identity').value.trim();
      if (!identity) throw new Error('Enter your username or email.');
      const result = await api('/api/password-reset/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity }) });
      $('#password-reset-request-success').textContent = result.message; $('#password-reset-request-success').hidden = false;
      $('#password-reset-identity').disabled = true; submit.hidden = true;
    } catch (error) { $('#password-reset-request-error').textContent = error.message; $('#password-reset-request-error').hidden = false; }
    finally { submit.disabled = false; }
  });
  $('#password-reset-complete-form').addEventListener('submit', async event => {
    event.preventDefault(); const submit = $('#password-reset-complete-submit'); submit.disabled = true;
    try {
      const password = $('#password-reset-new').value;
      if (password !== $('#password-reset-confirm').value) throw new Error('Passwords do not match.');
      await api('/api/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: passwordResetToken, password, passwordConfirm: $('#password-reset-confirm').value }) });
      passwordResetToken = ''; $('#password-reset-new').disabled = true; $('#password-reset-confirm').disabled = true;
      submit.hidden = true; $('#password-reset-complete-success').hidden = false;
    } catch (error) { $('#password-reset-complete-error').textContent = error.message; $('#password-reset-complete-error').hidden = false; }
    finally { submit.disabled = false; }
  });
}
export { showAuthForm, setAuthMode, showPasswordResetComplete };
