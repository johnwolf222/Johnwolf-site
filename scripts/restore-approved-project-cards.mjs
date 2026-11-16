import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

// Restore ONLY the eight approved artworks archived in this repository.
// The original thirteen .webp images are never touched.
const root = resolve(import.meta.dirname, '..');
const archive = join(root, 'motion-source/hole01-additional-eight-600px.tar.gz.base64');
const target = join(root, 'public/new-homepage/approved-cards');
const tar = gunzipSync(Buffer.from(readFileSync(archive, 'utf8').trim(), 'base64'));
const files = new Map();
for (let offset = 0; offset + 512 <= tar.length;) {
  const header = tar.subarray(offset, offset + 512);
  if (!header.some(Boolean)) break;
  const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
  const octal = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
  const size = parseInt(octal, 8);
  if (!Number.isFinite(size) || size < 0 || size > 8_000_000) {
    throw new Error('Unexpected approved artwork archive entry');
  }
  const from = offset + 512;
  const type = String.fromCharCode(header[156]);
  if (type === 'x' || type === 'g' || name === '././@PaxHeader') {
    // Tar PAX metadata is not artwork; the following member owns the payload.
    offset = from + 512 * Math.ceil(size / 512);
    continue;
  }
  if (/^new-cards\/(?:1[4-9]|2[01])\.avif$/.test(name)) {
    files.set(name.slice(-7), Buffer.from(tar.subarray(from, from + size)));
  } else if (name === 'new-cards/manifest.json') {
    files.set('manifest', JSON.parse(tar.subarray(from, from + size).toString('utf8')));
  } else {
    throw new Error('Unknown file in approved artwork archive: ' + name);
  }
  offset = from + 512 * Math.ceil(size / 512);
}
const manifest = files.get('manifest');
if (!manifest || manifest.artwork_count !== 8 || files.size !== 9) {
  throw new Error('Incomplete archived project artwork');
}
mkdirSync(target, { recursive: true });
for (let i = 14; i <= 21; i++) {
  const name = String(i).padStart(2, '0') + '.avif';
  const data = files.get(name);
  const record = manifest.files.find(row => row.path.endsWith('/' + name));
  if (!data || !record || createHash('sha256').update(data).digest('hex') !== record.sha256) {
    throw new Error('Artwork integrity check failed: ' + name);
  }
  const destination = join(target, name);
  if (!existsSync(destination) ||
    createHash('sha256').update(readFileSync(destination)).digest('hex') !== record.sha256) {
    writeFileSync(destination, data);
  }
}
console.log('Verified all 8 archived artworks; 21 total project images available.');
