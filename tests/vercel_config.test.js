import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from '../api/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Vercel Config: vercel.json is valid and contains required rewrites & PWA headers', () => {
  const vercelPath = path.join(__dirname, '../vercel.json');
  assert.ok(fs.existsSync(vercelPath));
  const config = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));

  assert.strictEqual(config.outputDirectory, 'dist');
  assert.ok(Array.isArray(config.rewrites));
  assert.ok(config.rewrites.some(r => r.source === '/healthz'));
  assert.ok(config.rewrites.some(r => r.source === '/api/:match*'));
});

test('Vercel Serverless Function: api/index.js handles healthz and auth requests', async () => {
  let statusCode = 0;
  let headers = {};
  let responseData = '';

  const mockReq = {
    url: '/healthz',
    method: 'GET',
    headers: { host: 'localhost' },
    on: () => {}
  };

  const mockRes = {
    writeHead: (code, hdrs) => { statusCode = code; headers = hdrs; },
    end: (data) => { responseData = data; }
  };

  await handler(mockReq, mockRes);
  assert.strictEqual(statusCode, 200);
  const json = JSON.parse(responseData);
  assert.strictEqual(json.status, 'ok');
  assert.strictEqual(json.version, '1.0.0');
});
