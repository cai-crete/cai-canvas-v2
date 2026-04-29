import express from 'express';
import cors from 'cors';
import { verifySecret } from './middleware/verifySecret';
import sketchToImageRouter    from './routes/sketchToImage';
import sketchToPlanRouter     from './routes/sketchToPlan';
import imageToElevationRouter from './routes/imageToElevation';
import changeViewpointRouter  from './routes/changeViewpoint';
import printProxyRouter       from './routes/printProxy';

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) { callback(null, true); return; }
    if (origin.endsWith('.vercel.app') || origin === 'http://localhost:3000') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// print-proxy: raw body (multipart 포함), 인증 없음 (print 서버 자체 auth로 보호)
app.use('/print-proxy', express.raw({ type: '*/*', limit: '50mb' }));
app.use('/print-proxy', printProxyRouter);

// AI routes: JSON body + internal secret
app.use('/api', express.json({ limit: '50mb' }));
app.use('/api', verifySecret);
app.use('/api/sketch-to-image',    sketchToImageRouter);
app.use('/api/sketch-to-plan',     sketchToPlanRouter);
app.use('/api/image-to-elevation', imageToElevationRouter);
app.use('/api/change-viewpoint',   changeViewpointRouter);

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`[render-server] listening on port ${PORT}`);

  const PRINT_API_URL = process.env.PRINT_API_URL?.replace(/\/+$/, '');
  const CANVAS_API_SECRET = process.env.CANVAS_API_SECRET ?? '';
  if (PRINT_API_URL) {
    const pingPrint = () => {
      fetch(`${PRINT_API_URL}/api/library`, {
        headers: { 'x-canvas-api-secret': CANVAS_API_SECRET },
      }).catch(() => {});
    };
    pingPrint();                          // 시작 즉시 Render B 웨이크업
    setInterval(pingPrint, 8 * 60 * 1000); // 이후 8분마다
  }
});
