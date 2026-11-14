// Skor keutamaan follow-up (dipersetujui Abu Abbas, 14 Nov 2026).
// Keutamaan jualan: karpet (margin besar) > cucian > vacuum. Cucian dan vacuum membina hubungan;
// isyarat karpet yang hampir tamat hayat paling bernilai, lebih-lebih lagi bila hubungan sudah ada.
import { db, today, addMonths, addDays } from './db.js';
import { hayatKarpet, cuciAwalHari, selangFilter } from './config.js';

export const MARKAH = {
  karpetTamat: 40, // karpet hampir/lepas hayat, atau keadaan Rosak
  karpetSederhana: 20,
  karpetDanHubungan: 15,
  keluasanSetiap5000: 5, keluasanMaks: 25,
  cuciSampaiMasa: 35,
  pelangganAktif: 15,
  bekasPelanggan: 25, bekasSelepasBulan: 18,
  vacuumSetiap: 5, vacuumMaks: 15,
  filterSampaiMasa: 10,
  baruDihubungi: -40, baruDihubungiHari: 30,
};

const umurTahun = (dari, hingga) => (Date.parse(hingga) - Date.parse(dari)) / (365.25 * 864e5);

// Kira skor untuk semua tempat (atau satu id). Pulang Map id -> { skor, sebab: [{teks, m}], keluar }
export function kiraSkor(id = null) {
  const tarikh = today();
  const awal = addDays(tarikh, cuciAwalHari());
  const hayat = hayatKarpet();
  const tahunIni = Number(tarikh.slice(0, 4));
  const w = id ? 'WHERE t.id = ?' : '';
  const p = id ? [id] : [];
  const out = new Map();
  const tempat = db.prepare(`SELECT t.id, t.status, t.kitaran_cuci_bulan, t.terakhir_cuci, t.keluasan_kp FROM tempat t ${w}`).all(...p);
  if (!tempat.length) return out;
  const by = (sql) => {
    const m = new Map();
    for (const r of db.prepare(sql).all(...p)) m.set(r.tempat_id, r);
    return m;
  };
  const lawatan = by(`SELECT l.tempat_id, l.keadaan, l.tahun_pasang, l.tarikh,
      (SELECT SUM(u.panjang * u.lebar) FROM ukuran u WHERE u.lawatan_id = l.id) AS luas
    FROM lawatan l JOIN tempat t ON t.id = l.tempat_id ${w ? w + ' AND' : 'WHERE'} l.id = (SELECT id FROM lawatan WHERE tempat_id = l.tempat_id ORDER BY tarikh DESC, id DESC LIMIT 1)`);
  const karpet = by(`SELECT b.tempat_id, MIN(b.tarikh) AS tarikh FROM barang b JOIN tempat t ON t.id = b.tempat_id ${w ? w + ' AND' : 'WHERE'} b.jenis = 'Karpet' AND b.tarikh IS NOT NULL AND b.penggunaan != 'Tidak digunakan lagi' GROUP BY b.tempat_id`);
  const vacuum = by(`SELECT b.tempat_id, COUNT(*) AS n FROM barang b JOIN tempat t ON t.id = b.tempat_id ${w ? w + ' AND' : 'WHERE'} b.jenis = 'Vacuum' GROUP BY b.tempat_id`);
  const filter = new Map();
  for (const r of db.prepare(`SELECT b.tempat_id, b.filter_terakhir, b.selang_filter_bulan FROM barang b JOIN tempat t ON t.id = b.tempat_id ${w ? w + ' AND' : 'WHERE'} b.jenis = 'Vacuum' AND b.penggunaan = 'Digunakan' AND b.filter_terakhir IS NOT NULL`).all(...p)) {
    if (addMonths(r.filter_terakhir, r.selang_filter_bulan || selangFilter()) <= awal) filter.set(r.tempat_id, true);
  }
  const cucian = by(`SELECT c.tempat_id, COUNT(*) AS n, MAX(c.tarikh) AS akhir FROM cucian c JOIN tempat t ON t.id = c.tempat_id ${w} GROUP BY c.tempat_id`);
  const hubungi = by(`SELECT l.tempat_id, MAX(l.waktu) AS akhir FROM log l JOIN tempat t ON t.id = l.tempat_id ${w} GROUP BY l.tempat_id`);
  const pic = by(`SELECT pc.tempat_id, COUNT(*) AS n, SUM(pc.status = 'Aktif') AS aktif FROM pic pc JOIN tempat t ON t.id = pc.tempat_id ${w} GROUP BY pc.tempat_id`);
  const sempadanBekas = addMonths(tarikh, -MARKAH.bekasSelepasBulan);
  const sempadanHubungi = addDays(tarikh, -MARKAH.baruDihubungiHari);

  for (const t of tempat) {
    const sebab = [];
    const tambah = (m, teks) => sebab.push({ m, teks });
    const pc = pic.get(t.id);
    const keluar = t.status === 'Tidak berminat' ? 'Tidak berminat' : pc && pc.n > 0 && !pc.aktif ? 'Tiada PIC aktif' : '';
    // --- Karpet ---
    const lw = lawatan.get(t.id);
    const kb = karpet.get(t.id);
    let isyaratKarpet = 0;
    let teksKarpet = '';
    if (kb) {
      const umur = umurTahun(kb.tarikh, tarikh);
      if (umur >= hayat - 1) { isyaratKarpet = MARKAH.karpetTamat; teksKarpet = `Karpet dipasang ${kb.tarikh.slice(0, 4)} (${Math.floor(umur)} tahun)`; }
    } else if (lw?.tahun_pasang && tahunIni - lw.tahun_pasang >= hayat - 1) {
      isyaratKarpet = MARKAH.karpetTamat; teksKarpet = `Karpet ± ${lw.tahun_pasang} (${tahunIni - lw.tahun_pasang} tahun)`;
    }
    if (lw?.keadaan === 'Rosak' && isyaratKarpet < MARKAH.karpetTamat) { isyaratKarpet = MARKAH.karpetTamat; teksKarpet = 'Karpet rosak (lawatan terkini)'; }
    if (lw?.keadaan === 'Sederhana' && !isyaratKarpet) { isyaratKarpet = MARKAH.karpetSederhana; teksKarpet = 'Karpet keadaan sederhana'; }
    if (isyaratKarpet) tambah(isyaratKarpet, teksKarpet);
    // --- Cucian ---
    const cu = cucian.get(t.id);
    const akhirCuci = [cu?.akhir, t.terakhir_cuci].filter(Boolean).sort().pop() || null;
    const vac = vacuum.get(t.id)?.n || 0;
    const bekas = akhirCuci && akhirCuci < sempadanBekas;
    const due = t.status === 'Pelanggan' && t.kitaran_cuci_bulan > 0 && akhirCuci ? addMonths(akhirCuci, t.kitaran_cuci_bulan) : null;
    // Ambil yang tertinggi: sampai masa (35) > bekas pelanggan (25) > pelanggan aktif (15)
    if (due && due <= awal) tambah(MARKAH.cuciSampaiMasa, `Cucian sampai masa (${due})`);
    else if (bekas) tambah(MARKAH.bekasPelanggan, `Bekas pelanggan cucian (terakhir ${akhirCuci})`);
    else if (t.status === 'Pelanggan') tambah(MARKAH.pelangganAktif, 'Pelanggan aktif');
    const adaHubungan = t.status === 'Pelanggan' || !!akhirCuci || vac > 0;
    if (isyaratKarpet && adaHubungan) tambah(MARKAH.karpetDanHubungan, 'Isyarat karpet + hubungan sedia ada');
    // --- Keluasan ---
    const kp = t.keluasan_kp || lw?.luas || 0;
    const mk = Math.min(MARKAH.keluasanMaks, Math.floor(kp / 5000) * MARKAH.keluasanSetiap5000);
    if (mk > 0) tambah(mk, `Keluasan ${Math.round(kp).toLocaleString('en-US')} kp`);
    // --- Vacuum ---
    if (vac) tambah(Math.min(MARKAH.vacuumMaks, vac * MARKAH.vacuumSetiap), `Rekod beli vacuum: ${vac}`);
    if (filter.get(t.id)) tambah(MARKAH.filterSampaiMasa, 'Filter beg vacuum sampai masa');
    // --- Tolak ---
    const hb = hubungi.get(t.id)?.akhir;
    if (hb && hb.slice(0, 10) >= sempadanHubungi) tambah(MARKAH.baruDihubungi, `Baru dihubungi (${hb.slice(0, 10)})`);
    const skor = sebab.reduce((a, s) => a + s.m, 0);
    out.set(t.id, { skor, sebab, keluar, cucianKali: cu?.n || 0 });
  }
  return out;
}

