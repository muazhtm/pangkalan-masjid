import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'masjid.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS tempat (
  id INTEGER PRIMARY KEY,
  jenis TEXT NOT NULL CHECK (jenis IN ('Masjid','Surau')),
  nama TEXT NOT NULL,
  daerah TEXT,
  alamat TEXT,
  telefon TEXT,
  status TEXT NOT NULL DEFAULT 'Belum dihubungi',
  tidak_mahu_dihubungi INTEGER NOT NULL DEFAULT 0, -- lapuk: diganti status setiap PIC
  produk TEXT,
  kitaran_cuci_bulan INTEGER,
  terakhir_cuci TEXT,
  follow_up TEXT,
  catatan TEXT,
  dicipta TEXT NOT NULL DEFAULT (datetime('now')),
  dikemas TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tempat_status ON tempat(status);
CREATE INDEX IF NOT EXISTS idx_tempat_followup ON tempat(follow_up);
CREATE INDEX IF NOT EXISTS idx_tempat_daerah ON tempat(daerah);

CREATE TABLE IF NOT EXISTS pic (
  id INTEGER PRIMARY KEY,
  tempat_id INTEGER NOT NULL REFERENCES tempat(id) ON DELETE CASCADE,
  nama TEXT,
  jawatan TEXT,
  telefon TEXT
);
CREATE INDEX IF NOT EXISTS idx_pic_tempat ON pic(tempat_id);

CREATE TABLE IF NOT EXISTS lawatan (
  id INTEGER PRIMARY KEY,
  tempat_id INTEGER NOT NULL REFERENCES tempat(id) ON DELETE CASCADE,
  tarikh TEXT NOT NULL,
  keadaan TEXT,
  jenis_karpet TEXT,
  tahun_pasang INTEGER,
  nota TEXT,
  dicipta TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lawatan_tempat ON lawatan(tempat_id, tarikh);

-- panjang/lebar dalam KAKI (sejak versi 2)
CREATE TABLE IF NOT EXISTS ukuran (
  id INTEGER PRIMARY KEY,
  lawatan_id INTEGER NOT NULL REFERENCES lawatan(id) ON DELETE CASCADE,
  label TEXT,
  panjang REAL NOT NULL,
  lebar REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS foto (
  id INTEGER PRIMARY KEY,
  lawatan_id INTEGER NOT NULL REFERENCES lawatan(id) ON DELETE CASCADE,
  fail TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY,
  tempat_id INTEGER NOT NULL REFERENCES tempat(id) ON DELETE CASCADE,
  pic_id INTEGER,
  waktu TEXT NOT NULL,
  saluran TEXT,
  tujuan TEXT,
  ringkasan TEXT
);
CREATE INDEX IF NOT EXISTS idx_log_tempat ON log(tempat_id, waktu);
`);

// ---- Migrasi berversi ----
const migrations = [
  // v1 -> v2: status PIC, dokumen dihantar, pengguna, tetapan, ukuran dalam kaki
  () => {
    db.exec(`
      ALTER TABLE pic ADD COLUMN status TEXT NOT NULL DEFAULT 'Aktif';
      CREATE TABLE IF NOT EXISTS dokumen (
        id INTEGER PRIMARY KEY,
        tempat_id INTEGER NOT NULL REFERENCES tempat(id) ON DELETE CASCADE,
        jenis TEXT NOT NULL CHECK (jenis IN ('Quotation','Invois','Laporan kerja')),
        nombor TEXT NOT NULL,
        tarikh TEXT NOT NULL,
        amaun_sen INTEGER,
        fail TEXT,
        fail_nama TEXT,
        catatan TEXT,
        dicipta TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_dokumen_tempat ON dokumen(tempat_id, tarikh);
      CREATE TABLE IF NOT EXISTS pengguna (
        id INTEGER PRIMARY KEY,
        nama_pengguna TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nama TEXT,
        kata_laluan TEXT NOT NULL,
        versi_sesi INTEGER NOT NULL DEFAULT 1,
        aktif INTEGER NOT NULL DEFAULT 1,
        dicipta TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS tetapan (kunci TEXT PRIMARY KEY, nilai TEXT);
    `);
    // Bendera lama peringkat masjid -> semua PIC tempat itu "Minta jangan hubungi"
    db.exec(`UPDATE pic SET status = 'Minta jangan hubungi' WHERE tempat_id IN (SELECT id FROM tempat WHERE tidak_mahu_dihubungi = 1)`);
    // Ukuran lama dalam meter -> kaki (1 m = 3.28084 kaki)
    db.exec(`UPDATE ukuran SET panjang = round(panjang * 3.28084, 2), lebar = round(lebar * 3.28084, 2)`);
  },
  // v2 -> v3: perkhidmatan bagi setiap dokumen (Karpet baharu / Cuci karpet / Vacuum / Lain-lain)
  () => db.exec('ALTER TABLE dokumen ADD COLUMN perkhidmatan TEXT'),
];

const ver = db.prepare('PRAGMA user_version').get().user_version;
for (let v = ver; v < migrations.length; v++) {
  db.exec('BEGIN');
  try {
    migrations[v]();
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---- Masa (zon Malaysia) ----
const TZ = 'Asia/Kuala_Lumpur';
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
export const nowKL = () => new Date().toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16);

export { addMonths, addDays } from './util.js';

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
