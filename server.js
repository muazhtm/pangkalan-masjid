import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, tx, ROOT, DATA_DIR, UPLOAD_DIR, today, nowKL, addMonths, addDays, keluasanDariTeks } from './db.js';
import { kiraSkor, senaraiKeutamaan, kadarTukar } from './skor.js';
import {
  JENIS, STATUS, KEADAAN, SALURAN, TUJUAN, WA_TUJUAN, STATUS_PIC, JENIS_DOK, JENIS_BARANG, PENGGUNAAN, LALAI, selangFilter,
  hayatKarpet, cuciAwalHari, waMesej, labelStatus, semuaTetapan, simpanTetapan, sahLokasi, NEGERI,
} from './config.js';
import { txt, intOrNull, posId, dateOrNull, arr, waNumber, parseCsv, csvCell, likeEscape, senOrNull, fmtRM } from './util.js';
import * as auth from './auth.js';
import * as V from './views.js';
import { writeTarGz, listUploads } from './backup.js';

auth.initUsers();

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://wa.me",
  });
  next();
});
app.use('/static', express.static(path.join(ROOT, 'public'), { maxAge: '1h' }));
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json').send(JSON.stringify({
    name: 'Pangkalan Masjid', short_name: 'Masjid', start_url: '/', display: 'standalone',
    background_color: '#F6F5EF', theme_color: '#14532D',
    icons: [{ src: '/static/img/ikon.png', sizes: '512x512', type: 'image/png' }],
  }));
});
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use((req, res, next) => { req.body ??= {}; next(); });

// ---------- Log masuk ----------
app.get('/login', (req, res) => res.send(V.loginPage()));
app.post('/login', (req, res) => {
  const ip = req.ip;
  const nama = txt(req.body.nama_pengguna, 60) || '';
  if (auth.isLocked(ip)) return res.status(429).send(V.loginPage('Terlalu banyak percubaan. Cuba lagi selepas 15 minit.', nama));
  const u = auth.login(nama, req.body.kata_laluan);
  if (u) {
    auth.clearFails(ip);
    res.set('Set-Cookie', auth.cookieHeader(auth.makeSession(u), auth.SESSION_DAYS * 86400));
    return res.redirect(303, '/');
  }
  auth.recordFail(ip);
  res.status(401).send(V.loginPage('Nama pengguna atau kata laluan salah.', nama));
});
app.post('/logout', (req, res) => {
  res.set('Set-Cookie', auth.cookieHeader('', 0));
  res.redirect(303, '/login');
});

app.use((req, res, next) => {
  const u = auth.sessionUser(req);
  if (u) { req.user = u; res.locals.user = u; V.setUser(u); return next(); }
  if (req.method === 'GET') return res.redirect(303, '/login');
  res.status(401).send('Perlu log masuk.');
});

// ---------- Muat naik ----------
const randName = (ext) => crypto.randomBytes(16).toString('hex') + '.' + ext;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heic' };
const EXT_DOK = { ...EXT, 'application/pdf': 'pdf' };
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, file, cb) => cb(null, randName(EXT[file.mimetype])) }),
  fileFilter: (req, file, cb) => cb(null, !!EXT[file.mimetype]),
  limits: { fileSize: 12 * 1024 * 1024, files: 10, fields: 60 },
});
const uploadDok = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, file, cb) => cb(null, randName(EXT_DOK[file.mimetype])) }),
  fileFilter: (req, file, cb) => cb(null, !!EXT_DOK[file.mimetype]),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 20 },
});
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf' };
app.get('/uploads/:fail', (req, res) => {
  const m = /^[a-f0-9]{32}\.(jpg|png|webp|heic|pdf)$/.exec(req.params.fail);
  if (!m) return res.sendStatus(404);
  res.set({ 'Cache-Control': 'private, max-age=86400', 'Content-Type': MIME[m[1]] });
  res.sendFile(path.join(UPLOAD_DIR, req.params.fail), (e) => e && !res.headersSent && res.sendStatus(404));
});

const removeFiles = (files) => files.filter(Boolean).forEach((f) => fs.rm(path.join(UPLOAD_DIR, f), { force: true }, () => {}));

// PDF mesti benar-benar PDF (bukan HTML yang dinamakan .pdf)
function validDokFile(file) {
  if (!file) return true;
  if (!file.filename.endsWith('.pdf')) return true;
  const fd = fs.openSync(file.path, 'r');
  const b = Buffer.alloc(5);
  fs.readSync(fd, b, 0, 5, 0);
  fs.closeSync(fd);
  return b.toString() === '%PDF-';
}

// ---------- Hari ini ----------
function tindakanHariIni() {
  const tarikh = today();
  const items = [];
  for (const t of db.prepare(`SELECT id, nama, jenis, daerah, status, follow_up FROM tempat WHERE follow_up IS NOT NULL AND follow_up <= ? ORDER BY follow_up, nama`).all(tarikh)) {
    items.push({ kind: 'susulan', id: t.id, nama: t.nama, tarikh: t.follow_up, sub: `${t.jenis}${t.daerah ? ' · ' + t.daerah : ''} · ${labelStatus(t.status)}` });
  }
  const limit = addDays(tarikh, cuciAwalHari());
  db.prepare(`SELECT id, nama, terakhir_cuci, kitaran_cuci_bulan FROM tempat WHERE status = 'Pelanggan' AND kitaran_cuci_bulan > 0 AND terakhir_cuci IS NOT NULL`)
    .all()
    .map((t) => ({ ...t, due: addMonths(t.terakhir_cuci, t.kitaran_cuci_bulan) }))
    .filter((t) => t.due <= limit)
    .sort((a, b) => a.due.localeCompare(b.due))
    .forEach((t) => items.push({ kind: 'cuci', id: t.id, nama: t.nama, tarikh: t.due, sub: `Cucian terakhir ${t.terakhir_cuci} · setiap ${t.kitaran_cuci_bulan} bulan` }));
  // Filter beg vacuum: tarikh terakhir beli + selang
  db.prepare(`SELECT t.id, t.nama, b.butiran, b.filter_terakhir, b.selang_filter_bulan FROM barang b JOIN tempat t ON t.id = b.tempat_id
              WHERE b.jenis = 'Vacuum' AND b.penggunaan = 'Digunakan' AND b.filter_terakhir IS NOT NULL`)
    .all()
    .map((r) => ({ ...r, due: addMonths(r.filter_terakhir, r.selang_filter_bulan || selangFilter()) }))
    .filter((r) => r.due <= limit)
    .sort((a, b) => a.due.localeCompare(b.due))
    .forEach((r) => items.push({ kind: 'filter', id: r.id, nama: r.nama, tarikh: r.due, model: r.butiran, sub: `Filter beg ${r.butiran || 'vacuum'} · dibeli ${r.filter_terakhir}` }));
  const tahunIni = Number(tarikh.slice(0, 4));
  const hayat = hayatKarpet();
  // Karpet yang kita pasang: guna tarikh pasang sebenar
  const adaTarikhPasang = new Set();
  for (const r of db.prepare(`SELECT t.id, t.nama, t.status, b.butiran, b.tarikh FROM barang b JOIN tempat t ON t.id = b.tempat_id
                               WHERE b.jenis = 'Karpet' AND b.tarikh IS NOT NULL AND t.status != 'Tidak berminat'`).all()) {
    adaTarikhPasang.add(r.id);
    const due = addMonths(r.tarikh, hayat * 12);
    if (due <= tarikh) items.push({ kind: 'tukar', id: r.id, nama: r.nama, status: r.status, sub: `${r.butiran || 'Karpet'} dipasang ${r.tarikh.split('-').reverse().join('/')} (${hayat} tahun)` });
  }
  const rows = db.prepare(
    `SELECT t.id, t.nama, t.status, l.keadaan, l.tahun_pasang, l.tarikh
     FROM tempat t JOIN lawatan l ON l.id = (SELECT id FROM lawatan WHERE tempat_id = t.id ORDER BY tarikh DESC, id DESC LIMIT 1)
     WHERE t.status != 'Tidak berminat'`
  ).all();
  for (const r of rows) {
    const reasons = [];
    if (r.keadaan === 'Rosak') reasons.push(`Karpet rosak (lawatan ${r.tarikh.split('-').reverse().join('/')})`);
    if (!adaTarikhPasang.has(r.id) && r.tahun_pasang && r.tahun_pasang + hayat <= tahunIni) reasons.push(`Dipasang ± ${r.tahun_pasang} (${tahunIni - r.tahun_pasang} tahun)`);
    if (reasons.length) items.push({ kind: 'tukar', id: r.id, nama: r.nama, status: r.status, sub: reasons.join(' · ') });
  }
  return { tarikh, items };
}

