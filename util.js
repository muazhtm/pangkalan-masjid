export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Teks bersih atau null
export const txt = (v, max = 500) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};
export const intOrNull = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};
export const posId = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};
export const dateOrNull = (v) => {
  const s = txt(v, 10);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
export const arr = (v) => (v === undefined ? [] : [].concat(v));

// Nombor untuk wa.me. Hanya telefon bimbit Malaysia (01x): talian tetap (03-...) tidak boleh WhatsApp.
export function waNumber(phone) {
  if (!phone) return null;
  let d = String(phone).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '60' + d.slice(1);
  else if (d.startsWith('1') && d.length <= 10) d = '60' + d;
  return /^601\d{8,9}$/.test(d) ? d : null;
}

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

export function csvCell(v) {
  let s = String(v ?? '');
  // elak formula injection dalam Excel (kecuali nombor telefon)
  if (/^[=@]/.test(s) || (/^[+\-]/.test(s) && !/^[+\-]?[\d\s-]+$/.test(s))) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const likeEscape = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);

export function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
export function addDays(dateStr, n) {
  const t = new Date(dateStr + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

// "1,330.00" / "1330" -> 133000 sen; tidak sah -> null
export function senOrNull(v) {
  const s = String(v ?? '').replace(/[,\s]/g, '').replace(/^RM/i, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
export const fmtRM = (sen) => (sen / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
