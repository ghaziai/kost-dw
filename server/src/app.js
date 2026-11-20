import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './routes/auth.js';
import { ownerRoutes } from './routes/owner.js';
import { tenantRoutes } from './routes/tenant.js';
import { publicRoutes } from './routes/public.js';
import compression from 'compression';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { today } from './lib/dates.js';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    next();
  });

  app.get('/api/meta', (_req, res) => res.json({ today: today() }));
  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/owner', ownerRoutes);
  app.use('/api/tenant', tenantRoutes);
  app.use('/api', notFoundHandler);

  app.use(express.static(webDir));          // frontend vanilla (SPA hash-router, tidak perlu fallback)
  app.use(errorHandler);
  return app;
}
