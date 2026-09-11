/**
 * Express server - mot service duy nhat vua serve trang static vua host API.
 * Khong build step: public/index.html chay truc tiep.
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRateLimiter } from './middleware/rateLimit.js';
import { createFortuneRouter } from './routes/fortune.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export function createApp({ deps = {} } = {}) {
  const app = express();

  app.set('trust proxy', 1); // Render dat sau proxy, can de req.ip dung
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  app.use('/api', createRateLimiter(), createFortuneRouter({ deps }));

  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  // Error handler cuoi cung - khong bao gio de lo API key ra response
  app.use((err, _req, res, _next) => {
    console.error('Loi chua duoc xu ly:', err?.message);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Có lỗi không mong đợi xảy ra' },
    });
  });

  return app;
}

// Chi listen khi chay truc tiep, khong listen khi bi import trong test.
// Phai dung pathToFileURL: tu ghep 'file://' + duong dan Windows se ra hai dau
// gach (file://D:/...) trong khi import.meta.url co ba (file:///D:/...) nen
// khong bao gio khop, va server se im lang thoat thay vi listen.
const isDirectRun = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const port = Number(process.env.PORT) || 3000;
  const server = createApp().listen(port, () => {
    console.info(`Server chay tai http://localhost:${port}`);
    if (!process.env.GEMINI_API_KEY) {
      console.warn('Canh bao: chua set GEMINI_API_KEY — request se that bai o buoc sinh van ban.');
    }
  });

  // BR-12: ngan sach worst case 115s, Node phai khong tu dong dong socket truoc do
  server.keepAliveTimeout = 180_000;
  server.headersTimeout = 180_000;
  server.requestTimeout = 180_000;
}
