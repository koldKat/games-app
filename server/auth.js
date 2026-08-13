const crypto = require('node:crypto');
const util = require('node:util');
const { db } = require('./db');

const scrypt = util.promisify(crypto.scrypt);
const SESSION_SECONDS = 14 * 24 * 60 * 60;
const SESSION_COOKIE = 'games_session';
const failures = new Map();

function publicUser(row) {
  return { id: row.id, username: row.username, email: row.email || '', avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return { hash: hash.toString('hex'), salt };
}

async function verifyPassword(password, storedHash, salt) {
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function validateCredentials(username, password) {
  const clean = String(username || '').trim();
  if (clean.length < 3 || clean.length > 32) throw new Error('Username must be 3–32 characters.');
  if (!/^[\p{L}\p{N}_.-]+$/u.test(clean)) throw new Error('Username may contain letters, numbers, dot, dash, and underscore.');
  if (String(password || '').length < 8 || String(password).length > 200) throw new Error('Password must be at least 8 characters.');
  return clean;
}

function normalizeEmail(email) {
  const clean = String(email || '').trim().toLocaleLowerCase();
  if (!clean) return null;
  if (clean.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Enter a valid email address or leave it blank.');
  return clean;
}

async function register(username, password, email) {
  const clean = validateCredentials(username, password);
  const cleanEmail = normalizeEmail(email);
  const { hash, salt } = await hashPassword(password);
  try {
    const result = db.prepare('INSERT INTO users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)').run(clean, cleanEmail, hash, salt);
    return { id: Number(result.lastInsertRowid), username: clean, email: cleanEmail, avatarUrl: null };
  } catch (error) {
    if (String(error.code).includes('SQLITE_CONSTRAINT_UNIQUE')) throw new Error(cleanEmail ? 'Username or email already in use.' : 'Username already taken.');
    throw error;
  }
}

async function login(username, password) {
  const row = db.prepare('SELECT id, username, email, avatar_path, password_hash, salt FROM users WHERE username=? COLLATE NOCASE').get(String(username || '').trim());
  if (!row || !await verifyPassword(String(password || ''), row.password_hash, row.salt)) return null;
  return publicUser(row);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
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
  const row = db.prepare(`SELECT u.id, u.username, u.email, u.avatar_path FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?`).get(token, now);
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
  const email = input.email == null ? row.email : normalizeEmail(input.email);
  let passwordHash = row.password_hash;
  let salt = row.salt;
  if (input.newPassword) {
    validateCredentials(username, input.newPassword);
    const next = await hashPassword(input.newPassword);
    passwordHash = next.hash; salt = next.salt;
  }
  try {
    db.prepare('UPDATE users SET username=?, email=?, password_hash=?, salt=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(username, email, passwordHash, salt, userId);
  } catch (error) {
    if (String(error.code).includes('SQLITE_CONSTRAINT_UNIQUE')) throw new Error('Username or email already in use.');
    throw error;
  }
  if (input.newPassword) db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
  return { ...publicUser({ id: userId, username, email, avatar_path: row.avatar_path }), sessionInvalidated: Boolean(input.newPassword) };
}

function avatarPath(userId) { return db.prepare('SELECT avatar_path FROM users WHERE id=?').get(userId)?.avatar_path || null; }
function updateAvatar(userId, filename) {
  db.prepare('UPDATE users SET avatar_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(filename || null, userId);
  return filename ? `/avatars/${filename}` : null;
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (failures.get(ip) || []).filter(at => now - at < 15 * 60 * 1000);
  failures.set(ip, recent);
  return recent.length >= 8;
}
function recordFailure(ip) { const recent = failures.get(ip) || []; recent.push(Date.now()); failures.set(ip, recent); }
function clearFailures(ip) { failures.delete(ip); }
function clientIp(request) { return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '').split(',')[0].trim(); }
function purgeExpiredSessions() { db.prepare("DELETE FROM sessions WHERE expires_at<=strftime('%s','now')").run(); }

module.exports = { hashPassword, verifyPassword, register, login, createSession, authenticate, logout, sessionCookie, clearSessionCookie, refreshSessionCookie, updateAccount, avatarPath, updateAvatar, isRateLimited, recordFailure, clearFailures, clientIp, purgeExpiredSessions };
