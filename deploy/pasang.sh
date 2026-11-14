#!/usr/bin/env bash
# Pasang Pangkalan Masjid pada VPS Ubuntu 24.04 (jalankan sebagai root).
# Selamat dijalankan semula: langkah yang sudah siap dilangkau.
#   DOMAIN=crm.alharomain.my bash pasang.sh
set -euo pipefail

DOMAIN="${DOMAIN:-crm.alharomain.my}"
REPO="git@github.com:muazhtm/pangkalan-masjid.git"
APP_DIR=/opt/pangkalan-masjid
DATA_DIR=/var/lib/pangkalan-masjid
SVC_USER=masjid
KEY=/root/.ssh/pangkalan_deploy

[ "$(id -u)" = 0 ] || { echo "Jalankan sebagai root."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== 1/7 Pakej sistem"
apt-get update -q
apt-get install -y -q curl git ufw ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades
if ! command -v node >/dev/null || ! node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "== 2/7 Firewall (SSH, HTTP, HTTPS sahaja)"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "== 3/7 Kunci akses GitHub (baca sahaja)"
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f "$KEY" ] || ssh-keygen -t ed25519 -N '' -f "$KEY" -C "vps-pangkalan-masjid" >/dev/null
grep -q 'github.com' /root/.ssh/known_hosts 2>/dev/null || ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null
export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes"
until git ls-remote "$REPO" >/dev/null 2>&1; do
  echo
  echo "Salin baris di bawah ke GitHub: repo pangkalan-masjid > Settings > Deploy keys > Add deploy key"
  echo "(Title: VPS. JANGAN tanda 'Allow write access'.)"
  echo
  cat "$KEY.pub"
  echo
  read -r -p "Tekan Enter selepas kunci ditambah... " _
done

echo "== 4/7 Kod"
id "$SVC_USER" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$SVC_USER"
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone "$REPO" "$APP_DIR"; fi
cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund
mkdir -p "$DATA_DIR" && chown -R "$SVC_USER:$SVC_USER" "$DATA_DIR" && chmod 750 "$DATA_DIR"

echo "== 5/7 Akaun abuabbas"
if [ ! -f "$DATA_DIR/masjid.db" ] || ! sudo -u "$SVC_USER" DATA_DIR="$DATA_DIR" node --no-warnings --input-type=module -e "const {db}=await import('$APP_DIR/db.js');process.exit(db.prepare('select count(*) c from pengguna').get().c?0:1)" 2>/dev/null; then
  while true; do
    read -r -s -p "Cipta kata laluan app (min 8 aksara): " P1; echo
    read -r -s -p "Ulang kata laluan: " P2; echo
    [ "$P1" = "$P2" ] && [ ${#P1} -ge 8 ] && break
    echo "Tidak sepadan atau terlalu pendek. Cuba lagi."
  done
  printf '%s\n' "$P1" | sudo -u "$SVC_USER" DATA_DIR="$DATA_DIR" node --no-warnings "$APP_DIR/scripts/set-kata-laluan.mjs" abuabbas
  unset P1 P2
else
  echo "Akaun sudah wujud, dilangkau."
fi

echo "== 6/7 Servis app"
cat > /etc/systemd/system/pangkalan-masjid.service <<EOF
[Unit]
Description=Pangkalan Masjid
After=network.target

[Service]
User=$SVC_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production DATA_DIR=$DATA_DIR HOST=127.0.0.1 PORT=3000 TRUST_PROXY=1 COOKIE_SECURE=1
ExecStart=/usr/bin/node --no-warnings server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/cron.daily/pangkalan-masjid-sandaran <<EOF
#!/bin/sh
cd $APP_DIR && sudo -u $SVC_USER DATA_DIR=$DATA_DIR /usr/bin/node --no-warnings scripts/sandaran-harian.mjs >/dev/null
EOF
chmod 755 /etc/cron.daily/pangkalan-masjid-sandaran
systemctl daemon-reload
systemctl enable --now pangkalan-masjid
systemctl restart pangkalan-masjid

echo "== 7/7 HTTPS ($DOMAIN)"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  request_body {
    max_size 130MB
  }
  header Strict-Transport-Security "max-age=31536000"
  reverse_proxy 127.0.0.1:3000
}
EOF
[ -f "$APP_DIR/deploy/Caddyfile.laman" ] && cat "$APP_DIR/deploy/Caddyfile.laman" >> /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

sleep 2
if curl -fsS -o /dev/null http://127.0.0.1:3000/login; then echo "App berjalan."; else echo "AMARAN: app tidak menjawab. Semak: journalctl -u pangkalan-masjid -n 50"; fi
IP=$(curl -fsS https://api.ipify.org || echo "?")
echo
echo "SIAP. Buka https://$DOMAIN (nama pengguna: abuabbas)."
echo "Jika HTTPS belum jalan, pastikan DNS rekod A '$DOMAIN' -> $IP. Caddy akan cuba semula sendiri."
