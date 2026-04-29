import { Router, Request, Response } from 'express';

const router = Router();

async function proxyToPrint(req: Request, res: Response): Promise<void> {
  const PRINT_API_URL    = process.env.PRINT_API_URL?.replace(/\/+$/, '');
  const CANVAS_API_SECRET = process.env.CANVAS_API_SECRET;

  if (!PRINT_API_URL) {
    res.status(503).json({ error: 'PRINT_API_URL not configured' });
    return;
  }

  const subPath = (req.params as Record<string, string>)[0] ?? '';
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

  try {
    const upstream = await fetch(targetUrl, { method: req.method, headers, body });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') res.setHeader(key, value);
    });

    const buf = await upstream.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch (err) {
    res.status(502).json({
      error: `Print server connection failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

router.all('/*', proxyToPrint);

export default router;
