#!/usr/bin/env bash
# Ambil versi terbaru dari GitHub dan mula semula app. Jalankan sebagai root pada VPS.
set -euo pipefail
APP_DIR=/opt/pangkalan-masjid
export GIT_SSH_COMMAND="ssh -i /root/.ssh/pangkalan_deploy -o IdentitiesOnly=yes"
# Sandaran pangkalan data sebelum kemas kini (migrasi skema berlaku semasa mula)
cd "$APP_DIR" && sudo -u masjid DATA_DIR=/var/lib/pangkalan-masjid /usr/bin/node --no-warnings scripts/sandaran-harian.mjs --kemaskini
git -C "$APP_DIR" pull --ff-only
npm ci --omit=dev --no-audit --no-fund
systemctl restart pangkalan-masjid
sleep 2
curl -fsS -o /dev/null http://127.0.0.1:3000/login && echo "Dikemas kini dan berjalan." || { echo "GAGAL: journalctl -u pangkalan-masjid -n 50"; exit 1; }
