// Sandaran penuh: pangkalan data + semua fail (foto, PDF) dalam satu fail .tar.gz.
// Format tar ustar ditulis sendiri supaya tiada pakej tambahan.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function header(name, size, mtime) {
  const b = Buffer.alloc(512, 0);
  const put = (str, off, len) => b.write(str, off, len, 'utf8');
  const oct = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
  put(name, 0, 100);
  put(oct(0o644, 8), 100, 8);
  put(oct(0, 8), 108, 8);
  put(oct(0, 8), 116, 8);
  put(oct(size, 12), 124, 12);
  put(oct(Math.floor(mtime / 1000), 12), 136, 12);
  b.fill(' ', 148, 156); // ruang checksum semasa dikira
  put('0', 156, 1);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  let sum = 0;
  for (const x of b) sum += x;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return b;
}

// files: [{ name, path }]. Menulis ke stream `out` (cth. res). Pulang Promise.
export async function writeTarGz(files, out) {
  const gz = zlib.createGzip({ level: 6 });
  gz.pipe(out);
  const write = (buf) => new Promise((res) => (gz.write(buf) ? res() : gz.once('drain', res)));
  for (const f of files) {
    let st;
    try { st = fs.statSync(f.path); } catch { continue; }
    if (!st.isFile()) continue;
    await write(header(f.name, st.size, st.mtimeMs));
    for await (const chunk of fs.createReadStream(f.path)) await write(chunk);
    const pad = (512 - (st.size % 512)) % 512;
    if (pad) await write(Buffer.alloc(pad, 0));
  }
  await write(Buffer.alloc(1024, 0));
  await new Promise((res) => gz.end(res));
}

export function listUploads(dir) {
  return fs.readdirSync(dir).filter((n) => /^[a-f0-9]{32}\.[a-z]+$/.test(n)).map((n) => ({ name: 'uploads/' + n, path: path.join(dir, n) }));
}
