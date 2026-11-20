// Rute OWNER (/api/owner/*). Handler tipis: seluruh logika ada di services.
import { Router } from 'express';
import * as owner from '../services/owner.js';
import * as analytics from '../services/analytics.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';

export const ownerRoutes = Router();
ownerRoutes.use(authenticate, requireRole('owner'));

const uid = (req) => req.user.id;
const body = (req) => req.body ?? {};

// properti
ownerRoutes.get('/properties', wrap(async (req, res) => res.json(await owner.listProperties(uid(req)))));
ownerRoutes.post('/properties', wrap(async (req, res) => res.status(201).json(await owner.createProperty(uid(req), body(req)))));
ownerRoutes.put('/properties/:id', wrap(async (req, res) => res.json(await owner.updateProperty(uid(req), req.params.id, body(req)))));
ownerRoutes.delete('/properties/:id', wrap(async (req, res) => { await owner.deleteProperty(uid(req), req.params.id); res.status(204).end(); }));

// kamar
ownerRoutes.get('/rooms', wrap(async (req, res) => res.json(await owner.listRooms(uid(req), req.query))));
ownerRoutes.post('/rooms', wrap(async (req, res) => res.status(201).json(await owner.createRoom(uid(req), body(req)))));
ownerRoutes.put('/rooms/:id', wrap(async (req, res) => res.json(await owner.updateRoom(uid(req), req.params.id, body(req)))));
ownerRoutes.delete('/rooms/:id', wrap(async (req, res) => { await owner.deleteRoom(uid(req), req.params.id); res.status(204).end(); }));

// penyewa & kontrak
ownerRoutes.get('/tenants', wrap(async (req, res) => res.json(await owner.searchTenants(req.query))));
ownerRoutes.get('/contracts', wrap(async (req, res) => res.json(await owner.listContracts(uid(req), req.query))));
ownerRoutes.post('/contracts', wrap(async (req, res) => res.status(201).json(await owner.createContract(uid(req), body(req)))));
ownerRoutes.post('/contracts/:id/terminate', wrap(async (req, res) => res.json(await owner.terminateContract(uid(req), req.params.id, body(req)))));

// tagihan & pembayaran
ownerRoutes.get('/invoices', wrap(async (req, res) => res.json(await owner.listInvoices(uid(req), req.query))));
ownerRoutes.post('/billing/run', wrap(async (req, res) => res.json(await owner.runBilling(uid(req), body(req)))));
ownerRoutes.post('/invoices/:id/payments', wrap(async (req, res) => res.status(201).json(await owner.recordPayment(uid(req), req.params.id, body(req)))));

// pengaduan
ownerRoutes.get('/complaints', wrap(async (req, res) => res.json(await owner.listComplaints(uid(req), req.query))));
ownerRoutes.patch('/complaints/:id', wrap(async (req, res) => res.json(await owner.updateComplaint(uid(req), req.params.id, body(req)))));

// analitik (dibaca dari Data Warehouse)
ownerRoutes.get('/analytics/meta', wrap(async (req, res) => res.json(await analytics.meta(uid(req)))));
ownerRoutes.get('/analytics', wrap(async (req, res) => res.json(await analytics.dashboard(uid(req), req.query))));
