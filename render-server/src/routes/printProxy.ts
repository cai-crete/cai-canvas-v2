import { Router, Request, Response } from 'express';

const router = Router();

const RETRY_DELAYS_MS = [20_000, 20_000]; // 최대 2회 재시도 (Render 웨이크업 대기)

async function proxyToPrint(req: Request, res: Response): Promise<void> {
  const PRINT_API_URL    = process.env.PRINT_API_URL?.replace(/\/+$/, '');
  const CANVAS_API_SECRET = process.env.CANVAS_API_SECRET;

  if (!PRINT_API_URL) {
    res.status(503).json({ error: 'PRINT_API_URL not configured' });
    return;
  }

  const subPath  = (req.params as Record<string, string>)[0] ?? '';
  const search   = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = `${PRINT_API_URL}/${subPath}${search}`;

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() !== 'host' && typeof value === 'string') {
      headers[key] = value;
    }
  }
  if (CANVAS_API_SECRET) headers['x-canvas-api-secret'] = CANVAS_API_SECRET;

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body    = hasBody && Buffer.isBuffer(req.body) ? req.body : undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const upstream = await fetch(targetUrl, { method: req.method, headers, body });

      // Render 무료 티어 웨이크업 중 반환하는 502/503: 재시도
      if ((upstream.status === 502 || upstream.status === 503) && attempt < RETRY_DELAYS_MS.length) {
        console.log(`[print-proxy] upstream ${upstream.status}, retrying in ${RETRY_DELAYS_MS[attempt]}ms (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }

      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'content-encoding') res.setHeader(key, value);
      });

      const buf = await upstream.arrayBuffer();
      res.end(Buffer.from(buf));
      return;
    } catch (err) {
      if (attempt < RETRY_DELAYS_MS.length) {
        console.log(`[print-proxy] fetch error, retrying in ${RETRY_DELAYS_MS[attempt]}ms:`, err);
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      res.status(502).json({
        error: `Print server connection failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

router.all('/*', proxyToPrint);

export default router;
