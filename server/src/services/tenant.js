// Service sisi PENYEWA: melihat kontrak & tagihan, mengajukan pengaduan.
import { oltp } from '../db.js';
import { contracts, invoices, complaints } from '../repositories/oltp.js';
import { v } from '../lib/validate.js';
import { badRequest } from '../lib/errors.js';
import { today } from '../lib/dates.js';

export const listContracts = (tenantId) => contracts.listByTenant(oltp, tenantId);
export const listInvoices = (tenantId) => invoices.listByTenant(oltp, tenantId);
export const listComplaints = (tenantId) => complaints.listByTenant(oltp, tenantId);
export const listMyRooms = (tenantId) => contracts.tenantRoomsOn(oltp, tenantId, today());

export async function createComplaint(tenantId, body) {
  const roomId = v.id(body.room_id, 'Kamar');
  // Penyewa hanya boleh mengadu untuk kamar yang sedang ia sewa
  const mine = await contracts.tenantRoomsOn(oltp, tenantId, today());
  if (!mine.some((r) => r.room_id === roomId)) throw badRequest('Anda tidak sedang menyewa kamar tersebut');
  const id = await complaints.create(oltp, {
    tenant_id: tenantId,
    room_id: roomId,
    category: v.oneOf(body.category, 'Kategori', ['listrik', 'air', 'furnitur', 'kebersihan', 'keamanan', 'lainnya']),
    description: v.str(body.description, 'Deskripsi', { min: 5, max: 1000 }),
  });
  return { id };
}
