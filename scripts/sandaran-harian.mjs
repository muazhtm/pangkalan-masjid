// Salinan pangkalan data harian di pelayan (simpan 14 hari). Fail PDF/foto dilindungi oleh Backups DigitalOcean.
import fs from 'node:fs';
import path from 'node:path';
const { db, DATA_DIR } = await import('../db.js');
const dir = path.join(DATA_DIR, 'sandaran');
fs.mkdirSync(dir, { recursive: true });
const tarikh = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' });
const out = path.join(dir, `masjid-${tarikh}.db`);
fs.rmSync(out, { force: true });
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
const lama = fs.readdirSync(dir).filter((f) => /^masjid-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -14);
for (const f of lama) fs.rmSync(path.join(dir, f));
console.log('Sandaran:', out);
