const crypto = require('node:crypto');
const util = require('node:util');
const { db } = require('./db');

const scrypt = util.promisify(crypto.scrypt);
const SESSION_SECONDS = 14 * 24 * 60 * 60;
const SESSION_COOKIE = 'games_session';
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 200;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 64;
const SESSION_TOKEN_BYTES = 32;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_WINDOW = 8;
const ACCOUNT_FAILURE_LIMIT = 5;
const ACCOUNT_LOCK_SECONDS = 15 * 60;
const PROTECTED_USERNAME = 'koldkat';
const PASSWORD_RESET_SECONDS = 60 * 60;
const PASSWORD_RESET_TOKEN_BYTES = 32;
const failures = new Map();

class AccountLockedError extends Error {
  constructor(message, { manual = false } = {}) {
    super(message); this.name = 'AccountLockedError'; this.code = 'ACCOUNT_LOCKED'; this.status = 423; this.manual = manual;
  }
}

function publicUser(row) {
  return { id: row.id, username: row.username, email: row.email || '', avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null, hideFromActivity: Boolean(row.hide_from_activity) };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString('hex');
  const hash = await scrypt(password, salt, PASSWORD_HASH_BYTES);
  return { hash: hash.toString('hex'), salt };
}

async function verifyPassword(password, storedHash, salt) {
  const actual = await scrypt(password, salt, PASSWORD_HASH_BYTES);
  const expected = Buffer.from(storedHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function validateCredentials(username, password) {
  const clean = String(username || '').trim();
  if (clean.length < USERNAME_MIN_LENGTH || clean.length > USERNAME_MAX_LENGTH) throw new Error('Username must be 3–32 characters.');
  if (!/^[\p{L}\p{N}_.-]+$/u.test(clean)) throw new Error('Username may contain letters, numbers, dot, dash, and underscore.');
  if (String(password || '').length < PASSWORD_MIN_LENGTH || String(password).length > PASSWORD_MAX_LENGTH) throw new Error('Password must be at least 8 characters.');
  return clean;
}

function normalizeEmail(email) {
  const clean = String(email || '').trim().toLocaleLowerCase();
  if (!clean) return null;
  if (clean.length > EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Enter a valid email address or leave it blank.');
  return clean;
}

async function register(username, password, email) {
  const clean = validateCredentials(username, password);
  const cleanEmail = normalizeEmail(email);
  const { hash, salt } = await hashPassword(password);
  try {
    const result = db.prepare('INSERT INTO users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)').run(clean, cleanEmail, hash, salt);
    return { id: Number(result.lastInsertRowid), username: clean, email: cleanEmail, avatarUrl: null, hideFromActivity: false };
  } catch (error) {
    if (String(error.code).includes('SQLITE_CONSTRAINT_UNIQUE')) throw new Error(cleanEmail ? 'Username or email already in use.' : 'Username already taken.');
    throw error;
  }
}

function passwordResetTokenHash(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }
function preparePasswordReset(identity) {
  const value = String(identity || '').trim();
  if (!value) return null;
  const account = db.prepare('SELECT id, username, email FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE').get(value, value);
  if (!account?.email) return null;
  const token = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
  const expiresAt = Math.floor(Date.now() / 1000) + PASSWORD_RESET_SECONDS;
  return { userId: account.id, token, username: account.username, email: account.email, expiresAt };
}
function storePasswordReset(reset) {
  if (!reset?.userId || !reset.token || !reset.expiresAt) return null;
  const save = db.transaction(() => {
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id=? OR expires_at<=?').run(reset.userId, Math.floor(Date.now() / 1000));
    db.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(passwordResetTokenHash(reset.token), reset.userId, reset.expiresAt);
  });
  save(); return reset;
}
async function createPasswordReset(identity) {
  return storePasswordReset(preparePasswordReset(identity));
}
async function resetPassword(token, password) {
  validateCredentials('reset_user', password);
  const now = Math.floor(Date.now() / 1000);
  const tokenHash = passwordResetTokenHash(token);
  const next = await hashPassword(password);
  const apply = db.transaction(() => {
    const reset = db.prepare(`SELECT r.user_id AS userId FROM password_reset_tokens r
      WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at>?`).get(tokenHash, now);
    if (!reset) throw new Error('This password reset link is invalid or has expired.');
    db.prepare('UPDATE users SET password_hash=?, salt=?, failed_login_count=0, locked_until=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next.hash, next.salt, reset.userId);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(reset.userId);
    db.prepare('UPDATE password_reset_tokens SET used_at=? WHERE token_hash=?').run(now, tokenHash);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id=? AND token_hash<>?').run(reset.userId, tokenHash);
  });
  apply();
}

async function login(username, password) {
  const row = db.prepare('SELECT id, username, email, avatar_path, password_hash, salt, failed_login_count, locked_until, admin_locked FROM users WHERE username=? COLLATE NOCASE').get(String(username || '').trim());
  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (row.admin_locked) throw new AccountLockedError('This account has been locked by an administrator.', { manual: true });
  if (row.locked_until && row.locked_until > now) throw new AccountLockedError('This account is temporarily locked after too many failed sign-in attempts. Try again later.');
  if (row.locked_until && row.locked_until <= now) {
    db.prepare('UPDATE users SET failed_login_count=0, locked_until=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
    row.failed_login_count = 0; row.locked_until = null;
  }
  if (!await verifyPassword(String(password || ''), row.password_hash, row.salt)) {
    const failedLoginCount = Number(row.failed_login_count || 0) + 1;
    const lockedUntil = failedLoginCount >= ACCOUNT_FAILURE_LIMIT ? now + ACCOUNT_LOCK_SECONDS : null;
    db.prepare('UPDATE users SET failed_login_count=?, locked_until=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(failedLoginCount, lockedUntil, row.id);
    if (lockedUntil) throw new AccountLockedError('This account is temporarily locked after too many failed sign-in attempts. Try again later.');
    return null;
  }
  if (row.failed_login_count || row.locked_until) db.prepare('UPDATE users SET failed_login_count=0, locked_until=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
  return publicUser(row);
}

function isProtectedUsername(username) { return String(username || '').trim().toLocaleLowerCase() === PROTECTED_USERNAME; }
function protectedAccountError() { return Object.assign(new Error('The protected koldKat account cannot be changed by admin controls.'), { status: 403, code: 'PROTECTED_ACCOUNT' }); }

function setAccountLocked(userId, locked) {
  const account = db.prepare('SELECT id, username, email, avatar_path, admin_locked, locked_until FROM users WHERE id=?').get(Number(userId));
  if (!account) return null;
  if (isProtectedUsername(account.username)) throw protectedAccountError();
  const manuallyLocked = Boolean(locked);
  db.prepare('UPDATE users SET admin_locked=?, failed_login_count=?, locked_until=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(manuallyLocked ? 1 : 0, 0, null, account.id);
  if (manuallyLocked) db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
  return { ...publicUser(account), adminLocked: manuallyLocked, lockedUntil: null };
}

function createSession(userId) {
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

function cookieTokenFromRequest(request) {
  const cookie = String(request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return '';
  try { return decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)); }
  catch { return ''; }
}
function tokenFromRequest(request) {
  const authorization = request.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) return authorization.slice(7);
  return cookieTokenFromRequest(request);
}

function sessionCookie(token, request) {
  const forwarded = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = forwarded === 'https' || Boolean(request.socket?.encrypted);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}
function clearSessionCookie(request) {
  const forwarded = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = forwarded === 'https' || Boolean(request.socket?.encrypted);
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}
function refreshSessionCookie(request) {
  const token = cookieTokenFromRequest(request);
  return token ? sessionCookie(token, request) : '';
}

function authenticate(request) {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare(`SELECT u.id, u.username, u.email, u.avatar_path FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.admin_locked=0`).get(token, now);
  if (!row) return null;
  db.prepare('UPDATE sessions SET expires_at=? WHERE token=?').run(now + SESSION_SECONDS, token);
  return publicUser(row);
}

function logout(request) {
  const token = tokenFromRequest(request);
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
}

async function updateAccount(userId, input) {
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if (!row || !await verifyPassword(String(input.currentPassword || ''), row.password_hash, row.salt)) throw new Error('Current password is incorrect.');
  const username = input.username == null ? row.username : validateCredentials(input.username, input.newPassword || input.currentPassword);
  if (isProtectedUsername(row.username) && username.toLocaleLowerCase() !== row.username.toLocaleLowerCase()) throw new Error('The protected koldKat account cannot be renamed.');
  const email = input.email == null ? row.email : normalizeEmail(input.email);
  let passwordHash = row.password_hash;
  let salt = row.salt;
  const hideFromActivity = input.hideFromActivity == null ? Boolean(row.hide_from_activity) : Boolean(input.hideFromActivity);
  if (input.newPassword) {
    validateCredentials(username, input.newPassword);
    const next = await hashPassword(input.newPassword);
    passwordHash = next.hash; salt = next.salt;
  }
  try {
    db.prepare('UPDATE users SET username=?, email=?, password_hash=?, salt=?, hide_from_activity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(username, email, passwordHash, salt, hideFromActivity ? 1 : 0, userId);
  } catch (error) {
    if (String(error.code).includes('SQLITE_CONSTRAINT_UNIQUE')) throw new Error('Username or email already in use.');
    throw error;
  }
  if (input.newPassword) db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
  return { ...publicUser({ id: userId, username, email, avatar_path: row.avatar_path, hide_from_activity: hideFromActivity }), sessionInvalidated: Boolean(input.newPassword) };
}

function avatarPath(userId) { return db.prepare('SELECT avatar_path FROM users WHERE id=?').get(userId)?.avatar_path || null; }
function updateAvatar(userId, filename) {
  db.prepare('UPDATE users SET avatar_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(filename || null, userId);
  return filename ? `/avatars/${filename}` : null;
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (failures.get(ip) || []).filter(at => now - at < FAILURE_WINDOW_MS);
  failures.set(ip, recent);
  return recent.length >= MAX_FAILURES_PER_WINDOW;
}
function recordFailure(ip) { const recent = failures.get(ip) || []; recent.push(Date.now()); failures.set(ip, recent); }
function clearFailures(ip) { failures.delete(ip); }
function clientIp(request) { return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '').split(',')[0].trim(); }
function purgeExpiredSessions() { db.prepare("DELETE FROM sessions WHERE expires_at<=strftime('%s','now')").run(); }

module.exports = { ACCOUNT_FAILURE_LIMIT, ACCOUNT_LOCK_SECONDS, PASSWORD_RESET_SECONDS, AccountLockedError, hashPassword, verifyPassword, register, preparePasswordReset, storePasswordReset, createPasswordReset, resetPassword, login, createSession, authenticate, logout, sessionCookie, clearSessionCookie, refreshSessionCookie, updateAccount, avatarPath, updateAvatar, isProtectedUsername, setAccountLocked, isRateLimited, recordFailure, clearFailures, clientIp, purgeExpiredSessions };
