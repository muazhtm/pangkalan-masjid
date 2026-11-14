// Salinan pangkalan data harian di pelayan (simpan 14 hari). Fail PDF/foto dilindungi oleh Backups DigitalOcean.
import fs from 'node:fs';
import path from 'node:path';
const { db, DATA_DIR } = await import('../db.js');
const dir = path.join(DATA_DIR, 'sandaran');
fs.mkdirSync(dir, { recursive: true });
// Sandaran harian: masjid-YYYY-MM-DD.db (simpan 14). Sebelum kemas kini (--kemaskini):
// masjid-YYYY-MM-DD-HHMM.db (simpan 10), supaya tidak menimpa sandaran lain pada hari yang sama.
const sekarang = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' }); // "2026-11-14 08:01:23"
const kemaskini = process.argv.includes('--kemaskini');
const nama = kemaskini ? `${sekarang.slice(0, 10)}-${sekarang.slice(11, 13)}${sekarang.slice(14, 16)}` : sekarang.slice(0, 10);
const out = path.join(dir, `masjid-${nama}.db`);
fs.rmSync(out, { force: true });
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
const pangkas = (re, simpan) => {
  for (const f of fs.readdirSync(dir).filter((f) => re.test(f)).sort().slice(0, -simpan)) fs.rmSync(path.join(dir, f));
};
pangkas(/^masjid-\d{4}-\d{2}-\d{2}\.db$/, 14);
pangkas(/^masjid-\d{4}-\d{2}-\d{2}-\d{4}\.db$/, 10);
console.log('Sandaran:', out);