// Senarai keutamaan untuk Hari ini: skor > 0, tidak dikeluarkan, tertinggi dahulu.
export function senaraiKeutamaan(had = 15) {
  const skor = kiraSkor();
  const ids = [...skor.entries()].filter(([, s]) => s.skor > 0 && !s.keluar).sort((a, b) => b[1].skor - a[1].skor).slice(0, had);
  if (!ids.length) return [];
  const nama = new Map(db.prepare(`SELECT id, nama, jenis, daerah, negeri, status FROM tempat WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids.map(([i]) => i)).map((r) => [r.id, r]));
  return ids.map(([i, s]) => ({ ...nama.get(i), ...s }));
}

// Kadar tukar: dihubungi -> pelanggan cucian -> pembeli karpet
export function kadarTukar() {
  const q = (sql) => db.prepare(sql).get().n;
  const dihubungi = q(`SELECT COUNT(*) n FROM tempat WHERE status != 'Belum dihubungi'`);
  // Pelanggan cucian = ada sejarah cucian, atau berstatus Pelanggan (ramai belum ada tarikh cucian direkod)
  const pelangganCuci = `(EXISTS (SELECT 1 FROM cucian c WHERE c.tempat_id = t.id) OR t.terakhir_cuci IS NOT NULL OR t.status = 'Pelanggan')`;
  const cuci = q(`SELECT COUNT(*) n FROM tempat t WHERE ${pelangganCuci}`);
  const karpetSql = `(EXISTS (SELECT 1 FROM barang b WHERE b.tempat_id = t.id AND b.jenis = 'Karpet')
      OR EXISTS (SELECT 1 FROM dokumen d WHERE d.tempat_id = t.id AND d.jenis = 'Invois' AND d.perkhidmatan = 'Karpet baharu'))`;
  const cuciKarpet = q(`SELECT COUNT(*) n FROM tempat t WHERE ${pelangganCuci} AND ${karpetSql}`);
  return { dihubungi, cuci, cuciKarpet };
}
