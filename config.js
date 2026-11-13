// Senarai tetap (perubahan di sini = perubahan kod) dan tetapan yang boleh diubah dalam app (skrin Tetapan).
import { db } from './db.js';

export const JENIS = ['Masjid', 'Surau'];
// Nilai kanonik yang disimpan dalam pangkalan data. Nama paparan boleh diubah di Tetapan.
export const STATUS = ['Belum dihubungi', 'Dah dihubungi', 'Dilawat', 'Quotation', 'Pelanggan', 'Tidak berminat'];
export const KEADAAN = ['Baik', 'Sederhana', 'Rosak', 'Tiada karpet'];
export const SALURAN = ['WhatsApp', 'Telefon', 'Lawatan', 'Dokumen', 'Lain-lain'];
export const STATUS_PIC = ['Aktif', 'Bukan PIC lagi', 'Minta jangan hubungi'];
export const JENIS_DOK = ['Quotation', 'Invois', 'Laporan kerja'];

// Tujuan hubungan / produk yang ditawar (label pendek ikut rekaan)
export const TUJUAN = {
  karpet: 'Karpet baharu',
  cuci: 'Cuci karpet',
  vacuum: 'Vacuum',
  lain: 'Lain-lain', // renovation tandas, tinted cermin, baik-pulih karpet dan kerja lain yang jarang
};
// Tujuan yang ada mesej WhatsApp siap (Lain-lain tiada)
export const WA_TUJUAN = ['karpet', 'cuci', 'vacuum'];

export const SYARIKAT = 'Al Haromain Carpets & Services';

const TUTUP = 'Jika tidak berminat, sila maklumkan dan kami tidak akan menghubungi lagi. Terima kasih.';

export const LALAI = {
  penghantar: process.env.NAMA_PENGHANTAR || 'Reza',
  hayat_karpet: String(process.env.HAYAT_KARPET || 8),
  cuci_awal_hari: '14',
  wa_karpet: `Assalamualaikum [PIC]. Saya [penghantar] dari ${SYARIKAT} (Seri Kembangan). Kami membekal dan memasang karpet masjid dan surau. Adakah [masjid] merancang menukar atau menambah karpet? Jika ada, boleh kami hantarkan sebut harga? ${TUTUP}`,
  wa_cuci: `Assalamualaikum [PIC]. Saya [penghantar] dari ${SYARIKAT} (Seri Kembangan). Kami menyediakan servis cucian karpet masjid dan surau. Adakah [masjid] memerlukan servis cucian karpet? ${TUTUP}`,
  wa_vacuum: `Assalamualaikum [PIC]. Saya [penghantar] dari ${SYARIKAT} (Seri Kembangan). Kami juga menjual mesin vacuum untuk kegunaan masjid dan surau. Adakah [masjid] berminat untuk mendapatkan maklumat dan harga? ${TUTUP}`,
};
STATUS.forEach((s, i) => (LALAI[`status_${i}`] = s));

export function tetapan(kunci) {
  const r = db.prepare('SELECT nilai FROM tetapan WHERE kunci = ?').get(kunci);
  return r && r.nilai !== null && r.nilai !== '' ? r.nilai : LALAI[kunci];
}
export function semuaTetapan() {
  const out = { ...LALAI };
  for (const r of db.prepare('SELECT kunci, nilai FROM tetapan').all()) if (r.kunci in LALAI && r.nilai) out[r.kunci] = r.nilai;
  return out;
}
export function simpanTetapan(obj) {
  const st = db.prepare('INSERT INTO tetapan (kunci, nilai) VALUES (?, ?) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai');
  for (const [k, v] of Object.entries(obj)) if (k in LALAI) st.run(k, v);
}

export const hayatKarpet = () => Number(tetapan('hayat_karpet')) || 8;
export const cuciAwalHari = () => Number(tetapan('cuci_awal_hari')) || 14;

// Nama paparan status (kanonik -> label)
export function labelStatus(s) {
  const i = STATUS.indexOf(s);
  return i < 0 ? s : tetapan(`status_${i}`);
}

export function waMesej(tujuan, tempatNama, picNama) {
  if (!WA_TUJUAN.includes(tujuan)) return null;
  return tetapan(`wa_${tujuan}`)
    .replaceAll('[PIC]', picNama || 'tuan/puan')
    .replaceAll('[penghantar]', tetapan('penghantar'))
    .replaceAll('[masjid]', tempatNama);
}
