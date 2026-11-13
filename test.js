// Ujian hujung-ke-hujung: jalankan server sebenar dengan data sementara.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { waNumber, parseCsv, addMonths } from './util.js';

let pass = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { pass++; console.log('  ✓', name); }, (e) => { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masjid-'));
const PORT = 3100 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ['--no-warnings', 'server.js'], { env: { ...process.env, DATA_DIR: dir, PORT: String(PORT), APP_PASSWORD: 'kata-uji-12345' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res, rej) => { srv.stdout.on('data', (d) => /http:/.test(String(d)) && res()); srv.on('exit', (c) => rej(new Error('server keluar ' + c))); setTimeout(() => rej(new Error('server lambat')), 8000); });

let cookie = '';
const req = (p, o = {}) => fetch(base + p, { redirect: 'manual', ...o, headers: { cookie, ...(o.headers || {}) } });
const form = (data) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });
const idFrom = (loc) => Number(loc.match(/\/tempat\/(\d+)/)[1]);
const dateOffset = (d) => new Date(Date.now() + d * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' });

console.log('Unit');
await ok('waNumber normalisasi', () => {
  assert.equal(waNumber('012-904 6605'), '60129046605');
  assert.equal(waNumber('+60 12-904 6605'), '60129046605');
  assert.equal(waNumber('60129046605'), '60129046605');
  assert.equal(waNumber('129046605'), '60129046605');
  assert.equal(waNumber('abc'), null);
  assert.equal(waNumber('12345'), null);
  assert.equal(waNumber('+65 9123 4567'), null);
  assert.equal(waNumber('03-1234 5678'), null, 'talian tetap');
  assert.equal(waNumber('011-2345 6789'), '601123456789');
});
await ok('addMonths hujung bulan', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-13', 3), '2027-02-13');
});
await ok('parseCsv petikan & semicolon', () => {
  assert.deepEqual(parseCsv('a;b\n"x;1";"he said ""hi"""\n'), [['a', 'b'], ['x;1', 'he said "hi"']]);
});

console.log('Auth');
await ok('tanpa sesi -> /login', async () => { const r = await req('/'); assert.equal(r.status, 303); assert.match(r.headers.get('location'), /login/); });
await ok('POST tanpa sesi ditolak', async () => { const r = await req('/tempat', form({ nama: 'x', jenis: 'Surau' })); assert.equal(r.status, 401); });
await ok('kata laluan salah', async () => { const r = await req('/login', form({ nama_pengguna: 'abuabbas', kata_laluan: 'salah' })); assert.equal(r.status, 401); });
await ok('kata laluan betul', async () => {
  const r = await req('/login', form({ nama_pengguna: 'AbuAbbas', kata_laluan: 'kata-uji-12345' }));
  assert.equal(r.status, 303);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
  cookie = sc.split(';')[0];
});
await ok('cookie palsu ditolak', async () => { const r = await fetch(base + '/', { redirect: 'manual', headers: { cookie: 'sesi=1.1.9999999999999.abcd' } }); assert.equal(r.status, 303); });
await ok('lock selepas 5 gagal', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await fetch(base + '/login', { redirect: 'manual', ...form({ nama_pengguna: 'abuabbas', kata_laluan: 'x' + i }) });
  assert.equal(last.status, 429);
});

console.log('Rekod');
let id;
await ok('cipta + XSS di-escape', async () => {
  const r = await req('/tempat', form({ jenis: 'Surau', nama: '<script>alert(1)</script> Al-Test', daerah: 'Petaling', alamat: 'Jalan 1', telefon: '03-1234 5678', status: 'Belum dihubungi', catatan: '<img src=x onerror=1>' }));
  assert.equal(r.status, 303);
  id = idFrom(r.headers.get('location'));
  const html = await (await req(`/tempat/${id}`)).text();
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});
await ok('validasi nama kosong', async () => { const r = await req('/tempat', form({ jenis: 'Surau', nama: ' ' })); assert.equal(r.status, 400); });
await ok('id tak wujud -> 404', async () => { assert.equal((await req('/tempat/99999')).status, 404); assert.equal((await req('/tempat/abc')).status, 404); });

