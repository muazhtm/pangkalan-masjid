# Pangkalan Masjid

CRM masjid/surau untuk Al Haromain Carpets & Services: senarai masjid/surau, PIC (dengan status), butang WhatsApp
(wa.me, hantar manual), log hubungan, lawatan + ukuran (kaki / kp) + foto, dokumen dihantar (quotation, invois,
laporan kerja dengan lampiran PDF) dan peringatan di halaman "Hari ini".

App ini **tidak** menjana quotation/invois. Dokumen disediakan di projek Claude; app hanya merekod dan menyimpan lampiran.

## Jalankan (komputer sendiri)
Perlu Node 22.13+.

    npm install
    APP_PASSWORD="kata-laluan-min-8" npm start      # http://127.0.0.1:3000, nama pengguna: abuabbas

- `APP_PASSWORD` mencipta pengguna `abuabbas` kali pertama. Jika diberi lagi semasa mula, ia **set semula** kata laluan.
  Di pelayan, guna `scripts/set-kata-laluan.mjs` sahaja (lihat bawah) supaya tukar kata laluan dalam app tidak ditimpa.
- Pilihan: `PORT`, `HOST` (lalai 127.0.0.1), `DATA_DIR`, `APP_USERNAME`, `COOKIE_SECURE=1`, `TRUST_PROXY=1`.
- Ujian: `npm test`

## Pasang pada VPS (Ubuntu 24.04)
Lihat `deploy/pasang.sh` (Node 22, Caddy dengan HTTPS automatik, firewall, servis systemd, sandaran harian).
Kemas kini selepas ada perubahan di GitHub: `bash /opt/pangkalan-masjid/deploy/kemaskini.sh`.

Terlupa kata laluan (di VPS, sebagai root):

    cd /opt/pangkalan-masjid && sudo -u masjid DATA_DIR=/var/lib/pangkalan-masjid node --no-warnings scripts/set-kata-laluan.mjs abuabbas
    # taip kata laluan baharu, Enter

## Data dan sandaran
Semua data dalam `DATA_DIR` (`masjid.db` + `uploads/`).
- Menu Data > **Sandaran penuh** (.tar.gz): pangkalan data + semua PDF + foto. Simpan salinan di Google Drive.
- Di VPS: salinan pangkalan data harian (14 hari) dalam `DATA_DIR/sandaran/`, dan Backups DigitalOcean untuk seluruh pelayan.

## Tetapan dalam app
Teks 3 mesej WhatsApp ([PIC], [penghantar], [masjid]), nama penghantar, hayat karpet, hari peringatan cucian,
nama paparan status, tukar kata laluan. Menambah/membuang status atau skrin baharu = perubahan kod.

## Had semasa
- Face ID (passkey) belum ada: akan ditambah selepas app berjalan di HTTPS (crm.alharomain.my).
- Perlu internet di lapangan (tiada mod luar talian). Foto disimpan saiz asal (maks 12MB setiap satu).
- Tiada notifikasi push/emel; peringatan dipaparkan di "Hari ini".
