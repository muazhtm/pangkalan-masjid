import { esc, waNumber, fmtRM } from './util.js';
import { JENIS, STATUS, KEADAAN, SALURAN, TUJUAN, STATUS_PIC, JENIS_DOK, labelStatus } from './config.js';

let currentUser = null;
export const setUser = (u) => { currentUser = u; };

const opt = (list, sel, blank) =>
  (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
  list.map((x) => `<option value="${esc(x)}"${x === sel ? ' selected' : ''}>${esc(x)}</option>`).join('');
// pilihan status: nilai kanonik, label paparan
const optStatus = (sel, blank) =>
  (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
  STATUS.map((s) => `<option value="${esc(s)}"${s === sel ? ' selected' : ''}>${esc(labelStatus(s))}</option>`).join('');

const statusClass = (s) => 'b-' + String(s).toLowerCase().replace(/[^a-z]+/g, '-');
const badge = (s) => (s ? `<span class="badge ${statusClass(s)}">${esc(labelStatus(s))}</span>` : '');
const BULAN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const BULAN_PENUH = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
const HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
export const tarikhMy = (d) => {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${BULAN[m - 1]} ${y}`;
};
const tarikhPendek = (d) => { if (!d) return ''; const [, m, day] = d.split('-').map(Number); return `${day} ${BULAN[m - 1]}`; };
const tarikhPanjang = (d) => { const [y, m, day] = d.split('-').map(Number); return `${HARI[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]}, ${day} ${BULAN_PENUH[m - 1]} ${y}`; };
const beza = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
function bilaSusulan(d, tarikh) {
  const n = beza(tarikh, d);
  if (n > 0) return `<b class="err">${tarikhPendek(d)} (lewat ${n} hari)</b>`;
  if (n === 0) return '<b>hari ini</b>';
  return tarikhPendek(d);
}
const luas = (u) => u.reduce((a, x) => a + x.panjang * x.lebar, 0);
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('en-US');

const I = {
  kalendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  senarai: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  tambah: '<path d="M12 5v14M5 12h14"/>',
  data: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  tetapan: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  keluar: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  telefon: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  titis: '<path d="M12 2.7s7 7.2 7 12a7 7 0 0 1-14 0c0-4.8 7-12 7-12z"/>',
  ulang: '<path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  peta: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  fail: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  larang: '<circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/>',
};
const icon = (k, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;

const NAV = [
  ['hari', '/', 'Hari ini', 'kalendar'],
  ['senarai', '/tempat', 'Senarai', 'senarai'],
  ['baru', '/tempat/baru', 'Masjid baru', 'tambah'],
  ['data', '/data', 'Data', 'data'],
];

export function layout(title, body, { nav = true, active = '', cls = '' } = {}) {
  const links = (extra) => NAV.map(([k, href, label, ic]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('') + (extra || '');
  return `<!doctype html>
<html lang="ms"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#14532D">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/static/img/ikon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>${esc(title)} · Pangkalan Masjid</title>
<link rel="stylesheet" href="/static/style.css?v=2">
</head><body class="${nav ? 'has-nav' : 'no-nav'} ${cls}">
${nav ? `<aside class="side">
<a href="/" class="side-logo"><img src="/static/img/logo_mendatar.png" alt="Al Haromain Carpets &amp; Services"></a>
<nav aria-label="Menu utama" class="side-nav">${links(`<a href="/tetapan"${active === 'tetapan' ? ' aria-current="page"' : ''}>${icon('tetapan')}<span>Tetapan</span></a>`)}</nav>
<div class="side-user"><span>${esc(currentUser?.nama || currentUser?.nama_pengguna || '')}</span><form method="post" action="/logout"><button class="btn-line">Keluar</button></form></div>
</aside>` : ''}
<div class="page">${body}</div>
${nav ? `<nav aria-label="Menu utama" class="bottom-nav">${links()}</nav>` : ''}
<script src="/static/app.js?v=2"></script>
</body></html>`;
}

// Kepala halaman hijau (telefon). Di komputer jadi tajuk biasa.
const ph = ({ back, backText, title, sub, right }) => `<header class="ph">
${back || right ? `<div class="ph-top">${back ? `<a class="ph-back" href="${back}">‹ ${esc(backText)}</a>` : '<span></span>'}${right || ''}</div>` : ''}
<h1>${title}</h1>${sub ? `<div class="ph-sub">${sub}</div>` : ''}</header>`;

const errBox = (e) => (e ? `<p class="alert">${esc(e)}</p>` : '');
const actionBar = (cancelHref, submitText, formId) => `<div class="action-bar"><a class="btn ghost" href="${cancelHref}">Batal</a><button class="btn grow" form="${formId}">${esc(submitText)}</button></div>`;

// ---------------- Log masuk ----------------
export function loginPage(error = '', nama = 'abuabbas') {
  return layout('Log masuk', `<div class="login">
<div class="login-brand"><img src="/static/img/logo_penuh.png" alt="Al Haromain Carpets &amp; Services"><p>Pakar Karpet Masjid. Bekal. Pasang. Cuci. Baik-pulih.</p></div>
<div class="login-form"><form method="post" action="/login">
<h1>Pangkalan Masjid</h1><p class="muted">Log masuk untuk teruskan.</p>
${errBox(error)}
<label>Nama pengguna<input name="nama_pengguna" value="${esc(nama)}" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
<label>Kata laluan<input type="password" name="kata_laluan" autocomplete="current-password" autofocus required></label>
<button class="btn block">Log masuk</button>
<p class="muted small">5 kali salah, log masuk dikunci 15 minit.</p>
</form></div></div>`, { nav: false, cls: 'login-body' });
}

// ---------------- Hari ini ----------------
export function dashboardPage({ tarikh, items, stats, total, hayat, awal }) {
  const max = Math.max(1, ...STATUS.map((s) => stats[s] || 0));
  const COL = ['#B7C2B2', '#7FA886', '#4F8F5F', '#1E6B3F', '#C9942E', '#9AA39C'];
  const funnel = STATUS.map((s, i) => `<a class="fn${s === 'Tidak berminat' ? ' fn-last' : ''}${s === 'Pelanggan' ? ' fn-strong' : ''}" href="/tempat?status=${encodeURIComponent(s)}"><span>${esc(labelStatus(s))}</span><div class="fn-bar"><div style="--w:${Math.max(2, Math.round(((stats[s] || 0) / max) * 100))}%;--c:${COL[i]}"></div></div><b>${stats[s] || 0}</b></a>`).join('');
  const ICON = { susulan: ['telefon', 'ic-merah'], cuci: ['titis', 'ic-biru'], tukar: ['ulang', 'ic-emas'] };
  const row = (it) => {
    let sub;
    if (it.kind === 'susulan') sub = `Hubungi semula · ${bilaSusulan(it.tarikh, tarikh)}`;
    else if (it.kind === 'cuci') sub = `Cucian berkala · ${it.tarikh < tarikh ? `<b class="err">${tarikhPendek(it.tarikh)} (lepas)</b>` : tarikhPendek(it.tarikh)}`;
    else sub = esc(it.sub);
    const [ic, c] = it.kind === 'susulan' && it.tarikh === tarikh ? ['telefon', 'ic-hijau'] : ICON[it.kind];
    return `<a class="act" href="/tempat/${it.id}"><span class="act-ic ${c}">${icon(ic, 20)}</span><div class="grow"><div class="act-t">${esc(it.nama)}</div><div class="act-s">${sub}</div></div><span class="chev" aria-hidden="true">›</span></a>`;
  };
  const shown = items.slice(0, 60);
  const body = `<header class="hero">
<div class="hero-top"><img class="hero-logo" src="/static/img/logo_mendatar.png" alt="Al Haromain Carpets &amp; Services"><form method="post" action="/logout"><button class="icon-btn" aria-label="Keluar">${icon('keluar')}</button></form></div>
<div class="hero-line"><div class="hero-date">${tarikhPanjang(tarikh)}</div>
<h1>Assalamualaikum, ${esc(currentUser?.nama || 'Abu Abbas')}</h1>
<div class="pill"><b>${items.length}</b>tindakan hari ini</div></div>
</header>
<div class="lift">
<section class="panel"><div class="row"><h2>Saluran jualan</h2><span class="muted small">Jumlah ${total}</span></div><div class="funnel">${funnel}</div></section>
<section><h2>Tindakan hari ini</h2>
${shown.length ? `<div class="acts">${shown.map(row).join('')}</div>${items.length > shown.length ? `<p class="muted small">…dan ${items.length - shown.length} lagi.</p>` : ''}` : '<p class="panel">Tiada tindakan hari ini. Tetapkan <b>tarikh susulan</b> pada setiap masjid/surau supaya ia muncul di sini.</p>'}
<p class="muted small">Termasuk: tarikh susulan yang tiba, cucian berkala (dipaparkan ${awal} hari lebih awal), dan karpet rosak atau berumur ${hayat} tahun ke atas (anggaran, ubah di Tetapan).</p>
</section></div>`;
  return layout('Hari ini', body, { active: 'hari', cls: 'dash' });
}

// ---------------- Senarai ----------------
function sublineTempat(t) {
  const bits = [esc(t.jenis)];
  if (t.daerah) bits.push(esc(t.daerah));
  if (t.follow_up) bits.push(`susulan ${tarikhPendek(t.follow_up)}`);
  else if (t.keadaan) bits.push('karpet: ' + esc(t.keadaan));
  else if (t.kitaran_cuci_bulan && t.status === 'Pelanggan') bits.push(`cucian setiap ${t.kitaran_cuci_bulan} bulan`);
  return bits.join(' · ');
}

export function listPage({ rows, total, page, pages, q, f, daerahList, pilih, from }) {
  const qs = (extra) => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    for (const k of ['jenis', 'daerah', 'status', 'susulan']) if (f[k]) u.set(k, f[k]);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    return '/tempat?' + u.toString();
  };
  const cards = rows.map((t) => `<a class="item" href="/tempat/${t.id}"><div class="grow"><div class="item-t">${esc(t.nama)}</div><div class="item-s">${sublineTempat(t)}</div></div>${badge(t.status)}</a>`).join('');
  const table = `<div class="tbl-wrap"><table class="tbl-list"><thead><tr><th>Nama</th><th>Jenis</th><th>Daerah</th><th>Status</th><th>Susulan</th></tr></thead><tbody>
${rows.map((t) => `<tr${pilih && pilih.t.id === t.id ? ' class="sel"' : ''}><td><a href="${qs({ page, pilih: t.id })}">${esc(t.nama)}</a></td><td class="muted">${esc(t.jenis)}</td><td class="muted">${esc(t.daerah || '')}</td><td>${badge(t.status)}</td><td>${t.follow_up ? tarikhPendek(t.follow_up) : '<span class="muted">-</span>'}</td></tr>`).join('')}
</tbody></table></div>`;
  const empty = '<p class="panel">Tiada rekod. <a href="/tempat/baru">Tambah satu</a> atau <a href="/data">import CSV</a>.</p>';
  const body = `<div class="split${pilih ? ' has-panel' : ''}"><section class="split-main">
${ph({ title: `Senarai <span class="count">${total}</span>`, right: '' })}
<div class="ph-action-desk"><a class="btn" href="/tempat/baru">+ Masjid baru</a></div>
<div class="pad">
<form method="get" action="/tempat" class="filters" data-autosubmit>
<input type="search" name="q" value="${esc(q)}" placeholder="Cari nama, alamat, daerah" aria-label="Cari">
<div class="filters-3">
<select name="jenis" aria-label="Jenis">${opt(JENIS, f.jenis, 'Semua jenis')}</select>
<select name="daerah" aria-label="Daerah">${opt(daerahList, f.daerah, 'Semua daerah')}</select>
<select name="status" aria-label="Status">${optStatus(f.status, 'Semua status')}</select></div>
<label class="check"><input type="checkbox" name="susulan" value="1"${f.susulan ? ' checked' : ''}> Ada tarikh susulan sahaja</label>
<noscript><button class="btn">Tapis</button></noscript>
</form>
${rows.length ? `<div class="items only-phone">${cards}</div><div class="only-desk">${table}</div>` : empty}
<div class="pager"><span class="muted small">${total ? `Papar ${from + 1} hingga ${from + rows.length} daripada ${total}` : ''}</span><div>${page > 1 ? `<a class="btn ghost" href="${qs({ page: page - 1 })}">‹ Sebelum</a>` : ''} ${page < pages ? `<a class="btn ghost" href="${qs({ page: page + 1 })}">Seterusnya ›</a>` : ''}</div></div>
</div></section>
${pilih ? `<section class="split-panel" aria-label="Butiran ${esc(pilih.t.nama)}">${detailPanel(pilih)}</section>` : ''}
</div>`;
  return layout('Senarai', body, { active: 'senarai', cls: 'wide' });
}

// ---------------- Borang masjid ----------------
export function tempatFormPage(t = { jenis: 'Surau', status: 'Belum dihubungi' }, error = '', id = null) {
  const produk = Array.isArray(t.produk) ? t.produk : String(t.produk || '').split(',');
  const back = id ? `/tempat/${id}` : '/tempat';
  const body = `${ph({ back, backText: id ? t.nama || 'Kembali' : 'Senarai', title: id ? 'Edit masjid atau surau' : 'Tambah masjid atau surau' })}
<form id="f" method="post" action="${id ? `/tempat/${id}` : '/tempat'}" class="form pad">
${errBox(error)}
<fieldset><legend>Jenis</legend><div class="seg seg-2">${JENIS.map((j) => `<label><input type="radio" name="jenis" value="${j}"${t.jenis === j ? ' checked' : ''}><span>${j}</span></label>`).join('')}</div></fieldset>
<label>Nama <b class="req">*</b><input name="nama" value="${esc(t.nama)}" required maxlength="200"></label>
<label>Daerah<input name="daerah" value="${esc(t.daerah)}" maxlength="100"></label>
<label>Alamat<textarea name="alamat" rows="2" maxlength="500">${esc(t.alamat)}</textarea></label>
<label>Telefon masjid/surau<input name="telefon" type="tel" value="${esc(t.telefon)}" inputmode="tel" maxlength="40" placeholder="cth: 03-7800 1234"></label>
<label>Status<select name="status">${optStatus(t.status)}</select></label>
<fieldset><legend>Produk yang sesuai ditawar</legend>
${Object.entries(TUJUAN).map(([k, v]) => `<label class="check"><input type="checkbox" name="produk" value="${k}"${produk.includes(k) ? ' checked' : ''}> ${esc(v)}</label>`).join('')}
</fieldset>
<label>Tarikh susulan seterusnya<input type="date" name="follow_up" value="${esc(t.follow_up)}"></label>
<fieldset><legend>Pelanggan cucian berkala (jika ada)</legend><div class="grid-2">
<label>Cuci setiap (bulan)<input type="number" name="kitaran_cuci_bulan" min="1" max="60" inputmode="numeric" placeholder="cth: 3" value="${esc(t.kitaran_cuci_bulan)}"></label>
<label>Cucian terakhir<input type="date" name="terakhir_cuci" value="${esc(t.terakhir_cuci)}"></label></div>
</fieldset>
<label>Catatan<textarea name="catatan" rows="3" maxlength="2000">${esc(t.catatan)}</textarea></label>
${id ? '' : '<p class="muted small">PIC dan nombor telefon mereka ditambah dalam halaman butiran selepas simpan.</p>'}
</form>
${id ? `<form method="post" action="/tempat/${id}/padam" data-confirm="Padam rekod ini beserta semua PIC, lawatan, dokumen dan log? Tidak boleh dibatalkan." class="pad"><button class="linklike danger">Padam rekod ini</button></form>` : ''}
${actionBar(back, 'Simpan', 'f')}`;
  return layout(id ? 'Edit' : 'Masjid baru', body, { active: id ? 'senarai' : 'baru', cls: 'formpage' });
}

// ---------------- Butiran ----------------
function waRow(t, picId) {
  return `<div class="wa-grid">${Object.entries(TUJUAN).map(([k, v]) => `<form method="post" action="/tempat/${t.id}/wa" target="_blank"><input type="hidden" name="pic" value="${picId}"><input type="hidden" name="tujuan" value="${k}"><button class="btn wa">${esc(v)}</button></form>`).join('')}</div>`;
}

function picCard(t, p) {
  const tel = p.telefon ? `<a class="tel" href="tel:${esc(p.telefon)}">${esc(p.telefon)}</a>` : '<span class="muted small">tiada telefon</span>';
  const head = `<div class="row"><div class="pic-n">${esc(p.nama || '(tanpa nama)')}${p.jawatan ? ` <span class="muted">(${esc(p.jawatan)})</span>` : ''}</div><a class="btn-sm" href="/pic/${p.id}/edit">Edit</a></div>`;
  if (p.status === 'Minta jangan hubungi') {
    return `<div class="pic pic-no">${head}<div class="muted small">${esc(p.telefon || '')}</div><div class="pic-warn">${icon('larang', 18)}<span><b>Minta jangan hubungi.</b> Tiada butang WhatsApp untuk PIC ini sahaja. PIC lain masih boleh dihubungi.</span></div></div>`;
  }
  if (!waNumber(p.telefon)) {
    return `<div class="pic pic-dash">${head}${tel}${p.telefon ? '<div class="muted small">Bukan nombor telefon bimbit (01x). Tiada butang WhatsApp, sila telefon.</div>' : ''}</div>`;
  }
  return `<div class="pic">${head}${tel}${waRow(t, p.id)}</div>`;
}

function dokRow(k) {
  const cls = k.jenis === 'Quotation' ? 'dk-q' : k.jenis === 'Invois' ? 'dk-i' : 'dk-l';
  const meta = [`Dihantar ${tarikhMy(k.tarikh)}`, k.amaun_sen !== null ? `RM ${fmtRM(k.amaun_sen)}` : '', k.fail ? (k.fail.endsWith('.pdf') ? 'PDF' : 'Gambar') : 'tiada lampiran'].filter(Boolean).join(' · ');
  return `<div class="dok"><span class="dok-ic ${cls}">${icon('fail', 20)}</span><div class="grow"><div class="dok-t">${esc(k.jenis)} · ${esc(k.nombor)}</div><div class="muted small">${meta}</div>${k.catatan ? `<div class="small">${esc(k.catatan)}</div>` : ''}</div>
<div class="dok-a">${k.fail ? `<a href="/dokumen/${k.id}/fail" target="_blank" rel="noopener">Buka</a>` : ''}<a href="/dokumen/${k.id}/edit">Edit</a></div></div>`;
}

const logRow = (l) => `<div class="log"><div class="muted small">${esc(l.waktu)} · ${esc(l.saluran || '')}${l.tujuan ? ' · ' + esc(l.tujuan) : ''}</div>${esc(l.ringkasan || '')}</div>`;

function lawatanBlock(l) {
  const j = luas(l.ukuran);
  return `<div class="panel lw">
<div class="row"><b>${tarikhMy(l.tarikh)}</b>${l.keadaan ? `<span class="badge k-${esc(l.keadaan.toLowerCase().replace(/\s+/g, '-'))}">${esc(l.keadaan)}</span>` : ''}</div>
${l.jenis_karpet || l.tahun_pasang ? `<div class="muted small">${[l.jenis_karpet, l.tahun_pasang ? 'dipasang ± ' + l.tahun_pasang : ''].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
${l.ukuran.length ? `<table class="tbl"><tr><th>Ruang</th><th>P × L (kaki)</th><th class="r">kp</th></tr>${l.ukuran.map((u) => `<tr><td>${esc(u.label || '')}</td><td>${fmt(u.panjang)} × ${fmt(u.lebar)}</td><td class="r">${fmt(u.panjang * u.lebar)}</td></tr>`).join('')}<tr class="tot"><td colspan="2">Jumlah</td><td class="r">${fmt(j)} kp</td></tr></table>` : ''}
${l.foto.length ? `<div class="fotos">${l.foto.map((f) => `<a href="/uploads/${esc(f.fail)}" target="_blank"><img loading="lazy" src="/uploads/${esc(f.fail)}" alt="Foto lawatan"></a>`).join('')}</div>` : ''}
${l.nota ? `<div class="small">${esc(l.nota)}</div>` : ''}
<form method="post" action="/lawatan/${l.id}/padam" data-confirm="Padam lawatan ini beserta foto dan ukuran?"><button class="linklike danger">Padam lawatan</button></form>
</div>`;
}

function infoRows(t, lawatan, tarikh) {
  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([t.nama, t.alamat, t.daerah].filter(Boolean).join(', '));
  const lw = lawatan[0];
  const produk = String(t.produk || '').split(',').filter((k) => k in TUJUAN).map((k) => TUJUAN[k]);
  return { mapUrl, lw, produk, rows: [
    t.follow_up ? ['Susulan', bilaSusulan(t.follow_up, tarikh)] : null,
    lw?.keadaan ? ['Karpet (lawatan terkini)', esc(lw.keadaan) + (lw.ukuran.length ? ` · ${fmt(luas(lw.ukuran))} kp` : '')] : null,
    produk.length ? ['Produk sesuai', esc(produk.join(', '))] : null,
    t.status === 'Pelanggan' && t.kitaran_cuci_bulan ? ['Cucian berkala', `setiap ${t.kitaran_cuci_bulan} bulan${t.terakhir_cuci ? ` · terakhir ${tarikhMy(t.terakhir_cuci)}` : ''}`] : null,
  ].filter(Boolean) };
}

function picSection(t, pics) {
  const semasa = pics.filter((p) => p.status !== 'Bukan PIC lagi');
  const bekas = pics.filter((p) => p.status === 'Bukan PIC lagi');
  const telWa = waNumber(t.telefon);
  return `${semasa.map((p) => picCard(t, p)).join('') || '<p class="muted small">Belum ada PIC.</p>'}
${telWa ? `<div class="pic"><div class="pic-n">Telefon ${esc(t.jenis.toLowerCase())}</div><a class="tel" href="tel:${esc(t.telefon)}">${esc(t.telefon)}</a>${waRow(t, '')}</div>` : ''}
${bekas.length ? `<details class="panel bekas"><summary>Bekas PIC (${bekas.length})</summary>${bekas.map((p) => `<div class="small muted bekas-r"><b class="ink">${esc(p.nama || '(tanpa nama)')}</b>${p.jawatan ? ` (${esc(p.jawatan)})` : ''}${p.telefon ? ' · ' + esc(p.telefon) : ''} · Bukan PIC lagi. <a href="/pic/${p.id}/edit">Edit</a></div>`).join('')}</details>` : ''}
<a class="link-strong" href="/tempat/${t.id}/pic/baru">+ Tambah PIC</a>`;
}

export function detailPage({ t, pics, lawatan, logs, dokumen, tarikh }) {
  const { mapUrl, rows } = infoRows(t, lawatan, tarikh);
  const body = `<header class="ph">
<div class="ph-top"><a class="ph-back" href="/tempat">‹ Senarai</a><a class="ph-btn" href="/tempat/${t.id}/edit">Edit</a></div>
<h1>${esc(t.nama)}</h1><div class="ph-sub">${esc(t.jenis)}${t.daerah ? ' · ' + esc(t.daerah) : ''} ${badge(t.status)}</div></header>
<div class="pad stack">
<section class="panel info">
${t.alamat ? `<div>${esc(t.alamat)}</div>` : ''}
<div class="grid-2"><a class="btn ghost" href="${mapUrl}" target="_blank" rel="noopener">${icon('peta', 18)} ${t.alamat ? 'Buka peta' : 'Cari di peta'}</a>${t.telefon ? `<a class="btn ghost" href="tel:${esc(t.telefon)}">${icon('telefon', 18)} Telefon ${esc(t.jenis.toLowerCase())}</a>` : ''}</div>
${rows.map(([k, v]) => `<div><span class="muted">${k}</span> · ${v}</div>`).join('')}
${t.catatan ? `<div class="note">${esc(t.catatan)}</div>` : ''}
</section>

<section><h2>PIC dan WhatsApp</h2>
<p class="muted small">Butang membuka WhatsApp dengan mesej siap. Awak tekan hantar sendiri. Log hanya mencatat WhatsApp dibuka, bukan bukti mesej dihantar.</p>
<div class="stack-s">${picSection(t, pics)}</div></section>

<section><h2>Dokumen dihantar</h2>
<div class="stack-s">${dokumen.map(dokRow).join('')}
<a class="btn ghost block" href="/tempat/${t.id}/dokumen/baru">+ Rekod dokumen dihantar</a></div></section>

<section><h2>Log hubungan</h2>
<a class="btn block" href="/tempat/${t.id}/log/baru">Catat hubungan</a>
<div class="stack-s logs">${logs.map(logRow).join('') || '<p class="muted small">Belum ada log.</p>'}</div></section>

<section><h2>Lawatan dan ukuran</h2>
<div class="stack-s">${lawatan.map(lawatanBlock).join('') || '<p class="muted small">Belum ada lawatan direkod.</p>'}
<a class="btn ghost block" href="/tempat/${t.id}/lawatan/baru">+ Rekod lawatan baharu</a></div></section>

<form method="post" action="/tempat/${t.id}/padam" data-confirm="Padam rekod ini beserta semua PIC, lawatan, dokumen dan log? Tidak boleh dibatalkan." class="center"><button class="linklike danger">Padam rekod ini</button></form>
</div>`;
  return layout(t.nama, body, { active: 'senarai' });
}

// Panel kanan di Senarai (komputer)
function detailPanel({ t, pics, lawatan, logs, dokumen, tarikh }) {
  const { mapUrl, lw, rows } = infoRows(t, lawatan, tarikh);
  return `<div class="row top"><div><h2 class="m0">${esc(t.nama)}</h2><div class="muted small">${esc(t.jenis)}${t.daerah ? ' · ' + esc(t.daerah) : ''} ${badge(t.status)}</div></div>
<div class="btns"><a class="btn ghost sm" href="/tempat/${t.id}/edit">Edit</a><a class="btn sm" href="/tempat/${t.id}">Buka penuh</a></div></div>
<div class="kv">
${t.alamat ? `<span class="muted">Alamat</span><span>${esc(t.alamat)} · <a class="link-strong" href="${mapUrl}" target="_blank" rel="noopener">Buka peta</a></span>` : ''}
${t.telefon ? `<span class="muted">Telefon</span><span>${esc(t.telefon)}</span>` : ''}
${rows.map(([k, v]) => `<span class="muted">${k}</span><span>${v}</span>`).join('')}
${lw?.jenis_karpet ? `<span class="muted">Jenis karpet</span><span>${esc(lw.jenis_karpet)}${lw.tahun_pasang ? ' ± ' + lw.tahun_pasang : ''}</span>` : ''}
</div>
${t.catatan ? `<div class="note">${esc(t.catatan)}</div>` : ''}
<div><h3>WhatsApp</h3><div class="stack-s">${picSection(t, pics)}</div></div>
<div><div class="row"><h3>Dokumen dihantar</h3><a class="btn ghost sm" href="/tempat/${t.id}/dokumen/baru">+ Rekod dokumen</a></div><div class="stack-s">${dokumen.map(dokRow).join('') || '<p class="muted small">Tiada.</p>'}</div></div>
<div><div class="row"><h3>Log hubungan</h3><a class="btn sm" href="/tempat/${t.id}/log/baru">Catat hubungan</a></div>${logs.slice(0, 8).map(logRow).join('') || '<p class="muted small">Belum ada log.</p>'}</div>`;
}

// ---------------- PIC ----------------
const PIC_HINT = {
  Aktif: 'Boleh dihubungi. Butang WhatsApp dipaparkan jika nombor 01x.',
  'Bukan PIC lagi': 'Sudah bertukar jawatan atau AJK baharu. Disimpan sebagai bekas PIC.',
  'Minta jangan hubungi': 'Butang WhatsApp disorok untuk orang ini sahaja.',
};
export function picFormPage(t, p, error = '') {
  const back = `/tempat/${t.id}`;
  const body = `${ph({ back, backText: t.nama, title: p.id ? 'Edit PIC' : 'Tambah PIC' })}
<form id="f" method="post" action="${p.id ? `/pic/${p.id}` : `/tempat/${t.id}/pic`}" class="form pad">
${errBox(error)}
<label>Nama<input name="nama" value="${esc(p.nama)}" maxlength="100"></label>
<label>Jawatan<input name="jawatan" value="${esc(p.jawatan)}" maxlength="100" placeholder="Nazir / Bendahari / Siak"></label>
<label>Telefon<input name="telefon" type="tel" inputmode="tel" value="${esc(p.telefon)}" maxlength="40"></label>
<fieldset><legend>Status PIC</legend>
${STATUS_PIC.map((s) => `<label class="radio-card"><input type="radio" name="status" value="${esc(s)}"${(p.status || 'Aktif') === s ? ' checked' : ''}><span><b>${esc(s)}</b><br><span class="muted small">${PIC_HINT[s]}</span></span></label>`).join('')}
</fieldset>
<p class="muted small">PIC tidak dipadam supaya sejarah hubungan kekal. Bila AJK bertukar, tanda PIC lama "Bukan PIC lagi" dan tambah PIC baharu.</p>
</form>
${p.id ? `<form method="post" action="/pic/${p.id}/padam" data-confirm="Padam PIC ini terus? Guna hanya jika tersalah masuk. Untuk AJK bertukar, pilih 'Bukan PIC lagi'." class="pad"><button class="linklike danger">Padam (tersalah masuk sahaja)</button></form>` : ''}
${actionBar(back, 'Simpan PIC', 'f')}`;
  return layout('PIC', body, { active: 'senarai', cls: 'formpage' });
}

// ---------------- Catat hubungan ----------------
export function logFormPage(t, tarikh, error = '') {
  const back = `/tempat/${t.id}`;
  const body = `${ph({ back, backText: t.nama, title: 'Catat hubungan' })}
<form id="f" method="post" action="/tempat/${t.id}/log" class="form pad">
${errBox(error)}
<fieldset><legend>Saluran</legend><div class="seg seg-4">${SALURAN.filter((s) => s !== 'Dokumen').map((s) => `<label><input type="radio" name="saluran" value="${esc(s)}"${s === 'Telefon' ? ' checked' : ''}><span>${esc(s)}</span></label>`).join('')}</div></fieldset>
<label>Tujuan<select name="tujuan">${opt(Object.values(TUJUAN), undefined, '(tiada)')}</select></label>
<label>Ringkasan / hasil <b class="req">*</b><textarea name="ringkasan" rows="3" maxlength="1000" required></textarea></label>
<label>Tukar status kepada<select name="status">${optStatus(undefined, `(kekal ${labelStatus(t.status)})`)}</select></label>
<label>Tarikh susulan seterusnya<input type="date" name="follow_up" value="${esc(t.follow_up)}" min="${tarikh.slice(0, 4)}-01-01"></label>
<p class="muted small">Kosongkan tarikh susulan jika tiada tindakan lanjut. Rekod tanpa tarikh tidak akan muncul di Hari ini.</p>
</form>${actionBar(back, 'Simpan log', 'f')}`;
  return layout('Catat hubungan', body, { active: 'senarai', cls: 'formpage' });
}

// ---------------- Lawatan ----------------
export function lawatanFormPage(t, tarikh) {
  const back = `/tempat/${t.id}`;
  const urow = (n) => `<div class="urow"><input name="u_label" aria-label="Ruang ${n}" placeholder="cth: Solat utama"><input name="u_panjang" type="number" step="0.01" min="0" inputmode="decimal" aria-label="Panjang ruang ${n} (kaki)" placeholder="kaki"><input name="u_lebar" type="number" step="0.01" min="0" inputmode="decimal" aria-label="Lebar ruang ${n} (kaki)" placeholder="kaki"></div>`;
  const body = `${ph({ back, backText: t.nama, title: 'Rekod lawatan' })}
<form id="f" method="post" action="/tempat/${t.id}/lawatan" enctype="multipart/form-data" class="form pad">
<label>Tarikh lawatan<input type="date" name="tarikh" value="${tarikh}" required></label>
<fieldset><legend>Keadaan karpet</legend><div class="seg seg-4">${KEADAAN.map((k) => `<label><input type="radio" name="keadaan" value="${esc(k)}"><span>${esc(k)}</span></label>`).join('')}</div></fieldset>
<label>Jenis karpet sedia ada<input name="jenis_karpet" maxlength="100" placeholder="cth: karpet rol / tile / sejadah"></label>
<label>Anggaran tahun dipasang<input type="number" name="tahun_pasang" min="1950" max="2100" inputmode="numeric"></label>
<fieldset><legend>Ukuran (kaki)</legend>
<div class="urow urow-h"><span>Ruang</span><span>Panjang</span><span>Lebar</span></div>
<div id="ukuran-rows">${urow(1)}</div>
<button type="button" class="btn ghost block" id="add-ukuran">+ Tambah ruang</button>
<div class="row tot-row"><span class="muted">Jumlah</span><b><span id="jumlah-luas">0</span> kp</b></div>
</fieldset>
<label class="file-btn">Ambil foto atau pilih daripada telefon<input type="file" name="foto" accept="image/*" multiple></label>
<div id="foto-prev" class="small muted"></div>
<label>Nota<textarea name="nota" rows="3" maxlength="2000"></textarea></label>
</form>${actionBar(back, 'Simpan lawatan', 'f')}`;
  return layout('Rekod lawatan', body, { active: 'senarai', cls: 'formpage' });
}

// ---------------- Dokumen dihantar ----------------
export function dokumenFormPage(t, k, error = '', cadang) {
  const back = `/tempat/${t.id}`;
  const jenis = k.jenis || 'Quotation';
  const sug = k.id ? '' : (k.status ?? cadang(jenis, t.status));
  const body = `${ph({ back, backText: t.nama, title: k.id ? 'Edit dokumen' : 'Rekod dokumen dihantar', sub: 'Dokumen disediakan di projek Claude. Di sini awak cuma rekod dan lampirkan.' })}
<form id="f" method="post" action="${k.id ? `/dokumen/${k.id}` : `/tempat/${t.id}/dokumen`}" enctype="multipart/form-data" class="form pad" data-dok data-status="${esc(t.status)}">
${errBox(error)}
<fieldset><legend>Jenis dokumen</legend><div class="seg seg-3">${JENIS_DOK.map((j) => `<label><input type="radio" name="jenis" value="${esc(j)}"${jenis === j ? ' checked' : ''} data-cadang="${esc(cadang(j, t.status))}"><span>${esc(j)}</span></label>`).join('')}</div></fieldset>
<label>Nombor dokumen <b class="req">*</b><input name="nombor" value="${esc(k.nombor)}" required maxlength="60" placeholder="cth: AHCS/QT/2026/0047"></label>
<div class="grid-2">
<label>Tarikh dihantar<input type="date" name="tarikh" value="${esc(k.tarikh)}" required></label>
<label>Amaun RM (pilihan)<input name="amaun" inputmode="decimal" value="${esc(k.amaun)}" placeholder="cth: 1330.00"></label></div>
<div><div class="lbl">Lampiran (PDF atau gambar, maks 20MB)</div>
${k.fail ? `<div class="file-cur">${icon('fail', 20)}<span class="grow ell">${esc(k.fail_nama || 'Lampiran')}</span><a href="/dokumen/${k.id}/fail" target="_blank" rel="noopener">Buka</a><label class="check small"><input type="checkbox" name="buang_fail" value="1"> Buang</label></div>` : ''}
<label class="file-btn">${k.fail ? 'Ganti fail' : 'Pilih fail (PDF atau gambar)'}<input type="file" name="fail" accept="application/pdf,image/*"></label>
<div id="fail-nama" class="small muted"></div></div>
<label>Tukar status kepada<select name="status" id="dok-status">${optStatus(sug, `(kekal ${labelStatus(t.status)})`)}</select></label>
<label class="check" id="kemas-cuci"><input type="checkbox" name="kemas_cuci" value="1"> Kemas kini "cucian terakhir" ke tarikh ini (untuk invois / laporan kerja cucian)</label>
<label>Catatan<textarea name="catatan" rows="2" maxlength="1000" placeholder="cth: Hantar kepada Ustaz Ahmad melalui WhatsApp.">${esc(k.catatan)}</textarea></label>
<p class="muted small">Disimpan juga dalam log hubungan.</p>
</form>
${k.id ? `<form method="post" action="/dokumen/${k.id}/padam" data-confirm="Padam rekod dokumen ini beserta lampirannya?" class="pad"><button class="linklike danger">Padam dokumen ini</button></form>` : ''}
${actionBar(back, 'Simpan dokumen', 'f')}`;
  return layout('Dokumen', body, { active: 'senarai', cls: 'formpage' });
}

// ---------------- Data ----------------
export function dataPage(result = null) {
  const body = `${ph({ title: 'Data', sub: 'Import senarai, eksport dan sandaran' })}
<div class="pad stack narrow-col">
<section class="panel form">
<h2>Import CSV</h2>
<p class="muted small">Baris pertama mesti tajuk lajur. Lajur dikenali: <code>nama, jenis, daerah, alamat, telefon, status, catatan, kitaran_cuci_bulan, terakhir_cuci, pic, jawatan_pic, telefon_pic</code>, dan <code>pic2</code> hingga <code>pic10</code> (dengan <code>jawatan_pic2</code>, <code>telefon_pic2</code>…). Nama + daerah yang sudah wujud dilangkau. Pemisah koma atau semicolon, UTF-8.</p>
${result ? `<div class="ok-box"><b>${result.tambah}</b> rekod ditambah, <b>${result.langkau}</b> dilangkau (sudah wujud / tiada nama).${result.amaran.length ? `<ul class="small">${result.amaran.slice(0, 20).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</div>` : ''}
<form method="post" action="/import" enctype="multipart/form-data">
<label class="file-btn">Pilih fail CSV<input type="file" name="fail" accept=".csv,text/csv" required></label>
<div id="fail-nama" class="small muted"></div>
<button class="btn block">Import</button></form>
</section>
<a class="panel link-row" href="/tetapan">Tetapan (mesej WhatsApp, peringatan, status, kata laluan)<span aria-hidden="true">›</span></a>
<section class="panel stack-s">
<h2>Eksport dan sandaran</h2>
<a class="btn ghost block" href="/eksport.csv">Eksport senarai (CSV)</a>
<a class="btn ghost block" href="/sandaran-penuh.tar.gz">Muat turun sandaran penuh (data + PDF + foto)</a>
<a class="btn ghost block" href="/sandaran.db">Muat turun sandaran data sahaja (kecil)</a>
<div class="note small">Sandaran penuh mengandungi semua lampiran dan foto, jadi saiznya boleh besar. Simpan salinan di Google Drive sekurang-kurangnya seminggu sekali.</div>
</section>
<form method="post" action="/logout" class="center only-phone"><button class="linklike">Keluar</button></form>
</div>`;
  return layout('Data', body, { active: 'data' });
}

// ---------------- Tetapan ----------------
export function tetapanPage(s, ok = '', error = '') {
  const body = `${ph({ back: '/data', backText: 'Data', title: 'Tetapan', sub: 'Perkara perniagaan yang awak ubah sendiri, tanpa pengaturcara.' })}
<div class="pad stack narrow-col">
${ok ? `<p class="ok-box">${esc(ok)}</p>` : ''}${errBox(error)}
<form method="post" action="/tetapan" class="stack" id="tf">
<section class="panel form"><h2>Mesej WhatsApp</h2>
<label>Nama penghantar dalam mesej<input name="penghantar" value="${esc(s.penghantar)}" maxlength="60"></label>
${Object.entries(TUJUAN).map(([k, v]) => `<label>${esc(v)}<textarea name="wa_${k}" rows="5" maxlength="1500" data-preview>${esc(s['wa_' + k])}</textarea></label><div class="preview small" aria-live="polite"></div>`).join('')}
<p class="muted small">[PIC], [penghantar] dan [masjid] diganti automatik. Jika PIC tiada nama, [PIC] jadi "tuan/puan". Kosongkan kotak untuk kembali ke teks asal.</p>
</section>
<section class="panel form"><h2>Peringatan di Hari ini</h2>
<div class="grid-2"><label>Anggaran hayat karpet (tahun)<input type="number" name="hayat_karpet" min="1" max="50" value="${esc(s.hayat_karpet)}"></label>
<label>Ingatkan cucian berkala (hari lebih awal)<input type="number" name="cuci_awal_hari" min="0" max="120" value="${esc(s.cuci_awal_hari)}"></label></div>
</section>
<section class="panel form"><h2>Nama status</h2>
${STATUS.map((st, i) => `<label>${i + 1}. asal: ${esc(st)}<input name="status_${i}" value="${esc(s['status_' + i])}" maxlength="40"></label>`).join('')}
<p class="muted small">Status boleh dinamakan semula, tapi tidak dipadam atau ditambah di sini. Menambah atau membuang status mengubah cara laporan dikira, jadi ia perubahan kod.</p>
</section>
<button class="btn block">Simpan tetapan</button>
</form>
<form method="post" action="/tetapan/kata-laluan" class="panel form"><h2>Tukar kata laluan</h2>
<input type="hidden" name="nama_pengguna" value="${esc(currentUser?.nama_pengguna || '')}" autocomplete="username">
<label>Kata laluan semasa<input type="password" name="semasa" autocomplete="current-password" required></label>
<label>Kata laluan baharu (min 8 aksara)<input type="password" name="baru" autocomplete="new-password" minlength="8" required></label>
<label>Ulang kata laluan baharu<input type="password" name="ulang" autocomplete="new-password" minlength="8" required></label>
<button class="btn ghost block">Tukar kata laluan</button>
<p class="muted small">Nama pengguna: <b>${esc(currentUser?.nama_pengguna || '')}</b>. Selepas tukar, peranti lain perlu log masuk semula. Face ID akan ditambah selepas app dipasang di crm.alharomain.my (HTTPS).</p>
</form>
</div>`;
  return layout('Tetapan', body, { active: 'tetapan' });
}

export function messagePage(title, msg) {
  return layout(title, `${ph({ title: esc(title) })}<div class="pad"><div class="panel"><p>${esc(msg)}</p><p><a href="#" data-back>‹ Kembali</a></p></div></div>`);
}