console.log('PIC & WhatsApp');
let picPage;
await ok('tambah PIC', async () => {
  const r = await req(`/tempat/${id}/pic`, form({ nama: 'Ustaz Ahmad', jawatan: 'Nazir', telefon: '012-904 6605' }));
  assert.equal(r.status, 303);
  picPage = await (await req(`/tempat/${id}`)).text();
  assert.ok(picPage.includes('Ustaz Ahmad'));
});
await ok('PIC kosong ditolak', async () => { assert.equal((await req(`/tempat/${id}/pic`, form({ nama: '', telefon: '' }))).status, 400); });
const picId = () => Number(picPage.match(/\/pic\/(\d+)\/edit/)[1]);
await ok('wa.me redirect + log + status auto', async () => {
  const r = await req(`/tempat/${id}/wa`, form({ pic: String(picId()), tujuan: 'karpet' }));
  assert.equal(r.status, 303);
  const loc = r.headers.get('location');
  assert.match(loc, /^https:\/\/wa\.me\/60129046605\?text=/);
  const text = decodeURIComponent(loc.split('text=')[1]);
  assert.ok(text.includes('Ustaz Ahmad') && text.includes('karpet') && text.includes('tidak akan menghubungi lagi'));
  const html = await (await req(`/tempat/${id}`)).text();
  assert.ok(html.includes('WhatsApp dibuka kepada Ustaz Ahmad'));
  assert.ok(/b-dah-dihubungi/.test(html));
});
await ok('wa tujuan tak sah', async () => { assert.equal((await req(`/tempat/${id}/wa`, form({ pic: '', tujuan: 'x' }))).status, 400); });
await ok('landline tidak boleh wa', async () => { assert.equal((await req(`/tempat/${id}/wa`, form({ pic: '', tujuan: 'cuci' }))).status, 400); });
await ok('wa PIC rekod lain ditolak', async () => {
  const r2 = await req('/tempat', form({ jenis: 'Masjid', nama: 'Masjid Lain' }));
  const other = idFrom(r2.headers.get('location'));
  assert.equal((await req(`/tempat/${other}/wa`, form({ pic: String(picId()), tujuan: 'cuci' }))).status, 404);
});
await ok('log manual + tukar status + susulan', async () => {
  const r = await req(`/tempat/${id}/log`, form({ saluran: 'Telefon', tujuan: 'Cuci karpet', ringkasan: 'Minta quotation', status: 'Quotation', follow_up: dateOffset(-1) }));
  assert.equal(r.status, 303);
  const html = await (await req(`/tempat/${id}`)).text();
  assert.ok(html.includes('Minta quotation') && html.includes('b-quotation'));
});

