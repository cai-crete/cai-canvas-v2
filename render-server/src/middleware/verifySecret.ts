import type { Request, Response, NextFunction } from 'express';

export function verifySecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