app.get('/', (req, res) => {
  const { tarikh, items } = tindakanHariIni();
  const stats = Object.fromEntries(db.prepare('SELECT status, COUNT(*) c FROM tempat GROUP BY status').all().map((r) => [r.status, r.c]));
  const total = db.prepare('SELECT COUNT(*) c FROM tempat').get().c;
  res.send(V.dashboardPage({ tarikh, items, stats, total, hayat: hayatKarpet(), awal: cuciAwalHari(), keutamaan: senaraiKeutamaan(15), kadar: kadarTukar() }));
});

// ---------- Senarai ----------
const PAGE = 40;
app.get('/tempat', (req, res) => {
  const q = txt(req.query.q, 100) || '';
  const f = {
    jenis: JENIS.includes(req.query.jenis) ? req.query.jenis : '',
    negeri: NEGERI.includes(req.query.negeri) ? req.query.negeri : '',
    daerah: txt(req.query.daerah, 100) || '',
    status: STATUS.includes(req.query.status) ? req.query.status : '',
    susulan: req.query.susulan === '1' ? '1' : '',
  };
  const where = [];
  const params = [];
  if (q) {
    where.push(`(t.nama LIKE ? ESCAPE '\\' OR t.alamat LIKE ? ESCAPE '\\' OR t.daerah LIKE ? ESCAPE '\\' OR t.negeri LIKE ? ESCAPE '\\')`);
    const p = `%${likeEscape(q)}%`;
    params.push(p, p, p, p);
  }
  if (f.jenis) { where.push('t.jenis = ?'); params.push(f.jenis); }
  if (f.negeri) { where.push('t.negeri = ?'); params.push(f.negeri); }
  if (f.daerah) { where.push('t.daerah = ?'); params.push(f.daerah); }
  if (f.status) { where.push('t.status = ?'); params.push(f.status); }
  if (f.susulan) where.push('t.follow_up IS NOT NULL');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM tempat t ${w}`).get(...params).c;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(Math.max(intOrNull(req.query.page) || 1, 1), pages);
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT keadaan FROM lawatan WHERE tempat_id = t.id ORDER BY tarikh DESC, id DESC LIMIT 1) AS keadaan
       FROM tempat t ${w} ORDER BY t.nama COLLATE NOCASE LIMIT ? OFFSET ?`
    )
    .all(...params, PAGE, (page - 1) * PAGE);
  const daerahList = db.prepare(`SELECT DISTINCT daerah FROM tempat WHERE daerah IS NOT NULL ${f.negeri ? 'AND negeri = ?' : ''} ORDER BY daerah COLLATE NOCASE`).all(...(f.negeri ? [f.negeri] : [])).map((r) => r.daerah);
  const negeriList = db.prepare(`SELECT DISTINCT negeri FROM tempat WHERE negeri IS NOT NULL ORDER BY negeri`).all().map((r) => r.negeri);
  const pilihId = posId(req.query.pilih);
  const pilih = pilihId ? loadDetail(pilihId) : null;
  res.send(V.listPage({ rows, total, page, pages, q, f, daerahList, negeriList, pilih, from: (page - 1) * PAGE }));
});

// ---------- Cipta / kemas kini ----------
const kpOrNull = (v) => { const n = Number.parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n) : null; };

// Sejarah cucian: satu baris setiap cucian. tempat.terakhir_cuci sentiasa = cucian terkini.
function catatCucian(tempatId, tarikh, catatan = null) {
  if (!tarikh) return;
  if (!db.prepare('SELECT 1 FROM cucian WHERE tempat_id = ? AND tarikh = ?').get(tempatId, tarikh)) {
    db.prepare('INSERT INTO cucian (tempat_id, tarikh, catatan) VALUES (?,?,?)').run(tempatId, tarikh, catatan);
  }
  selarasCuci(tempatId);
}
// Medan "Cucian terakhir" di borang = baris cucian terkini.
// Tarikh lebih lewat = cucian baharu (tambah baris). Tarikh lebih awal = pembetulan (ubah baris terkini).
// Dikosongkan = buang baris terkini.
function betulkanCuciBorang(tempatId, lama, baru) {
  const terkini = lama && db.prepare('SELECT id FROM cucian WHERE tempat_id = ? AND tarikh = ? ORDER BY id DESC LIMIT 1').get(tempatId, lama);
  if (!baru) {
    if (terkini) db.prepare('DELETE FROM cucian WHERE id = ?').run(terkini.id);
  } else if (!terkini || baru > lama) {
    return catatCucian(tempatId, baru);
  } else if (db.prepare('SELECT 1 FROM cucian WHERE tempat_id = ? AND tarikh = ?').get(tempatId, baru)) {
    db.prepare('DELETE FROM cucian WHERE id = ?').run(terkini.id);
  } else {
    db.prepare('UPDATE cucian SET tarikh = ? WHERE id = ?').run(baru, terkini.id);
  }
  selarasCuci(tempatId);
}
function selarasCuci(tempatId) {
  const akhir = db.prepare('SELECT MAX(tarikh) m FROM cucian WHERE tempat_id = ?').get(tempatId).m;
  db.prepare(`UPDATE tempat SET terakhir_cuci = ?, dikemas = datetime('now') WHERE id = ?`).run(akhir, tempatId);
}

function parseTempat(b) {
  const d = {
    jenis: JENIS.includes(b.jenis) ? b.jenis : null,
    nama: txt(b.nama, 200),
    alamat: txt(b.alamat, 500),
    telefon: txt(b.telefon, 40),
    status: STATUS.includes(b.status) ? b.status : 'Belum dihubungi',
    produk: arr(b.produk).filter((p) => p in TUJUAN).join(',') || null,
    kitaran_cuci_bulan: intOrNull(b.kitaran_cuci_bulan),
    terakhir_cuci: dateOrNull(b.terakhir_cuci),
    follow_up: dateOrNull(b.follow_up),
    catatan: txt(b.catatan, 2000),
    keluasan_kp: kpOrNull(b.keluasan_kp),
  };
  if (d.kitaran_cuci_bulan !== null && (d.kitaran_cuci_bulan < 1 || d.kitaran_cuci_bulan > 60)) d.kitaran_cuci_bulan = null;
  const L = sahLokasi(b.negeri, b.daerah);
  d.negeri = L.negeri; d.daerah = L.daerah;
  let error = L.error;
  if (!d.nama) error = 'Nama diperlukan.';
  else if (!d.jenis) error = 'Jenis tidak sah.';
  return { d, error };
}