console.log('Lawatan');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let fotoUrl;
await ok('lawatan: ukuran + foto + bukan-imej dibuang', async () => {
  const fd = new FormData();
  fd.set('tarikh', dateOffset(0)); fd.set('keadaan', 'Rosak'); fd.set('tahun_pasang', '2012'); fd.set('jenis_karpet', 'Rol'); fd.set('nota', 'Lusuh');
  fd.append('u_label', 'Solat utama'); fd.append('u_panjang', '20'); fd.append('u_lebar', '10.5');
  fd.append('u_label', 'Muslimah'); fd.append('u_panjang', '8'); fd.append('u_lebar', '5');
  fd.append('u_label', 'Salah'); fd.append('u_panjang', '-3'); fd.append('u_lebar', '4');
  fd.append('foto', new Blob([PNG], { type: 'image/png' }), 'a.png');
  fd.append('foto', new Blob(['<?php evil ?>'], { type: 'text/html' }), 'x.php');
  const r = await req(`/tempat/${id}/lawatan`, { method: 'POST', body: fd });
  assert.equal(r.status, 303);
  const html = await (await req(`/tempat/${id}`)).text();
  assert.ok(html.includes('250 kp'), 'jumlah luas 210+40=250 kp');
  assert.ok(!html.includes('Salah'));
  const m = html.match(/src="(\/uploads\/[a-f0-9]{32}\.png)"/);
  assert.ok(m, 'foto png dipaparkan');
    assert.equal([...html.matchAll(/<img loading="lazy"/g)].length, 1, 'hanya 1 foto disimpan');
  fotoUrl = m[1];
  assert.equal(fs.readdirSync(path.join(dir, 'uploads')).length, 1);
});
await ok('foto perlu sesi', async () => { const r = await fetch(base + fotoUrl, { redirect: 'manual' }); assert.equal(r.status, 303); });
await ok('foto dihidang dengan sesi', async () => { const r = await req(fotoUrl); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png'); });
await ok('path traversal ditolak', async () => { assert.equal((await req('/uploads/..%2f..%2fetc%2fpasswd')).status, 404); assert.equal((await req('/uploads/secret')).status, 404); });

console.log('Peringatan hari ini');
await ok('susulan lepas + karpet rosak/tua dipaparkan', async () => {
  const html = await (await req('/')).text();
  assert.ok(html.includes('Hubungi semula'));
  assert.ok(html.includes('Karpet rosak') && html.includes('Dipasang ± 2012'));
});
await ok('kitaran cucian pelanggan', async () => {
  const r = await req('/tempat', form({ jenis: 'Masjid', nama: 'Masjid Pelanggan', status: 'Pelanggan', kitaran_cuci_bulan: '3', terakhir_cuci: addMonths(dateOffset(0), -3) }));
  const html = await (await req('/')).text();
  assert.ok(html.includes('Cucian berkala') && html.includes('Masjid Pelanggan'));
  // belum tiba masa
  await req('/tempat', form({ jenis: 'Masjid', nama: 'Masjid Baru Cuci', status: 'Pelanggan', kitaran_cuci_bulan: '6', terakhir_cuci: dateOffset(0) }));
  assert.ok(!(await (await req('/')).text()).includes('Masjid Baru Cuci'));
});
await ok('status PIC: minta jangan hubungi sekat WA untuk PIC itu sahaja', async () => {
  const r = await req(`/pic/${picId()}`, form({ nama: 'Ustaz Ahmad', jawatan: 'Nazir', telefon: '012-904 6605', status: 'Minta jangan hubungi' }));
  assert.equal(r.status, 303);
  assert.equal((await req(`/tempat/${id}/wa`, form({ pic: String(picId()), tujuan: 'karpet' }))).status, 403);
  await req(`/tempat/${id}/pic`, form({ nama: 'En. Razak', jawatan: 'Bendahari', telefon: '013-765 4321', status: 'Aktif' }));
  const det = await (await req(`/tempat/${id}`)).text();
  assert.ok(det.includes('Minta jangan hubungi.'));
  assert.equal([...det.matchAll(/class="btn wa"/g)].length, 3, 'hanya butang untuk En. Razak');
  assert.ok(det.includes('Status PIC Ustaz Ahmad: Aktif → Minta jangan hubungi'));
});
await ok('bekas PIC disimpan sebagai sejarah', async () => {
  const det0 = await (await req(`/tempat/${id}`)).text();
  const razak = [...det0.matchAll(/\/pic\/(\d+)\/edit/g)].map((m) => m[1]).pop();
  await req(`/pic/${razak}`, form({ nama: 'En. Razak', telefon: '013-765 4321', status: 'Bukan PIC lagi' }));
  const det = await (await req(`/tempat/${id}`)).text();
  assert.ok(det.includes('Bekas PIC (1)'));
  assert.equal([...det.matchAll(/class="btn wa"/g)].length, 0);
  assert.equal((await req(`/tempat/${id}/wa`, form({ pic: razak, tujuan: 'cuci' }))).status, 403);
});
await ok('status PIC tak sah -> Aktif', async () => {
  const r = await req(`/tempat/${id}/pic`, form({ nama: 'Pak Mat', telefon: '03-8888 1234', status: 'zzz' }));
  assert.equal(r.status, 303);
  const det = await (await req(`/tempat/${id}`)).text();
  assert.ok(det.includes('Bukan nombor telefon bimbit'));
});

console.log('Dokumen dihantar');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
let dokId;
await ok('rekod quotation + PDF + status + log', async () => {
  const fd = new FormData();
  fd.set('jenis', 'Quotation'); fd.set('nombor', 'AHCS/QT/2026/0047'); fd.set('tarikh', dateOffset(0)); fd.set('amaun', '1,330.00');
  fd.set('status', 'Quotation'); fd.set('catatan', 'Hantar via WhatsApp');
  fd.set('fail', new Blob([PDF], { type: 'application/pdf' }), 'Quotation_0047.pdf');
  const r = await req(`/tempat/${id}/dokumen`, { method: 'POST', body: fd });
  assert.equal(r.status, 303);
  const det = await (await req(`/tempat/${id}`)).text();
  assert.ok(det.includes('Quotation · AHCS/QT/2026/0047'));
  assert.ok(det.includes('RM 1,330.00'));
  assert.ok(det.includes('Quotation AHCS/QT/2026/0047 dihantar'), 'masuk log');
  dokId = det.match(/\/dokumen\/(\d+)\/fail/)[1];
  const f = await req(`/dokumen/${dokId}/fail`);
  assert.equal(f.status, 200);
  assert.equal(f.headers.get('content-type'), 'application/pdf');
  assert.match(f.headers.get('content-disposition'), /Quotation_0047\.pdf/);
});
await ok('PDF palsu ditolak & fail dibuang', async () => {
  const before = fs.readdirSync(path.join(dir, 'uploads')).length;
  const fd = new FormData();
  fd.set('jenis', 'Invois'); fd.set('nombor', '00037'); fd.set('tarikh', dateOffset(0));
  fd.set('fail', new Blob(['<html><script>x</script>'], { type: 'application/pdf' }), 'x.pdf');
  assert.equal((await req(`/tempat/${id}/dokumen`, { method: 'POST', body: fd })).status, 400);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(fs.readdirSync(path.join(dir, 'uploads')).length, before);
});
await ok('dokumen: nombor wajib, amaun tak sah ditolak', async () => {
  const fd = new FormData(); fd.set('jenis', 'Invois'); fd.set('nombor', ''); fd.set('tarikh', dateOffset(0));
  assert.equal((await req(`/tempat/${id}/dokumen`, { method: 'POST', body: fd })).status, 400);
  const fd2 = new FormData(); fd2.set('jenis', 'Invois'); fd2.set('nombor', '1'); fd2.set('tarikh', dateOffset(0)); fd2.set('amaun', 'abc');
  assert.equal((await req(`/tempat/${id}/dokumen`, { method: 'POST', body: fd2 })).status, 400);
});
await ok('laporan kerja kemas kini cucian terakhir', async () => {
  const fd = new FormData(); fd.set('jenis', 'Laporan kerja'); fd.set('nombor', 'LK-2026-012'); fd.set('tarikh', '2026-10-02'); fd.set('kemas_cuci', '1'); fd.set('status', 'Pelanggan');
  assert.equal((await req(`/tempat/${id}/dokumen`, { method: 'POST', body: fd })).status, 303);
  const det = await (await req(`/tempat/${id}`)).text();
  assert.ok(det.includes('b-pelanggan'));
  const ed = await (await req(`/tempat/${id}/edit`)).text();
  assert.ok(ed.includes('value="2026-10-02"'));
});
await ok('edit dokumen: ganti lampiran buang fail lama', async () => {
  const before = fs.readdirSync(path.join(dir, 'uploads')).sort();
  const fd = new FormData();
  fd.set('jenis', 'Quotation'); fd.set('nombor', 'AHCS/QT/2026/0047'); fd.set('tarikh', dateOffset(0)); fd.set('amaun', '1400');
  fd.set('fail', new Blob([PDF], { type: 'application/pdf' }), 'v2.pdf');
  assert.equal((await req(`/dokumen/${dokId}`, { method: 'POST', body: fd })).status, 303);
  await new Promise((r) => setTimeout(r, 150));
  const after = fs.readdirSync(path.join(dir, 'uploads')).sort();
  assert.equal(after.length, before.length);
  assert.notDeepEqual(after, before);
  assert.ok((await (await req(`/tempat/${id}`)).text()).includes('RM 1,400.00'));
});
await ok('perkhidmatan Lain-lain: dokumen ya, butang WA tidak', async () => {
  const fd = new FormData(); fd.set('jenis', 'Quotation'); fd.set('nombor', 'Q-TANDAS-1'); fd.set('tarikh', dateOffset(0)); fd.set('perkhidmatan', 'Lain-lain'); fd.set('catatan', 'Renovation tandas');
  assert.equal((await req(`/tempat/${id}/dokumen`, { method: 'POST', body: fd })).status, 303);
  const det = await (await req(`/tempat/${id}`)).text();
  assert.ok(det.includes('Q-TANDAS-1 (Lain-lain) dihantar'));
  assert.ok(!/name="tujuan" value="lain"/.test(det), 'tiada butang WA Lain-lain');
  assert.equal((await req(`/tempat/${id}/wa`, form({ pic: '', tujuan: 'lain' }))).status, 400);
});
await ok('dokumen perlu sesi', async () => { assert.equal((await fetch(`${base}/dokumen/${dokId}/fail`, { redirect: 'manual' })).status, 303); });

console.log('Tetapan');
await ok('ubah teks WA + nama status', async () => {
  const r = await req('/tetapan', form({ penghantar: 'Abu Abbas', wa_karpet: 'Salam [PIC], saya [penghantar]. Untuk [masjid].', wa_cuci: '', wa_vacuum: '', hayat_karpet: '10', cuci_awal_hari: '21', status_0: 'Baru', status_1: 'Dah dihubungi', status_2: 'Dilawat', status_3: 'Sebut harga', status_4: 'Pelanggan', status_5: 'Tidak berminat' }));
  assert.equal(r.status, 303);
  const list = await (await req('/tempat')).text();
  assert.ok(list.includes('Sebut harga'));
  const det = await (await req(`/tempat/${id}`)).text();
  const pid = [...det.matchAll(/\/pic\/(\d+)\/edit/g)].map((m) => m[1]);
  // aktifkan semula Ustaz Ahmad
  await req(`/pic/${pid[0]}`, form({ nama: 'Ustaz Ahmad', telefon: '012-904 6605', status: 'Aktif' }));
  const w = await req(`/tempat/${id}/wa`, form({ pic: pid[0], tujuan: 'karpet' }));
  const text = decodeURIComponent(w.headers.get('location').split('text=')[1]);
  assert.ok(text.startsWith('Salam Ustaz Ahmad, saya Abu Abbas. Untuk '));
  const w2 = await req(`/tempat/${id}/wa`, form({ pic: pid[0], tujuan: 'cuci' }));
  assert.ok(decodeURIComponent(w2.headers.get('location')).includes('servis cucian karpet'), 'kosong = teks asal');
});
await ok('status pendua ditolak', async () => {
  const r = await req('/tetapan', form({ hayat_karpet: '8', cuci_awal_hari: '14', status_0: 'Sama', status_1: 'sama' }));
  assert.equal(r.status, 400);
});
await ok('tukar kata laluan: sesi lama tamat', async () => {
  const old = cookie;
  assert.equal((await req('/tetapan/kata-laluan', form({ semasa: 'salah', baru: 'baharu-12345', ulang: 'baharu-12345' }))).status, 400);
  const r = await req('/tetapan/kata-laluan', form({ semasa: 'kata-uji-12345', baru: 'baharu-12345', ulang: 'baharu-12345' }));
  assert.equal(r.status, 303);
  cookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base + '/', { redirect: 'manual', headers: { cookie: old } })).status, 303, 'cookie lama ditolak');
  assert.equal((await req('/')).status, 200);
});

