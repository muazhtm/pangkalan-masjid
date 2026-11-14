#!/usr/bin/env bash
# Tambah laman web alharomain.my pada Caddy TANPA mengganggu crm.alharomain.my.
# Jalankan sebagai root selepas kod terbaru ditarik (kemaskini.sh). Selamat dijalankan semula.
set -euo pipefail
APP_DIR=/opt/pangkalan-masjid
CF=/etc/caddy/Caddyfile
BAK="$CF.bak-$(date +%Y%m%d-%H%M%S)"

[ "$(id -u)" = 0 ] || { echo "Jalankan sebagai root."; exit 1; }
[ -f "$APP_DIR/website/index.html" ] || { echo "website/index.html tiada. Jalankan deploy/kemaskini.sh dahulu."; exit 1; }
sudo -u caddy test -r "$APP_DIR/website/index.html" || { echo "Caddy tidak boleh baca $APP_DIR/website. Semak kebenaran folder."; exit 1; }

cp -a "$CF" "$BAK"
echo "Sandaran Caddyfile: $BAK"

if grep -q '^alharomain\.my {' "$CF"; then
  echo "Blok alharomain.my sudah ada, dilangkau."
else
  cat "$APP_DIR/deploy/Caddyfile.laman" >> "$CF"
fi

if caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy; then
  echo "Siap. Buka https://alharomain.my dan semak https://crm.alharomain.my masih berfungsi."
else
  echo "GAGAL. Memulihkan Caddyfile asal."
  cp -a "$BAK" "$CF"; systemctl reload caddy || true
  exit 1
fi
