import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from './db.js';

const secretFile = path.join(DATA_DIR, 'secret');
const oldPassFile = path.join(DATA_DIR, 'password'); // versi 1: satu kata laluan tanpa nama pengguna
const DAY = 24 * 3600 * 1000;
export const SESSION_DAYS = 30;
export const MIN_KATA = 8;

let secret;
if (fs.existsSync(secretFile)) secret = fs.readFileSync(secretFile, 'utf8').trim();
else {
  secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
}

export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${h}`;
}
function verify(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const got = crypto.scryptSync(pw, salt, 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const DUMMY = hashPassword('tiada-pengguna-ini');

// Pengguna pertama: APP_USERNAME (lalai "abuabbas") + APP_PASSWORD.
// APP_PASSWORD pada permulaan seterusnya = set semula kata laluan pengguna itu (cara pulih jika terlupa).
export function initUsers() {
  const username = (process.env.APP_USERNAME || 'abuabbas').trim().toLowerCase();
  const env = process.env.APP_PASSWORD;
  const count = db.prepare('SELECT COUNT(*) c FROM pengguna').get().c;
  if (env) {
    if (env.length < MIN_KATA) throw new Error(`APP_PASSWORD mesti sekurang-kurangnya ${MIN_KATA} aksara.`);
    const u = db.prepare('SELECT id FROM pengguna WHERE nama_pengguna = ?').get(username);
    if (u) db.prepare('UPDATE pengguna SET kata_laluan = ?, versi_sesi = versi_sesi + 1 WHERE id = ?').run(hashPassword(env), u.id);
    else db.prepare('INSERT INTO pengguna (nama_pengguna, nama, kata_laluan) VALUES (?, ?, ?)').run(username, 'Abu Abbas', hashPassword(env));
  } else if (!count) {
    if (fs.existsSync(oldPassFile)) {
      db.prepare('INSERT INTO pengguna (nama_pengguna, nama, kata_laluan) VALUES (?, ?, ?)').run(username, 'Abu Abbas', fs.readFileSync(oldPassFile, 'utf8').trim());
    } else {
      throw new Error('Tetapkan kata laluan dahulu: APP_PASSWORD="kata-laluan-panjang" npm start');
    }
  }
}

export function login(username, pw) {
  const u = db.prepare('SELECT * FROM pengguna WHERE nama_pengguna = ? AND aktif = 1').get(String(username || '').trim());
  const ok = verify(String(pw || ''), u ? u.kata_laluan : DUMMY); // masa sama walaupun pengguna tiada
  return ok && u ? u : null;
}

export function checkPassword(userId, pw) {
  const u = db.prepare('SELECT kata_laluan FROM pengguna WHERE id = ?').get(userId);
  return !!u && verify(String(pw || ''), u.kata_laluan);
}

// Tukar kata laluan: semua sesi lain tamat (versi_sesi naik)
export function changePassword(userId, pw) {
  db.prepare('UPDATE pengguna SET kata_laluan = ?, versi_sesi = versi_sesi + 1 WHERE id = ?').run(hashPassword(pw), userId);
}

const sign = (v) => crypto.createHmac('sha256', secret).update(v).digest('hex');

export function makeSession(user) {
  const v = `${user.id}.${user.versi_sesi}.${Date.now() + SESSION_DAYS * DAY}`;
  return `${v}.${sign(v)}`;
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* abaikan */ }
    }
  }
  return out;
}

// Pulangkan pengguna jika sesi sah, atau null
export function sessionUser(req) {
  const tok = parseCookies(req).sesi;
  if (!tok) return null;
  const parts = tok.split('.');
  if (parts.length !== 4) return null;
  const [uid, ver, exp, sig] = parts;
  const want = sign(`${uid}.${ver}.${exp}`);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  if (!(Number(exp) > Date.now())) return null;
  const u = db.prepare('SELECT id, nama_pengguna, nama, versi_sesi FROM pengguna WHERE id = ? AND aktif = 1').get(Number(uid));
  if (!u || String(u.versi_sesi) !== ver) return null;
  return u;
}

export function cookieHeader(value, maxAgeSec) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  return `sesi=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

// Had percubaan log masuk: 5 kali gagal -> kunci 15 minit (ikut IP)
const fails = new Map();
export function isLocked(ip) {
  const f = fails.get(ip);
  return !!f && f.until > Date.now();
}
export function recordFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) { f.until = Date.now() + 15 * 60 * 1000; f.n = 0; }
  fails.set(ip, f);
}
export function clearFails(ip) { fails.delete(ip); }
