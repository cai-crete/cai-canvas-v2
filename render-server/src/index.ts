import express from 'express';
import cors from 'cors';
import { verifySecret } from './middleware/verifySecret';
import sketchToImageRouter    from './routes/sketchToImage';
import sketchToPlanRouter     from './routes/sketchToPlan';
import imageToElevationRouter from './routes/imageToElevation';
import changeViewpointRouter  from './routes/changeViewpoint';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'https://cai-canvas-v2-jw.vercel.app',
      'http://localhost:3000',
    ];
    if (!origin || allowed.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
}));

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api', verifySecret);
app.use('/api/sketch-to-image',    sketchToImageRouter);
app.use('/api/sketch-to-plan',     sketchToPlanRouter);
app.use('/api/image-to-elevation', imageToElevationRouter);
app.use('/api/change-viewpoint',   changeViewpointRouter);

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`[render-server] listening on port ${PORT}`));
