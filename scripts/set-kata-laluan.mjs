// Tetapkan / set semula kata laluan pengguna tanpa memulakan server.
// Guna: DATA_DIR=/var/lib/pangkalan-masjid node scripts/set-kata-laluan.mjs [nama_pengguna]
// Kata laluan dibaca dari stdin (tidak disimpan dalam sejarah shell).
import readline from 'node:readline';
const nama = (process.argv[2] || 'abuabbas').toLowerCase();
const rl = readline.createInterface({ input: process.stdin });
const pw = await new Promise((res) => rl.once('line', (l) => { rl.close(); res(l); }));
process.env.APP_USERNAME = nama;
process.env.APP_PASSWORD = pw;
const auth = await import('../auth.js');
auth.initUsers();
console.log(`Kata laluan untuk "${nama}" ditetapkan. Semua sesi lama tamat.`);