app.get('/tempat/baru', (req, res) => res.send(V.tempatFormPage()));

app.post('/tempat', (req, res) => {
  const { d, error } = parseTempat(req.body);
  if (error) return res.status(400).send(V.tempatFormPage(req.body, error));
  const r = db
    .prepare(`INSERT INTO tempat (jenis,nama,negeri,daerah,alamat,telefon,status,produk,kitaran_cuci_bulan,terakhir_cuci,follow_up,catatan,keluasan_kp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(d.jenis, d.nama, d.negeri, d.daerah, d.alamat, d.telefon, d.status, d.produk, d.kitaran_cuci_bulan, d.terakhir_cuci, d.follow_up, d.catatan, d.keluasan_kp);
  if (d.terakhir_cuci) catatCucian(Number(r.lastInsertRowid), d.terakhir_cuci);
  res.redirect(303, `/tempat/${r.lastInsertRowid}`);
});

function loadTempat(req, res) {
  const id = posId(req.params.id);
  const t = id && db.prepare('SELECT * FROM tempat WHERE id = ?').get(id);
  if (!t) { res.status(404).send(V.messagePage('Tidak dijumpai', 'Rekod tidak wujud.')); return null; }
  return t;
}

function loadDetail(id) {
  const t = db.prepare('SELECT * FROM tempat WHERE id = ?').get(id);
  if (!t) return null;
  const pics = db.prepare('SELECT * FROM pic WHERE tempat_id = ? ORDER BY id').all(t.id);
  const lawatan = db.prepare('SELECT * FROM lawatan WHERE tempat_id = ? ORDER BY tarikh DESC, id DESC').all(t.id).map((l) => ({
    ...l,
    ukuran: db.prepare('SELECT * FROM ukuran WHERE lawatan_id = ? ORDER BY id').all(l.id),
    foto: db.prepare('SELECT * FROM foto WHERE lawatan_id = ? ORDER BY id').all(l.id),
  }));
  const logs = db.prepare('SELECT * FROM log WHERE tempat_id = ? ORDER BY waktu DESC, id DESC LIMIT 50').all(t.id);
  const dokumen = db.prepare('SELECT * FROM dokumen WHERE tempat_id = ? ORDER BY tarikh DESC, id DESC').all(t.id);
  const barang = db.prepare("SELECT * FROM barang WHERE tempat_id = ? ORDER BY penggunaan = 'Tidak digunakan lagi', jenis, id").all(t.id);
  const cucian = db.prepare('SELECT * FROM cucian WHERE tempat_id = ? ORDER BY tarikh DESC, id DESC').all(t.id);
  const skor = kiraSkor(t.id).get(t.id);
  return { t, pics, lawatan, logs, dokumen, barang, cucian, skor, tarikh: today(), selang: selangFilter() };
}

app.get('/tempat/:id', (req, res) => {
  const id = posId(req.params.id);
  const d = id && loadDetail(id);
  if (!d) return res.status(404).send(V.messagePage('Tidak dijumpai', 'Rekod tidak wujud.'));
  res.send(V.detailPage(d));
});

app.get('/tempat/:id/edit', (req, res) => {
  const t = loadTempat(req, res);
  if (t) res.send(V.tempatFormPage(t, '', t.id));
});

app.post('/tempat/:id', (req, res) => {
  const t = loadTempat(req, res);
  if (!t) return;
  const { d, error } = parseTempat(req.body);
  if (error) return res.status(400).send(V.tempatFormPage({ ...req.body, id: t.id }, error, t.id));
  tx(() => {
    db.prepare(`UPDATE tempat SET jenis=?,nama=?,negeri=?,daerah=?,alamat=?,telefon=?,status=?,produk=?,kitaran_cuci_bulan=?,terakhir_cuci=?,follow_up=?,catatan=?,keluasan_kp=?,dikemas=datetime('now') WHERE id=?`)
      .run(d.jenis, d.nama, d.negeri, d.daerah, d.alamat, d.telefon, d.status, d.produk, d.kitaran_cuci_bulan, d.terakhir_cuci, d.follow_up, d.catatan, d.keluasan_kp, t.id);
    if (d.terakhir_cuci !== t.terakhir_cuci) betulkanCuciBorang(t.id, t.terakhir_cuci, d.terakhir_cuci);
  });
  res.redirect(303, `/tempat/${t.id}`);
});

app.post('/tempat/:id/padam', (req, res) => {
  const t = loadTempat(req, res);
  if (!t) return;
  const files = [
    ...db.prepare('SELECT f.fail FROM foto f JOIN lawatan l ON l.id = f.lawatan_id WHERE l.tempat_id = ?').all(t.id).map((r) => r.fail),
    ...db.prepare('SELECT fail FROM dokumen WHERE tempat_id = ?').all(t.id).map((r) => r.fail),
  ];
  db.prepare('DELETE FROM tempat WHERE id = ?').run(t.id);
  removeFiles(files);
  res.redirect(303, '/tempat');
});

// ---------- PIC ----------
function parsePic(b) {
  const d = {
    nama: txt(b.nama, 100), jawatan: txt(b.jawatan, 100), telefon: txt(b.telefon, 40),
    status: STATUS_PIC.includes(b.status) ? b.status : 'Aktif',
  };
  return { d, error: !d.nama && !d.telefon ? 'Isi sekurang-kurangnya nama atau telefon.' : '' };
}
function loadPic(req, res) {
  const id = posId(req.params.id);
  const p = id && db.prepare('SELECT * FROM pic WHERE id = ?').get(id);
  if (!p) { res.status(404).send(V.messagePage('Tidak dijumpai', 'PIC tidak wujud.')); return null; }
  return { p, t: db.prepare('SELECT * FROM tempat WHERE id = ?').get(p.tempat_id) };
}

app.get('/tempat/:id/pic/baru', (req, res) => {
  const t = loadTempat(req, res);
  if (t) res.send(V.picFormPage(t, { status: 'Aktif' }));
});
app.post('/tempat/:id/pic', (req, res) => {
  const t = loadTempat(req, res);
  if (!t) return;
  const { d, error } = parsePic(req.body);
  if (error) return res.status(400).send(V.picFormPage(t, req.body, error));
  db.prepare('INSERT INTO pic (tempat_id,nama,jawatan,telefon,status) VALUES (?,?,?,?,?)').run(t.id, d.nama, d.jawatan, d.telefon, d.status);
  res.redirect(303, `/tempat/${t.id}`);
});
app.get('/pic/:id/edit', (req, res) => {
  const r = loadPic(req, res);
  if (r) res.send(V.picFormPage(r.t, r.p));
});
app.post('/pic/:id', (req, res) => {
  const r = loadPic(req, res);
  if (!r) return;
  const { d, error } = parsePic(req.body);
  if (error) return res.status(400).send(V.picFormPage(r.t, { ...req.body, id: r.p.id }, error));
  tx(() => {
    db.prepare('UPDATE pic SET nama=?,jawatan=?,telefon=?,status=? WHERE id=?').run(d.nama, d.jawatan, d.telefon, d.status, r.p.id);
    if (d.status !== r.p.status) {
      db.prepare('INSERT INTO log (tempat_id,pic_id,waktu,saluran,ringkasan) VALUES (?,?,?,?,?)')
        .run(r.t.id, r.p.id, nowKL(), 'Lain-lain', `Status PIC ${d.nama || r.p.nama || ''}: ${r.p.status} → ${d.status}`);
    }
  });
  res.redirect(303, `/tempat/${r.t.id}`);
});
app.post('/pic/:id/padam', (req, res) => {
  const r = loadPic(req, res);
  if (!r) return;
  db.prepare('DELETE FROM pic WHERE id = ?').run(r.p.id);
  res.redirect(303, `/tempat/${r.t.id}`);
});

// ---------- Log hubungan ----------
app.get('/tempat/:id/log/baru', (req, res) => {
  const t = loadTempat(req, res);
  if (t) res.send(V.logFormPage(t, today()));
});
app.post('/tempat/:id/log', (req, res) => {
  const t = loadTempat(req, res);
  if (!t) return;
  const ringkasan = txt(req.body.ringkasan, 1000);
  if (!ringkasan) return res.status(400).send(V.logFormPage(t, today(), 'Ringkasan diperlukan.'));
  const saluran = SALURAN.includes(req.body.saluran) ? req.body.saluran : 'Lain-lain';
  const tujuan = Object.values(TUJUAN).includes(req.body.tujuan) ? req.body.tujuan : null;
  const status = STATUS.includes(req.body.status) ? req.body.status : t.status;
  const followUp = dateOrNull(req.body.follow_up);
  tx(() => {
    db.prepare('INSERT INTO log (tempat_id,waktu,saluran,tujuan,ringkasan) VALUES (?,?,?,?,?)').run(t.id, nowKL(), saluran, tujuan, ringkasan);
    db.prepare(`UPDATE tempat SET status=?, follow_up=?, dikemas=datetime('now') WHERE id=?`).run(status, followUp, t.id);
  });
  res.redirect(303, `/tempat/${t.id}`);
});

// ---------- WhatsApp (wa.me, hantar manual oleh pengguna) ----------
app.post('/tempat/:id/wa', (req, res) => {
  const t = loadTempat(req, res);
  if (!t) return;
  const kunci = String(req.body.tujuan || '');
  if (!WA_TUJUAN.includes(kunci)) return res.status(400).send(V.messagePage('Tidak sah', 'Tujuan tidak sah.'));

  let pic = null;
  const picId = posId(req.body.pic);
  if (picId) pic = db.prepare('SELECT * FROM pic WHERE id = ? AND tempat_id = ?').get(picId, t.id);
  if (picId && !pic) return res.status(404).send(V.messagePage('Tidak dijumpai', 'PIC tidak sepadan dengan rekod ini.'));
  if (pic && pic.status !== 'Aktif') return res.status(403).send(V.messagePage('Disekat', `PIC ini berstatus "${pic.status}". WhatsApp tidak dibenarkan.`));

  const num = waNumber(pic ? pic.telefon : t.telefon);
  if (!num) return res.status(400).send(V.messagePage('Tiada nombor', 'Nombor telefon tiada atau bukan telefon bimbit (01x).'));

  const mesej = waMesej(kunci, t.nama, pic?.nama || null);
  tx(() => {
    db.prepare('INSERT INTO log (tempat_id,pic_id,waktu,saluran,tujuan,ringkasan) VALUES (?,?,?,?,?,?)')
      .run(t.id, pic?.id ?? null, nowKL(), 'WhatsApp', TUJUAN[kunci], `WhatsApp dibuka kepada ${pic?.nama || 'nombor ' + t.jenis.toLowerCase()} (belum tentu dihantar)`);
    if (t.status === 'Belum dihubungi') db.prepare(`UPDATE tempat SET status='Dah dihubungi', dikemas=datetime('now') WHERE id=?`).run(t.id);
  });
  res.redirect(303, `https://wa.me/${num}?text=${encodeURIComponent(mesej)}`);
});

// ---------- Lawatan (ukuran dalam kaki) ----------
app.get('/tempat/:id/lawatan/baru', (req, res) => {
  const t = loadTempat(req, res);
  if (t) res.send(V.lawatanFormPage(t, today()));
});
app.post('/tempat/:id/lawatan', upload.array('foto', 10), (req, res) => {
  const files = (req.files || []).map((f) => f.filename);
  const t = loadTempat(req, res);
  if (!t) { removeFiles(files); return; }
  const b = req.body || {};
  const tarikh = dateOrNull(b.tarikh) || today();
  const keadaan = KEADAAN.includes(b.keadaan) ? b.keadaan : null;
  const tahun = intOrNull(b.tahun_pasang);
  const labels = arr(b.u_label), pj = arr(b.u_panjang), lb = arr(b.u_lebar);
  const ukuran = [];
  for (let i = 0; i < pj.length; i++) {
    const p = Number.parseFloat(pj[i]), l = Number.parseFloat(lb[i]);
    if (Number.isFinite(p) && Number.isFinite(l) && p > 0 && l > 0 && p < 3000 && l < 3000) ukuran.push([txt(labels[i], 100), p, l]);
  }
  try {
    tx(() => {
      const r = db.prepare('INSERT INTO lawatan (tempat_id,tarikh,keadaan,jenis_karpet,tahun_pasang,nota) VALUES (?,?,?,?,?,?)')
        .run(t.id, tarikh, keadaan, txt(b.jenis_karpet, 100), tahun && tahun >= 1950 && tahun <= 2100 ? tahun : null, txt(b.nota, 2000));
      const lid = r.lastInsertRowid;
      for (const [label, p, l] of ukuran) db.prepare('INSERT INTO ukuran (lawatan_id,label,panjang,lebar) VALUES (?,?,?,?)').run(lid, label, p, l);
      for (const f of files) db.prepare('INSERT INTO foto (lawatan_id,fail) VALUES (?,?)').run(lid, f);
      if (['Belum dihubungi', 'Dah dihubungi'].includes(t.status)) db.prepare(`UPDATE tempat SET status='Dilawat', dikemas=datetime('now') WHERE id=?`).run(t.id);
    });
  } catch (e) {
    removeFiles(files);
    throw e;
  }
  res.redirect(303, `/tempat/${t.id}`);
});

app.post('/lawatan/:id/padam', (req, res) => {
  const id = posId(req.params.id);
  const l = id && db.prepare('SELECT tempat_id FROM lawatan WHERE id = ?').get(id);
  if (!l) return res.status(404).send(V.messagePage('Tidak dijumpai', 'Lawatan tidak wujud.'));
  const files = db.prepare('SELECT fail FROM foto WHERE lawatan_id = ?').all(id).map((r) => r.fail);
  db.prepare('DELETE FROM lawatan WHERE id = ?').run(id);
  removeFiles(files);
  res.redirect(303, `/tempat/${l.tempat_id}`);
});

// ---------- Dokumen dihantar (quotation / invois / laporan kerja dibuat di luar app) ----------
const ORDER = Object.fromEntries(STATUS.map((s, i) => [s, i]));
export function cadangStatus(jenis, semasa) {
  const target = jenis === 'Quotation' ? 'Quotation' : 'Pelanggan';
  if (semasa === 'Pelanggan') return '';
  if (jenis === 'Quotation' && ORDER[semasa] >= ORDER.Quotation) return '';
  return target === semasa ? '' : target;
}

function parseDok(b) {
  const d = {
    jenis: JENIS_DOK.includes(b.jenis) ? b.jenis : null,
    nombor: txt(b.nombor, 60),
    tarikh: dateOrNull(b.tarikh),
    amaun_sen: senOrNull(b.amaun),
    catatan: txt(b.catatan, 1000),
    perkhidmatan: Object.values(TUJUAN).includes(b.perkhidmatan) ? b.perkhidmatan : null,
  };
  let error = '';
  if (!d.jenis) error = 'Pilih jenis dokumen.';
  else if (!d.nombor) error = 'Nombor dokumen diperlukan.';
  else if (!d.tarikh) error = 'Tarikh dihantar diperlukan.';
  else if (txt(b.amaun) && d.amaun_sen === null) error = 'Amaun tidak sah (cth: 1330.00).';
  return { d, error };
}
function loadDok(req, res) {
  const id = posId(req.params.id);
  const k = id && db.prepare('SELECT * FROM dokumen WHERE id = ?').get(id);
  if (!k) { res.status(404).send(V.messagePage('Tidak dijumpai', 'Dokumen tidak wujud.')); return null; }
  return { k, t: db.prepare('SELECT * FROM tempat WHERE id = ?').get(k.tempat_id) };
}

app.get('/tempat/:id/dokumen/baru', (req, res) => {
  const t = loadTempat(req, res);
  if (!t) return;
  const jenis = JENIS_DOK.includes(req.query.jenis) ? req.query.jenis : 'Quotation';
  res.send(V.dokumenFormPage(t, { jenis, tarikh: today(), status: cadangStatus(jenis, t.status) }, '', cadangStatus));
});

app.post('/tempat/:id/dokumen', uploadDok.single('fail'), (req, res) => {
  const file = req.file;
  const t = loadTempat(req, res);
  if (!t) { removeFiles([file?.filename]); return; }
  const { d, error } = parseDok(req.body);
  const err = error || (validDokFile(file) ? '' : 'Fail bukan PDF yang sah.');
  if (err) { removeFiles([file?.filename]); return res.status(400).send(V.dokumenFormPage(t, req.body, err, cadangStatus)); }
  const status = STATUS.includes(req.body.status) ? req.body.status : null;
  try {
    tx(() => {
      db.prepare('INSERT INTO dokumen (tempat_id,jenis,nombor,tarikh,amaun_sen,fail,fail_nama,catatan,perkhidmatan) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(t.id, d.jenis, d.nombor, d.tarikh, d.amaun_sen, file?.filename ?? null, file ? txt(file.originalname, 150) : null, d.catatan, d.perkhidmatan);
      const ring = `${d.jenis} ${d.nombor}${d.perkhidmatan ? ' (' + d.perkhidmatan + ')' : ''} dihantar (${d.tarikh})${d.amaun_sen !== null ? ' · RM ' + fmtRM(d.amaun_sen) : ''}${d.catatan ? ' · ' + d.catatan : ''}`;
      db.prepare('INSERT INTO log (tempat_id,waktu,saluran,ringkasan) VALUES (?,?,?,?)').run(t.id, nowKL(), 'Dokumen', ring);
      if (status && status !== t.status) db.prepare(`UPDATE tempat SET status=?, dikemas=datetime('now') WHERE id=?`).run(status, t.id);
      if (req.body.kemas_cuci === '1' && d.jenis !== 'Quotation') catatCucian(t.id, d.tarikh, `${d.jenis} ${d.nombor}`);
    });
  } catch (e) {
    removeFiles([file?.filename]);
    throw e;
  }
  res.redirect(303, `/tempat/${t.id}`);
});

app.get('/dokumen/:id/edit', (req, res) => {
  const r = loadDok(req, res);
  if (r) res.send(V.dokumenFormPage(r.t, { ...r.k, amaun: r.k.amaun_sen !== null ? (r.k.amaun_sen / 100).toFixed(2) : '' }, '', cadangStatus));
});

app.post('/dokumen/:id', uploadDok.single('fail'), (req, res) => {
  const file = req.file;
  const r = loadDok(req, res);
  if (!r) { removeFiles([file?.filename]); return; }
  const { d, error } = parseDok(req.body);
  const err = error || (validDokFile(file) ? '' : 'Fail bukan PDF yang sah.');
  if (err) { removeFiles([file?.filename]); return res.status(400).send(V.dokumenFormPage(r.t, { ...req.body, id: r.k.id, fail: r.k.fail, fail_nama: r.k.fail_nama }, err, cadangStatus)); }
  const buang = req.body.buang_fail === '1';
  const ganti = !!file;
  const failBaru = ganti ? file.filename : buang ? null : r.k.fail;
  const namaBaru = ganti ? txt(file.originalname, 150) : buang ? null : r.k.fail_nama;
  tx(() => {
    db.prepare('UPDATE dokumen SET jenis=?,nombor=?,tarikh=?,amaun_sen=?,fail=?,fail_nama=?,catatan=?,perkhidmatan=? WHERE id=?')
      .run(d.jenis, d.nombor, d.tarikh, d.amaun_sen, failBaru, namaBaru, d.catatan, d.perkhidmatan, r.k.id);
    db.prepare('INSERT INTO log (tempat_id,waktu,saluran,ringkasan) VALUES (?,?,?,?)')
      .run(r.t.id, nowKL(), 'Dokumen', `${d.jenis} ${d.nombor} dikemas kini${ganti ? ' (lampiran diganti)' : buang ? ' (lampiran dibuang)' : ''}`);
    const status = STATUS.includes(req.body.status) ? req.body.status : null;
    if (status && status !== r.t.status) db.prepare(`UPDATE tempat SET status=?, dikemas=datetime('now') WHERE id=?`).run(status, r.t.id);
  });
  if ((ganti || buang) && r.k.fail) removeFiles([r.k.fail]);
  res.redirect(303, `/tempat/${r.t.id}`);
});

app.post('/dokumen/:id/padam', (req, res) => {
  const r = loadDok(req, res);
  if (!r) return;
  tx(() => {
    db.prepare('DELETE FROM dokumen WHERE id = ?').run(r.k.id);
    db.prepare('INSERT INTO log (tempat_id,waktu,saluran,ringkasan) VALUES (?,?,?,?)').run(r.t.id, nowKL(), 'Dokumen', `Rekod ${r.k.jenis} ${r.k.nombor} dipadam`);
  });
  removeFiles([r.k.fail]);
  res.redirect(303, `/tempat/${r.t.id}`);
});

app.get('/dokumen/:id/fail', (req, res) => {
  const r = loadDok(req, res);
  if (!r) return;
  if (!r.k.fail) return res.status(404).send(V.messagePage('Tiada lampiran', 'Dokumen ini tiada fail dilampirkan.'));
  const ext = r.k.fail.split('.').pop();
  const nama = (r.k.fail_nama || `${r.k.nombor}.${ext}`).replace(/[^\w.\- ]+/g, '_');
  res.set({
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${nama}"; filename*=UTF-8''${encodeURIComponent(r.k.fail_nama || nama)}`,
    'Cache-Control': 'private, max-age=3600',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; plugin-types application/pdf",
  });
  res.sendFile(path.join(UPLOAD_DIR, r.k.fail), (e) => e && !res.headersSent && res.sendStatus(404));
});


// ---------- Sejarah cucian ----------
app.post('/tempat/:id/cucian', (req, res) => {
  const t = loadTempat(req, res);
  if (!t) return;
  const tarikh = dateOrNull(req.body.tarikh);
  if (!tarikh || tarikh > today()) return res.status(400).send(V.messagePage('Tarikh tidak sah', 'Masukkan tarikh cucian yang sudah berlaku.', `/tempat/${t.id}`));
  tx(() => catatCucian(t.id, tarikh, txt(req.body.catatan, 300)));
  res.redirect(303, `/tempat/${t.id}#cucian`);
});
app.post('/cucian/:id/padam', (req, res) => {
  const id = posId(req.params.id);
  const c = id && db.prepare('SELECT * FROM cucian WHERE id = ?').get(id);
  if (!c) return res.status(404).send(V.messagePage('Tidak dijumpai', 'Rekod cucian tidak wujud.'));
  tx(() => {
    db.prepare('DELETE FROM cucian WHERE id = ?').run(c.id);
    selarasCuci(c.tempat_id);
  });
  res.redirect(303, `/tempat/${c.tempat_id}#cucian`);
});

// ---------- Barang dibekalkan (karpet & vacuum) ----------
function parseBarang(b) {
  const num = (v) => { const n = Number.parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
  const d = {
    jenis: JENIS_BARANG.includes(b.jenis) ? b.jenis : null,
    butiran: txt(b.butiran, 150),
    unit: intOrNull(b.unit),
    keluasan_kp: num(b.keluasan_kp),
    tarikh: dateOrNull(b.tarikh),
    waranti_hingga: dateOrNull(b.waranti_hingga),
    penggunaan: PENGGUNAAN.includes(b.penggunaan) ? b.penggunaan : 'Digunakan',
    filter_terakhir: dateOrNull(b.filter_terakhir),
    selang_filter_bulan: intOrNull(b.selang_filter_bulan),
    catatan: txt(b.catatan, 1000),
  };
  if (d.unit !== null && (d.unit < 1 || d.unit > 99)) d.unit = null;
  if (d.selang_filter_bulan !== null && (d.selang_filter_bulan < 1 || d.selang_filter_bulan > 36)) d.selang_filter_bulan = null;
  if (d.jenis === 'Karpet') { d.unit = null; d.filter_terakhir = null; d.selang_filter_bulan = null; }
  if (d.jenis === 'Vacuum') d.keluasan_kp = null;
  return { d, error: d.jenis ? '' : 'Pilih jenis barang.' };
}
const BARANG_COLS = ['jenis', 'butiran', 'unit', 'keluasan_kp', 'tarikh', 'waranti_hingga', 'penggunaan', 'filter_terakhir', 'selang_filter_bulan', 'catatan'];
function loadBarang(req, res) {
  const id = posId(req.params.id);
  const k = id && db.prepare('SELECT * FROM barang WHERE id = ?').get(id);
  if (!k) { res.status(404).send(V.messagePage('Tidak dijumpai', 'Barang tidak wujud.')); return null; }
  return { k, t: db.prepare('SELECT * FROM tempat WHERE id = ?').get(k.tempat_id) };
}
app.get('/tempat/:id/barang/baru', (req, res) => {
  const t = loadTempat(req, res);
  if (t) res.send(V.barangFormPage(t, { jenis: JENIS_BARANG.includes(req.query.jenis) ? req.query.jenis : 'Vacuum', penggunaan: 'Digunakan' }, '', selangFilter()));
});
app.post('/tempat/:id/barang', (req, res) => {
  const t = loadTempat(req, res);
  if (!t) return;
  const { d, error } = parseBarang(req.body);
  if (error) return res.status(400).send(V.barangFormPage(t, req.body, error, selangFilter()));
  db.prepare(`INSERT INTO barang (tempat_id,${BARANG_COLS.join(',')}) VALUES (?${',?'.repeat(BARANG_COLS.length)})`).run(t.id, ...BARANG_COLS.map((k) => d[k]));
  res.redirect(303, `/tempat/${t.id}`);
});
app.get('/barang/:id/edit', (req, res) => {
  const r = loadBarang(req, res);
  if (r) res.send(V.barangFormPage(r.t, r.k, '', selangFilter()));
});
app.post('/barang/:id', (req, res) => {
  const r = loadBarang(req, res);
  if (!r) return;
  const { d, error } = parseBarang(req.body);
  if (error) return res.status(400).send(V.barangFormPage(r.t, { ...req.body, id: r.k.id }, error, selangFilter()));
  db.prepare(`UPDATE barang SET ${BARANG_COLS.map((k) => k + '=?').join(',')} WHERE id=?`).run(...BARANG_COLS.map((k) => d[k]), r.k.id);
  res.redirect(303, `/tempat/${r.t.id}`);
});
app.post('/barang/:id/filter', (req, res) => {
  const r = loadBarang(req, res);
  if (!r) return;
  if (r.k.jenis !== 'Vacuum') return res.status(400).send(V.messagePage('Tidak sah', 'Hanya untuk vacuum.'));
  const tarikh = dateOrNull(req.body.tarikh) || today();
  tx(() => {
    db.prepare(`UPDATE barang SET filter_terakhir=?, penggunaan='Digunakan' WHERE id=?`).run(tarikh, r.k.id);
    db.prepare('INSERT INTO log (tempat_id,waktu,saluran,tujuan,ringkasan) VALUES (?,?,?,?,?)')
      .run(r.t.id, nowKL(), 'Lain-lain', TUJUAN.vacuum, `Filter beg ${r.k.butiran || 'vacuum'} dibeli (${tarikh})`);
  });
  res.redirect(303, `/tempat/${r.t.id}`);
});
app.post('/barang/:id/padam', (req, res) => {
  const r = loadBarang(req, res);
  if (!r) return;
  db.prepare('DELETE FROM barang WHERE id = ?').run(r.k.id);
  res.redirect(303, `/tempat/${r.t.id}`);
});

// ---------- Data: import / eksport / sandaran ----------
app.get('/data', (req, res) => res.send(V.dataPage()));
app.get('/import', (req, res) => res.redirect(303, '/data'));

app.post('/import', csvUpload.single('fail'), (req, res) => {
  if (!req.file) return res.status(400).send(V.messagePage('Tiada fail', 'Pilih fail CSV.'));
  const rows = parseCsv(req.file.buffer.toString('utf8'));
  if (rows.length < 2) return res.status(400).send(V.messagePage('Fail kosong', 'Perlu tajuk lajur dan sekurang-kurangnya satu baris.'));
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  const PIC_N = ['', ...Array.from({ length: 9 }, (_, i) => String(i + 2))]; // pic, pic2..pic10
  const names = ['nama', 'jenis', 'negeri', 'daerah', 'alamat', 'telefon', 'status', 'catatan', 'kitaran_cuci_bulan', 'terakhir_cuci', 'follow_up'];
  for (const n of PIC_N) names.push('pic' + n, 'jawatan_pic' + n, 'telefon_pic' + n);
  names.push('vacuum_model', 'vacuum_unit', 'vacuum_tarikh_beli', 'vacuum_penggunaan', 'vacuum_filter_terakhir', 'vacuum_catatan', 'karpet_jenis', 'karpet_kp', 'karpet_tarikh_pasang', 'karpet_waranti_hingga');
  const c = Object.fromEntries(names.map((n) => [n, col(n)]));
  if (c.nama < 0) return res.status(400).send(V.messagePage('Lajur "nama" tiada', 'Baris pertama mesti ada lajur bernama nama.'));
  const get = (r, k, max) => (c[k] >= 0 ? txt(r[c[k]], max) : null);
  // status: nilai asal atau nama paparan (Tetapan), tidak peka huruf
  const statusMap = new Map();
  for (const s of STATUS) { statusMap.set(s.toLowerCase(), s); statusMap.set(labelStatus(s).toLowerCase(), s); }

  const tambahKeSedia = req.body.kemas === '1';
  const out = { tambah: 0, langkau: 0, dikemas: 0, amaran: [] };
  const exists = db.prepare('SELECT id FROM tempat WHERE lower(nama) = lower(?) AND lower(coalesce(daerah, \'\')) = lower(?)');
  const byName = db.prepare('SELECT id FROM tempat WHERE lower(nama) = lower(?)');
  const picTels = db.prepare('SELECT nama, telefon FROM pic WHERE tempat_id = ?');
  const digits = (v) => String(v || '').replace(/\D/g, '').replace(/^60/, '0');
  const insBarang = db.prepare('INSERT INTO barang (tempat_id,jenis,butiran,unit,keluasan_kp,tarikh,waranti_hingga,penggunaan,filter_terakhir,catatan) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const adaBarang = db.prepare("SELECT 1 FROM barang WHERE tempat_id = ? AND jenis = ? AND lower(coalesce(butiran, '')) = lower(?)");
  const addExtras = (id, r) => {
    const sedia = picTels.all(id);
    const ada = new Set(sedia.map((p) => digits(p.telefon)).filter(Boolean));
    const adaNama = new Set(sedia.filter((p) => !digits(p.telefon) && p.nama).map((p) => p.nama.toLowerCase()));
    let n = 0;
    for (const k of PIC_N) {
      const pn = get(r, 'pic' + k, 100), pt = get(r, 'telefon_pic' + k, 40);
      if (!pn && !pt) continue;
      if (pt ? ada.has(digits(pt)) : adaNama.has(pn.toLowerCase())) continue;
      insPic.run(id, pn, get(r, 'jawatan_pic' + k, 100), pt);
      if (pt) ada.add(digits(pt)); else adaNama.add(pn.toLowerCase());
      n++;
    }
    const vm = get(r, 'vacuum_model', 150), vu = intOrNull(get(r, 'vacuum_unit'));
    if ((vm || vu) && !adaBarang.get(id, 'Vacuum', vm || '')) {
      const pg = get(r, 'vacuum_penggunaan');
      insBarang.run(id, 'Vacuum', vm, vu && vu > 0 && vu < 100 ? vu : null, null, dateOrNull(get(r, 'vacuum_tarikh_beli')), null,
        PENGGUNAAN.includes(pg) ? pg : 'Tidak pasti', dateOrNull(get(r, 'vacuum_filter_terakhir')), get(r, 'vacuum_catatan', 1000));
      n++;
    }
    const kj = get(r, 'karpet_jenis', 150), kt = dateOrNull(get(r, 'karpet_tarikh_pasang'));
    if ((kj || kt) && !adaBarang.get(id, 'Karpet', kj || '')) {
      const kp = Number.parseFloat(String(get(r, 'karpet_kp') || '').replace(/,/g, ''));
      insBarang.run(id, 'Karpet', kj, null, Number.isFinite(kp) && kp > 0 ? kp : null, kt, dateOrNull(get(r, 'karpet_waranti_hingga')), 'Digunakan', null, null);
      n++;
    }
    return n;
  };
  const ins = db.prepare('INSERT INTO tempat (jenis,nama,negeri,daerah,alamat,telefon,status,catatan,kitaran_cuci_bulan,terakhir_cuci,follow_up,keluasan_kp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const isiKeluasan = db.prepare("UPDATE tempat SET keluasan_kp = ?, dikemas = datetime('now') WHERE id = ? AND keluasan_kp IS NULL");
  // keluasan_kp: lajur sendiri, atau dari catatan "Keluasan (...): 14,320 kp"
  const kpBaris = (r) => kpOrNull(get(r, 'keluasan_kp')) || keluasanDariTeks(get(r, 'catatan', 2000));
  const isiLokasi = db.prepare("UPDATE tempat SET negeri = ?, daerah = ?, dikemas = datetime('now') WHERE id = ?");
  // Isi alamat jika kosong, atau ganti jika alamat baru mengandungi alamat lama (cth "Banting" -> alamat penuh JAIS)
  const isiAlamat = db.prepare(`UPDATE tempat SET alamat = ?1, dikemas = datetime('now') WHERE id = ?2
    AND (coalesce(trim(alamat), '') = '' OR (length(?1) > length(alamat) AND instr(lower(?1), lower(trim(alamat))) > 0))`);
  const isiTelefon = db.prepare("UPDATE tempat SET telefon = ?, dikemas = datetime('now') WHERE id = ? AND coalesce(trim(telefon), '') = ''");
  const isiSusulan = db.prepare("UPDATE tempat SET follow_up = ?, dikemas = datetime('now') WHERE id = ? AND follow_up IS NULL");
  const insPic = db.prepare('INSERT INTO pic (tempat_id,nama,jawatan,telefon) VALUES (?,?,?,?)');
  tx(() => {
    rows.slice(1).forEach((r, i) => {
      const nama = get(r, 'nama', 200);
      if (!nama) { out.langkau++; out.amaran.push(`Baris ${i + 2}: tiada nama`); return; }
      const dRaw = get(r, 'daerah', 100);
      const L = sahLokasi(get(r, 'negeri', 60), dRaw);
      if (L.error) out.amaran.push(`Baris ${i + 2}: ${L.error}${dRaw && !L.daerah ? ' Dimasukkan ke alamat.' : ''}`);
      const bandar = dRaw && !sahLokasi(null, dRaw).negeri ? dRaw : null; // nama bandar, bukan daerah/negeri
      const daerah = L.daerah;
      if (tambahKeSedia) {
        const m = byName.all(nama);
        if (m.length > 1) { out.langkau++; out.amaran.push(`Baris ${i + 2}: "${nama}" ada ${m.length} rekod sama nama, dilangkau`); return; }
        if (m.length === 1) {
          const fu = dateOrNull(get(r, 'follow_up'));
          if (fu) isiSusulan.run(fu, m[0].id);
          const alamatBaru = [get(r, 'alamat'), bandar].filter(Boolean).join(', ') || null;
          if (alamatBaru) isiAlamat.run(alamatBaru, m[0].id);
          const telBaru = get(r, 'telefon', 40);
          if (telBaru) isiTelefon.run(telBaru, m[0].id);
          const t = db.prepare('SELECT negeri, daerah FROM tempat WHERE id = ?').get(m[0].id);
          if (L.negeri && !t.negeri) isiLokasi.run(L.negeri, L.daerah, m[0].id);
          else if (L.daerah && t.negeri === L.negeri && !t.daerah) isiLokasi.run(t.negeri, L.daerah, m[0].id);
          const kpBaru = kpBaris(r);
          if (kpBaru) isiKeluasan.run(kpBaru, m[0].id);
          const cuciBaru = dateOrNull(get(r, 'terakhir_cuci'));
          if (cuciBaru) catatCucian(m[0].id, cuciBaru);
          addExtras(m[0].id, r); out.dikemas++; return;
        }
      } else if (exists.get(nama, daerah || '')) { out.langkau++; return; }
      const jenisRaw = (get(r, 'jenis') || nama).toLowerCase();
      const jenis = /surau/.test(jenisRaw) ? 'Surau' : 'Masjid';
      const stRaw = get(r, 'status');
      const status = stRaw ? statusMap.get(stRaw.toLowerCase()) : 'Belum dihubungi';
      if (!status) out.amaran.push(`Baris ${i + 2}: status "${stRaw}" tidak dikenali, guna Belum dihubungi`);
      let kitaran = intOrNull(get(r, 'kitaran_cuci_bulan'));
      if (kitaran !== null && (kitaran < 1 || kitaran > 60)) kitaran = null;
      const alamat = [get(r, 'alamat'), bandar].filter(Boolean).join(', ') || null;
      const id = ins.run(jenis, nama, L.negeri, daerah, alamat, get(r, 'telefon', 40), status || 'Belum dihubungi', get(r, 'catatan', 2000), kitaran, dateOrNull(get(r, 'terakhir_cuci')), dateOrNull(get(r, 'follow_up')), kpBaris(r)).lastInsertRowid;
      const cuci = dateOrNull(get(r, 'terakhir_cuci'));
      if (cuci) catatCucian(Number(id), cuci);
      addExtras(id, r);
      out.tambah++;
    });
  });
  res.send(V.dataPage(out));
});

app.get('/eksport.csv', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT keadaan FROM lawatan WHERE tempat_id=t.id ORDER BY tarikh DESC,id DESC LIMIT 1) keadaan,
        (SELECT group_concat(coalesce(nama,'') || ' ' || coalesce(telefon,'') || CASE WHEN status != 'Aktif' THEN ' [' || status || ']' ELSE '' END, ' | ') FROM pic WHERE tempat_id=t.id) pic,
        (SELECT count(*) FROM dokumen WHERE tempat_id=t.id) bil_dokumen,
        (SELECT count(*) FROM cucian WHERE tempat_id=t.id) bil_cucian
       FROM tempat t ORDER BY t.nama COLLATE NOCASE`
    )
    .all()
    .map((r) => ({ ...r, status: labelStatus(r.status) }));
  const cols = ['jenis', 'nama', 'negeri', 'daerah', 'alamat', 'telefon', 'pic', 'status', 'keadaan', 'follow_up', 'kitaran_cuci_bulan', 'terakhir_cuci', 'bil_cucian', 'keluasan_kp', 'bil_dokumen', 'catatan'];
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(','))].join('\r\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="masjid-surau.csv"' });
  res.send(csv);
});

function snapshotDb() {
  const tmp = path.join(DATA_DIR, `sandaran-${crypto.randomBytes(6).toString('hex')}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  return tmp;
}

app.get('/sandaran.db', (req, res) => {
  const tmp = snapshotDb();
  res.download(tmp, `pangkalan-masjid-${today()}.db`, () => fs.rm(tmp, { force: true }, () => {}));
});

app.get('/sandaran-penuh.tar.gz', async (req, res, next) => {
  const tmp = snapshotDb();
  res.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="pangkalan-masjid-penuh-${today()}.tar.gz"` });
  try {
    await writeTarGz([{ name: 'masjid.db', path: tmp }, ...listUploads(UPLOAD_DIR)], res);
  } catch (e) {
    if (!res.headersSent) next(e); else res.destroy(e);
  } finally {
    fs.rm(tmp, { force: true }, () => {});
  }
});

// ---------- Tetapan ----------
app.get('/tetapan', (req, res) => res.send(V.tetapanPage(semuaTetapan(), req.query.ok === '1' ? 'Tetapan disimpan.' : req.query.ok === 'kl' ? 'Kata laluan ditukar.' : '')));

app.post('/tetapan', (req, res) => {
  const b = req.body;
  const out = {};
  const errs = [];
  out.penghantar = txt(b.penghantar, 60) || LALAI.penghantar;
  for (const k of ['wa_karpet', 'wa_cuci', 'wa_vacuum']) out[k] = txt(b[k], 1500) || LALAI[k];
  const hayat = intOrNull(b.hayat_karpet);
  if (hayat === null || hayat < 1 || hayat > 50) errs.push('Hayat karpet mesti 1 hingga 50 tahun.');
  else out.hayat_karpet = String(hayat);
  const awal = intOrNull(b.cuci_awal_hari);
  if (awal === null || awal < 0 || awal > 120) errs.push('Hari peringatan mesti 0 hingga 120.');
  else out.cuci_awal_hari = String(awal);
  const sf = intOrNull(b.selang_filter_bulan ?? LALAI.selang_filter_bulan);
  if (sf === null || sf < 1 || sf > 36) errs.push('Selang filter mesti 1 hingga 36 bulan.');
  else out.selang_filter_bulan = String(sf);
  const labels = STATUS.map((s, i) => txt(b[`status_${i}`], 40) || s);
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) errs.push('Nama status tidak boleh sama.');
  else labels.forEach((l, i) => (out[`status_${i}`] = l));
  if (errs.length) return res.status(400).send(V.tetapanPage({ ...semuaTetapan(), ...b }, '', errs.join(' ')));
  simpanTetapan(out);
  res.redirect(303, '/tetapan?ok=1');
});

app.post('/tetapan/kata-laluan', (req, res) => {
  const b = req.body;
  const err = !auth.checkPassword(req.user.id, b.semasa)
    ? 'Kata laluan semasa salah.'
    : String(b.baru || '').length < auth.MIN_KATA
    ? `Kata laluan baharu mesti sekurang-kurangnya ${auth.MIN_KATA} aksara.`
    : b.baru !== b.ulang
    ? 'Kata laluan baharu tidak sepadan.'
    : '';
  if (err) return res.status(400).send(V.tetapanPage(semuaTetapan(), '', err));
  auth.changePassword(req.user.id, String(b.baru));
  const u = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(req.user.id);
  res.set('Set-Cookie', auth.cookieHeader(auth.makeSession(u), auth.SESSION_DAYS * 86400));
  res.redirect(303, '/tetapan?ok=kl');
});

// ---------- Ralat ----------
app.use((req, res) => res.status(404).send(V.messagePage('Tidak dijumpai', 'Halaman tidak wujud.')));
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).send(V.messagePage('Muat naik gagal', `${err.message} (had: foto 12MB x 10, dokumen 20MB)`));
  console.error(err);
  res.status(500).send(V.messagePage('Ralat', 'Sesuatu tidak kena. Cuba lagi.'));
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
export const server = app.listen(PORT, HOST, () => console.log(`Pangkalan Masjid: http://${HOST}:${PORT}`));
