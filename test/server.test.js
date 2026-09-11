/**
 * Test khoi dong process thuc te.
 *
 * Cac test khac goi createApp() truc tiep trong process, nen chung di vong qua
 * khoi `if (isDirectRun)` o cuoi src/server.js. Da tung co lo hong o dung cho do:
 * guard so sanh `file://` + duong dan Windows voi import.meta.url, hai chuoi
 * khac so dau gach nen khong bao gio khop -> `npm start` im lang thoat thay vi
 * listen. Test nay spawn `node src/server.js` that de bat lai loai loi do.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'src', 'server.js');

// Moi test mot port rieng: kill() la bat dong bo, dung chung port se gap
// EADDRINUSE o test sau.
let nextPort = 3190;

function startServer() {
  const port = nextPort += 1;
  const child = spawn(process.execPath, [ENTRY], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (b) => { output += b.toString(); });
  child.stderr.on('data', (b) => { output += b.toString(); });

  const ready = new Promise((resolve, reject) => {
    // MOI nhanh ket thuc phai clear ca timer va poll, neu khong interval con song
    // se giu event loop cua test runner mo vo han.
    let timer;
    let poll;
    const done = (fn, arg) => { clearTimeout(timer); clearInterval(poll); fn(arg); };

    timer = setTimeout(
      () => done(reject, new Error(`Server khong in ra dong khoi dong trong 8s. Output:\n${output}`)),
      8000,
    );
    // Neu process thoat truoc khi listen -> chinh la bug guard di tim
    child.once('exit', (code) => {
      if (!output.includes('Server chay tai')) {
        done(reject, new Error(`Server thoat voi code ${code} thay vi listen. Output:\n${output}`));
      }
    });
    poll = setInterval(() => {
      if (output.includes('Server chay tai')) done(resolve);
    }, 50);
  });

  // `connection: close` de undici khong giu keep-alive socket sau khi kill child
  const get = (p) => fetch(`http://127.0.0.1:${port}${p}`, { headers: { connection: 'close' } });

  return { child, ready, port, get, getOutput: () => output };
}

/** Doi child thoat that su truoc khi sang test tiep theo. */
function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
  });
}

test('npm start: process listen that su, khong im lang thoat', async () => {
  const { child, ready, port, get, getOutput } = startServer();
  try {
    await ready;
    assert.match(getOutput(), new RegExp(`Server chay tai http://localhost:${port}`));

    const health = await get('/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');

    const page = await get('/');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<title>Xem Vận Mệnh Ngày<\/title>/);
    assert.match(html, /id="form"/);
    assert.ok(!html.includes('GEMINI_API_KEY'), 'HTML khong duoc chua ten bien API key');

    const canchi = await get('/api/canchi/1994');
    assert.equal((await canchi.json()).data.canChi, 'Giáp Tuất');
  } finally {
    await stop(child);
  }
});

test('khong co GEMINI_API_KEY thi canh bao nhung van khoi dong', async () => {
  const { child, ready, getOutput } = startServer();
  try {
    await ready;
    assert.match(getOutput(), /chua set GEMINI_API_KEY/);
  } finally {
    await stop(child);
  }
});