console.log('Senarai, import, eksport');
await ok('carian & tapis', async () => {
  assert.ok((await (await req('/tempat?q=Pelanggan')).text()).includes('Masjid Pelanggan'));
  assert.ok(!(await (await req('/tempat?q=Pelanggan&jenis=Surau')).text()).includes('Masjid Pelanggan'));
  assert.ok((await (await req('/tempat?q=%25')).text()).includes('Tiada rekod'), '% dilayan sebagai literal');
  assert.equal((await req('/tempat?page=999&status=zzz')).status, 200);
});
await ok('import CSV (semicolon, dup, tanpa nama)', async () => {
  const csv = 'Nama;Jenis;Daerah;Alamat;Telefon;PIC;Jawatan_PIC;Telefon_PIC\nSurau Al-Hidayah;surau;Klang;Jln A;;Ali;Bilal;0123456789\nSURAU AL-HIDAYAH;surau;klang;;;;;\n;;;;;;;\nMasjid Jamek;;Gombak;"Jln B, Taman C";03-1111 2222;;;\n';
  const fd = new FormData();
  fd.append('fail', new Blob([csv], { type: 'text/csv' }), 'x.csv');
  const r = await req('/import', { method: 'POST', body: fd });
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /<b>2<\/b> rekod ditambah, <b>1<\/b> dilangkau/);
  const list = await (await req('/tempat?q=Hidayah')).text();
  assert.ok(list.includes('Surau Al-Hidayah'));
  assert.ok((await (await req('/tempat?q=Jamek')).text()).includes('Masjid · Gombak'));
});
await ok('import: status, catatan, banyak PIC', async () => {
  const csv = 'nama,jenis,daerah,status,catatan,follow_up,pic,jawatan_pic,telefon_pic,pic2,jawatan_pic2,telefon_pic2\nMasjid Multi,Masjid,KL,dah dihubungi,Saiz 1000 kp,2026-01-05,Hj A,Nazir,0123456789,Ust B,Imam,0198765432\nSurau Pelik,Surau,KL,zzz,,,,,,,,\n';
  const fd = new FormData(); fd.append('fail', new Blob([csv]), 'x.csv');
  const html = await (await req('/import', { method: 'POST', body: fd })).text();
  assert.ok(html.includes('status &quot;zzz&quot; tidak dikenali'));
  const list = await (await req('/tempat?q=Multi')).text();
  const mid = list.match(/\/tempat\/(\d+)"/)[1];
  const det = await (await req(`/tempat/${mid}`)).text();
  assert.ok(det.includes('Hj A') && det.includes('Ust B') && det.includes('Saiz 1000 kp') && det.includes('b-dah-dihubungi'));
  assert.ok((await (await req('/')).text()).includes('Masjid Multi'), 'follow_up diimport -> Hari ini');
});
await ok('import tanpa lajur nama ditolak', async () => {
  const fd = new FormData(); fd.append('fail', new Blob(['a,b\n1,2\n']), 'x.csv');
  assert.equal((await req('/import', { method: 'POST', body: fd })).status, 400);
});
await ok('eksport CSV selamat formula', async () => {
  await req('/tempat', form({ jenis: 'Surau', nama: '=HYPERLINK("http://x")' }));
  const buf = Buffer.from(await (await req('/eksport.csv')).arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM UTF-8 untuk Excel');
  const t = buf.toString('utf8');
  assert.ok(t.includes("\"'=HYPERLINK"));
  assert.ok(t.includes('jenis,nama'));
});
await ok('sandaran sah (SQLite)', async () => {
  const b = Buffer.from(await (await req('/sandaran.db')).arrayBuffer());
  assert.equal(b.subarray(0, 15).toString(), 'SQLite format 3');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(fs.readdirSync(dir).filter((f) => f.startsWith('sandaran-')).length, 0, 'fail sementara dibersihkan');
});

await ok('sandaran penuh tar.gz ada db + lampiran', async () => {
  const zlib = await import('node:zlib');
  const b = zlib.gunzipSync(Buffer.from(await (await req('/sandaran-penuh.tar.gz')).arrayBuffer()));
  assert.equal(b.subarray(0, 8).toString(), 'masjid.d');
  assert.equal(b.subarray(512, 527).toString(), 'SQLite format 3');
  assert.ok(b.includes(Buffer.from('%PDF-1.4')), 'PDF dalam sandaran');
  assert.equal(b.subarray(257, 262).toString(), 'ustar');
});

console.log('Negeri & daerah');
await ok('borang: daerah mesti rasmi & dalam negeri dipilih', async () => {
  const r = await req('/tempat', form({ jenis: 'Masjid', nama: 'Masjid Lokasi Uji', negeri: 'Selangor', daerah: 'Klang' }));
  assert.equal(r.status, 303);
  const lid = idFrom(r.headers.get('location'));
  assert.ok((await (await req(`/tempat/${lid}`)).text()).includes('Klang, Selangor'));
  assert.equal((await req(`/tempat/${lid}`, form({ jenis: 'Masjid', nama: 'Masjid Lokasi Uji', negeri: 'W.P. Kuala Lumpur', daerah: 'Petaling' }))).status, 400);
  assert.equal((await req('/tempat', form({ jenis: 'Masjid', nama: 'X', daerah: 'Shah Alam' }))).status, 400);
  const r2 = await req('/tempat', form({ jenis: 'Masjid', nama: 'Masjid Daerah Sahaja', daerah: 'hulu langat' }));
  assert.ok((await (await req(r2.headers.get('location'))).text()).includes('Hulu Langat, Selangor'), 'negeri diisi dari daerah');
  assert.ok((await (await req('/tempat?negeri=Selangor&daerah=Klang')).text()).includes('Masjid Lokasi Uji'));
});
await ok('import: negeri dalam lajur daerah dipindah, bandar ke alamat', async () => {
  const csv = 'nama,negeri,daerah,alamat\nMasjid Imp KL,,Kuala Lumpur,\nMasjid Imp Bandar,Selangor,Shah Alam,Jln 1\nMasjid Imp Sepang,,Sepang,\n';
  const fd = new FormData(); fd.append('fail', new Blob([csv]), 'x.csv');
  const html = await (await req('/import', { method: 'POST', body: fd })).text();
  assert.ok(html.includes('bukan daerah rasmi'));
  const det = async (q) => { const l = await (await req('/tempat?q=' + encodeURIComponent(q))).text(); return (await req(`/tempat/${l.match(/\/tempat\/(\d+)"/)[1]}`)).text(); };
  assert.ok((await det('Imp KL')).includes('W.P. Kuala Lumpur'));
  const b = await det('Imp Bandar');
  assert.ok(b.includes('Jln 1, Shah Alam') && b.includes('· Selangor'));
  assert.ok((await det('Imp Sepang')).includes('Sepang, Selangor'));
});
await ok('migrasi v5 betulkan rekod lama', async () => {
  const { execFileSync } = await import('node:child_process');
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'masjid-mig-'));
  const env = { ...process.env, DATA_DIR: d2 };
  execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', `const {db}=await import('./db.js');
    db.exec("DROP INDEX idx_tempat_negeri; ALTER TABLE tempat DROP COLUMN negeri; PRAGMA user_version=3");
    for (const [n,d,a] of [['A','Selangor',null],['B','Shah Alam','Jln 2'],['C','Petaling',null],['D','Kuala Lumpur',null],['E','ZON 5',null]]) db.prepare("INSERT INTO tempat (jenis,nama,daerah,alamat) VALUES ('Masjid',?,?,?)").run(n,d,a);`], { env });
  const out = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', `const {db}=await import('./db.js'); console.log(JSON.stringify(db.prepare('SELECT nama,negeri,daerah,alamat FROM tempat ORDER BY nama').all()))`], { env });
  fs.rmSync(d2, { recursive: true, force: true });
  assert.deepEqual(JSON.parse(String(out)).map((r) => [r.nama, r.negeri, r.daerah, r.alamat]), [
    ['A', 'Selangor', null, null], ['B', null, null, 'Jln 2, Shah Alam'], ['C', 'Selangor', 'Petaling', null], ['D', 'W.P. Kuala Lumpur', null, null], ['E', null, null, 'ZON 5']]);
});

console.log('Barang dibekalkan');
await ok('vacuum: filter lewat masuk Hari ini, Filter dibeli padam peringatan', async () => {
  const r = await req('/tempat', form({ jenis: 'Masjid', nama: 'Masjid Vakum Uji', status: 'Pelanggan' }));
  const vid = idFrom(r.headers.get('location'));
  const b = await req(`/tempat/${vid}/barang`, form({ jenis: 'Vacuum', butiran: 'SEBO BS36', unit: '2', penggunaan: 'Digunakan', filter_terakhir: dateOffset(-200) }));
  assert.equal(b.status, 303);
  let home = await (await req('/')).text();
  assert.ok(home.includes('Masjid Vakum Uji') && home.includes('Filter beg SEBO BS36'));
  const det = await (await req(`/tempat/${vid}`)).text();
  assert.ok(det.includes('Barang dibekalkan') && det.includes('SEBO BS36'));
  const bid = det.match(/\/barang\/(\d+)\/filter/)[1];
  assert.equal((await req(`/barang/${bid}/filter`, form({}))).status, 303);
  home = await (await req('/')).text();
  assert.ok(!home.includes('Filter beg SEBO BS36'), 'peringatan hilang selepas beli');
  assert.ok((await (await req(`/tempat/${vid}`)).text()).includes('Filter beg SEBO BS36 dibeli'));
});
await ok('vacuum Tidak pasti: tiada peringatan; karpet guna tarikh pasang', async () => {
  const r = await req('/tempat', form({ jenis: 'Surau', nama: 'Surau Karpet Uji', status: 'Pelanggan' }));
  const sid = idFrom(r.headers.get('location'));
  await req(`/tempat/${sid}/barang`, form({ jenis: 'Vacuum', butiran: 'SEBO Lama', penggunaan: 'Tidak pasti', filter_terakhir: dateOffset(-400) }));
  await req(`/tempat/${sid}/barang`, form({ jenis: 'Karpet', butiran: 'Karpet Turki', keluasan_kp: '5000', tarikh: '2012-03-01' }));
  const home = await (await req('/')).text();
  assert.ok(!home.includes('Filter beg SEBO Lama'));
  assert.ok(home.includes('Karpet Turki dipasang 01/03/2012'));
  assert.equal((await req(`/tempat/${sid}/barang`, form({ jenis: 'Kerusi' }))).status, 400);
});
await ok('import kemas: tambah ke rekod sedia ada, tiada pendua', async () => {
  const csv = 'nama,pic,jawatan_pic,telefon_pic,pic2,follow_up,vacuum_model,vacuum_unit,vacuum_catatan\nmasjid vakum uji,Hj Baru,PIC vacuum,0171112222,Siak Tanpa Nombor,2026-01-02,SEBO,3,Senarai 2024\nMasjid Baru SEBO,,,,,,SEBO,1,\n';
  const send = async () => { const fd = new FormData(); fd.set('kemas', '1'); fd.append('fail', new Blob([csv]), 'x.csv'); return (await req('/import', { method: 'POST', body: fd })).text(); };
  const html = await send();
  assert.match(html, /<b>1<\/b> rekod ditambah/);
  await send();
  const list = await (await req('/tempat?q=Vakum%20Uji')).text();
  const vid = list.match(/\/tempat\/(\d+)"/)[1];
  const det = await (await req(`/tempat/${vid}`)).text();
  assert.equal(det.split('Hj Baru').length - 1, 1, 'PIC tidak berganda');
  assert.equal(det.split('Siak Tanpa Nombor').length - 1, 1, 'PIC tanpa nombor tidak berganda');
  assert.equal((det.match(/Senarai 2024/g) || []).length, 1, 'vacuum tidak berganda');
  assert.equal((await (await req('/tempat?q=Baru%20SEBO')).text()).split('Masjid Baru SEBO').length > 1, true);
});

console.log('Padam');
await ok('padam lawatan buang fail foto', async () => {
  const html = await (await req(`/tempat/${id}`)).text();
  const lid = html.match(/\/lawatan\/(\d+)\/padam/)[1];
  assert.equal((await req(`/lawatan/${lid}/padam`, { method: 'POST' })).status, 303);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(fs.readdirSync(path.join(dir, 'uploads')).filter((f) => !f.endsWith('.pdf')).length, 0);
});
await ok('padam rekod cascade', async () => {
  assert.equal((await req(`/tempat/${id}/padam`, { method: 'POST' })).status, 303);
  assert.equal((await req(`/tempat/${id}`)).status, 404);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(fs.readdirSync(path.join(dir, 'uploads')).length, 0, 'PDF dokumen turut dibuang');
});

srv.kill();
fs.rmSync(dir, { recursive: true, force: true });
console.log(process.exitCode ? '\nADA YANG GAGAL' : `\nSemua ${pass} ujian lulus`);
