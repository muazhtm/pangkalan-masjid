// Negeri dan daerah rasmi. Daerah hanya dari senarai tetap supaya tapisan konsisten.
// Selangor: 9 daerah ikut JAIS e-masjid. W.P. Kuala Lumpur guna Zon JAWI (bukan daerah). Putrajaya tiada.
// Bilangan zon JAWI: SEMENTARA, sahkan dengan senarai Zon di direktori masjid JAWI.
export const ZON_KL = 10;
export const NEGERI = [
  'Selangor', 'W.P. Kuala Lumpur', 'W.P. Putrajaya', 'Negeri Sembilan',
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Terengganu', 'W.P. Labuan',
];
export const DAERAH = {
  Selangor: ['Petaling', 'Gombak', 'Klang', 'Kuala Langat', 'Sepang', 'Hulu Langat', 'Kuala Selangor', 'Hulu Selangor', 'Sabak Bernam'],
  'W.P. Kuala Lumpur': Array.from({ length: ZON_KL }, (_, i) => `Zon ${i + 1}`),
  'Negeri Sembilan': ['Seremban', 'Port Dickson', 'Jempol', 'Jelebu', 'Kuala Pilah', 'Rembau', 'Tampin'],
};

const kunci = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS_NEGERI = new Map([
  ...NEGERI.map((n) => [kunci(n), n]),
  ['kl', 'W.P. Kuala Lumpur'], ['kualalumpur', 'W.P. Kuala Lumpur'], ['wpkl', 'W.P. Kuala Lumpur'], ['wilayahpersekutuankualalumpur', 'W.P. Kuala Lumpur'],
  ['putrajaya', 'W.P. Putrajaya'], ['wilayahpersekutuanputrajaya', 'W.P. Putrajaya'],
  ['labuan', 'W.P. Labuan'], ['n9', 'Negeri Sembilan'], ['ns', 'Negeri Sembilan'], ['penang', 'Pulau Pinang'], ['ppinang', 'Pulau Pinang'],
]);
const ALIAS_DAERAH = new Map();
for (const [n, list] of Object.entries(DAERAH)) for (const d of list) ALIAS_DAERAH.set(kunci(d), { negeri: n, daerah: d });
ALIAS_DAERAH.set('ululangat', ALIAS_DAERAH.get('hululangat'));
ALIAS_DAERAH.set('uluselangor', ALIAS_DAERAH.get('huluselangor'));

export const normNegeri = (v) => ALIAS_NEGERI.get(kunci(v)) || null;
export const normDaerah = (v) => ALIAS_DAERAH.get(kunci(v)) || null;

// Sahkan pasangan negeri + daerah. Daerah yang dikenali menetapkan negeri jika kosong.
// Nama negeri yang ditulis dalam ruang daerah dipindah ke negeri.
export function sahLokasi(negeriRaw, daerahRaw) {
  const nr = String(negeriRaw || '').trim(), dr = String(daerahRaw || '').trim();
  let negeri = nr ? normNegeri(nr) : null;
  if (nr && !negeri) return { negeri: null, daerah: null, error: `Negeri "${nr}" tidak dikenali.` };
  if (!dr) return { negeri, daerah: null, error: '' };
  const d = normDaerah(dr);
  if (d) {
    if (negeri && negeri !== d.negeri) return { negeri, daerah: null, error: `Daerah ${d.daerah} bukan dalam ${negeri}.` };
    return { negeri: d.negeri, daerah: d.daerah, error: '' };
  }
  const n2 = normNegeri(dr);
  if (n2 && (!negeri || negeri === n2)) return { negeri: n2, daerah: null, error: '' };
  return { negeri, daerah: null, error: `Daerah "${dr}" bukan daerah rasmi${negeri && DAERAH[negeri] ? ` ${negeri}` : ''}.` };
}

export const lokasiTeks = (t) => [t.daerah, t.negeri].filter(Boolean).join(', ');
