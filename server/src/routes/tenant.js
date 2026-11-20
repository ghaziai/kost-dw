// Rute PENYEWA (/api/tenant/*): hanya data milik penyewa yang login.
import { Router } from 'express';
import * as tenant from '../services/tenant.js';
import * as catalog from '../services/catalog.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';

export const tenantRoutes = Router();
tenantRoutes.use(authenticate, requireRole('tenant'));

// Penyewa melihat SEMUA kost beserta kontak pemilik (memilih kost & menghubungi pemilik)
tenantRoutes.get('/kost', wrap(async (req, res) => res.json(await catalog.listKost(req.query, { withContact: true }))));
tenantRoutes.get('/kost/:id', wrap(async (req, res) => res.json(await catalog.getKost(req.params.id, { withContact: true }))));
tenantRoutes.get('/contracts', wrap(async (req, res) => res.json(await tenant.listContracts(req.user.id))));
tenantRoutes.get('/rooms', wrap(async (req, res) => res.json(await tenant.listMyRooms(req.user.id))));
tenantRoutes.get('/invoices', wrap(async (req, res) => res.json(await tenant.listInvoices(req.user.id))));
tenantRoutes.get('/complaints', wrap(async (req, res) => res.json(await tenant.listComplaints(req.user.id))));
tenantRoutes.post('/complaints', wrap(async (req, res) => res.status(201).json(await tenant.createComplaint(req.user.id, req.body ?? {}))));
