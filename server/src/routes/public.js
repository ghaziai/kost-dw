// Rute PUBLIK (/api/public/*): tanpa login, tanpa kontak pemilik.
import { Router } from 'express';
import * as catalog from '../services/catalog.js';
import { wrap } from '../middleware/error.js';

export const publicRoutes = Router();
publicRoutes.get('/stats', wrap(async (_req, res) => res.json(await catalog.publicStats())));
publicRoutes.get('/cities', wrap(async (_req, res) => res.json(await catalog.cities())));
publicRoutes.get('/kost', wrap(async (req, res) => res.json(await catalog.listKost(req.query, { withContact: false }))));
publicRoutes.get('/kost/:id', wrap(async (req, res) => res.json(await catalog.getKost(req.params.id, { withContact: false }))));
