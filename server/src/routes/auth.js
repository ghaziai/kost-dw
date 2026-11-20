import { Router } from 'express';
import * as auth from '../services/auth.js';
import { authenticate } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';

export const authRoutes = Router();

authRoutes.post('/register', wrap(async (req, res) => res.status(201).json(await auth.register(req.body ?? {}))));
authRoutes.post('/login', wrap(async (req, res) => res.json(await auth.login(req.body ?? {}))));
authRoutes.get('/me', authenticate, wrap(async (req, res) => res.json(await auth.me(req.user.id))));
