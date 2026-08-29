'use strict';

const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { db } = require('./db');

const SECURITY_VALUES = new Set(['starttls', 'tls', 'none']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value, limit = 500) => String(value || '').trim().slice(0, limit);

function settings() { return db.prepare('SELECT host, port, security, username, password, sender FROM mail_settings WHERE id=1').get() || null; }
function publicSettings() {
  const value = settings();
  return value ? { configured: Boolean(value.host && value.sender && value.password), host: value.host, port: value.port, security: value.security, username: value.username, sender: value.sender, hasPassword: Boolean(value.password) }
    : { configured: false, host: '', port: 587, security: 'starttls', username: '', sender: '', hasPassword: false };
}
function saveSettings(input = {}) {
  const previous = settings() || {};
  const host = clean(input.host, 255).toLocaleLowerCase(); const sender = clean(input.sender, 254).toLocaleLowerCase();
  const port = Number(input.port); const security = clean(input.security, 20);
  const username = clean(input.username, 254); const password = input.password == null || input.password === '' ? (previous.password || '') : String(input.password).slice(0, 1_000);
  if (!host || /\s/.test(host)) throw new Error('SMTP host is required.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP port must be between 1 and 65535.');
  if (!SECURITY_VALUES.has(security)) throw new Error('Choose STARTTLS, TLS, or no transport security.');
  if (!EMAIL_PATTERN.test(sender)) throw new Error('Sender must be a valid email address.');
  if (!password) throw new Error('SMTP password is required.');
  db.prepare(`INSERT INTO mail_settings (id, host, port, security, username, password, sender, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET host=excluded.host, port=excluded.port, security=excluded.security, username=excluded.username, password=excluded.password, sender=excluded.sender, updated_at=CURRENT_TIMESTAMP`)
    .run(host, port, security, username, password, sender);
  return publicSettings();
}
function response(socket) {
  return new Promise((resolve, reject) => {
    let text = '';
    const finish = (error, value) => { socket.off('data', onData); socket.off('error', onError); if (error) reject(error); else resolve(value); };
    const onError = error => finish(error);
    const onData = chunk => {
      text += chunk.toString('utf8'); const lines = text.split(/\r?\n/).filter(Boolean); const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) finish(null, { code: Number(last.slice(0, 3)), text });
    };
    socket.on('data', onData); socket.once('error', onError);
  });
}
async function command(socket, line, expected) {
  socket.write(`${line}\r\n`); const result = await response(socket);
  if (!expected.includes(result.code)) throw new Error(`SMTP rejected ${line.split(' ')[0]} (${result.code}).`);
  return result;
}
async function openSocket(config) {
  const socket = config.security === 'tls'
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.createConnection({ host: config.host, port: config.port });
  const greeting = response(socket);
  const [, initialResponse] = await Promise.all([once(socket, config.security === 'tls' ? 'secureConnect' : 'connect'), greeting]);
  return { socket, greeting: initialResponse };
}
function message({ config, to, subject, text, html = '' }) {
  const headers = [`From: Game Kat-a-log <${config.sender}>`, `To: ${to}`, `Subject: ${subject.replace(/[\r\n]/g, '')}`, 'MIME-Version: 1.0'];
  if (!html) return [...headers, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', text].join('\r\n');
  const boundary = `=_gamekat_${crypto.randomBytes(12).toString('hex')}`;
  return [...headers, `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', text,
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', html,
    `--${boundary}--`, ''].join('\r\n');
}
async function send({ to, subject, text, html = '' }) {
  const config = settings();
  if (!config?.host || !config?.sender || !config?.password) throw new Error('Email delivery is not configured.');
  if (!EMAIL_PATTERN.test(clean(to, 254))) throw new Error('A valid recipient email is required.');
  const opened = await openSocket(config); let socket = opened.socket;
  try {
    if (opened.greeting.code !== 220) throw new Error(`SMTP server rejected the connection (${opened.greeting.code}).`);
    const hello = await command(socket, 'EHLO gamekat.net', [250]);
    if (config.security === 'starttls') {
      if (!/STARTTLS/i.test(hello.text)) throw new Error('SMTP server does not offer STARTTLS.');
      await command(socket, 'STARTTLS', [220]); socket = tls.connect({ socket, servername: config.host }); await once(socket, 'secureConnect');
      await command(socket, 'EHLO gamekat.net', [250]);
    }
    if (config.username) await command(socket, `AUTH PLAIN ${Buffer.from(`\u0000${config.username}\u0000${config.password}`).toString('base64')}`, [235]);
    await command(socket, `MAIL FROM:<${config.sender}>`, [250]); await command(socket, `RCPT TO:<${to}>`, [250, 251]); await command(socket, 'DATA', [354]);
    const body = message({ config, to, subject, text, html }).replace(/^\./gm, '..');
    await command(socket, `${body}\r\n.`, [250]); await command(socket, 'QUIT', [221]);
  } finally { socket.destroy(); }
}

module.exports = { publicSettings, saveSettings, send, message };
