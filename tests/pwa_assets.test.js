import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';

test('C025 PWA icons are real PNG files at their declared dimensions', async () => {
  for (const [file, size] of [['pwa-192x192.png', 192], ['pwa-512x512.png', 512]]) {
    const full = path.join(root, 'public', file);
    const buffer = fs.readFileSync(full);
    assert.deepEqual(buffer.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), `${file} must start with the real PNG signature`);
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, size, `${file} width`);
    assert.equal(metadata.height, size, `${file} height`);
  }
});

test('C025 there is exactly one manifest source: the generated PWA manifest, not a stale public/manifest.webmanifest', () => {
  assert.equal(fs.existsSync(path.join(root, 'public', 'manifest.webmanifest')), false, 'a static public/manifest.webmanifest would silently diverge from vite.config.ts and never be served (vite-plugin-pwa overwrites it at build time)');
  const config = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
  assert.match(config, /manifest:\s*\{/, 'vite.config.ts must declare the single VitePWA manifest source');
});
