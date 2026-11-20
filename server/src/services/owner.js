// Service sisi OWNER: properti, kamar, kontrak, tagihan/pembayaran, pengaduan.
// Aturan bisnis (AB-xx) yang tidak dapat ditegakkan constraint ada di sini.
import { oltp, withTx } from '../db.js';
import { properties, rooms, contracts, invoices, billing, complaints, users } from '../repositories/oltp.js';
import { v } from '../lib/validate.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { today, lastDayOfMonth } from '../lib/dates.js';

// ------------------------------------------------------------------ properti
const propertyInput = (b) => ({
  name: v.str(b.name, 'Nama properti', { min: 3, max: 150 }),
  property_type: v.oneOf(b.property_type ?? 'campur', 'Jenis properti', ['putra', 'putri', 'campur']),
  address: v.str(b.address, 'Alamat', { min: 5, max: 500 }),
  city: v.str(b.city, 'Kota', { min: 2, max: 100 }),
});

export const listProperties = (ownerId) => properties.listByOwner(oltp, ownerId);

export const createProperty = (ownerId, body) => properties.create(oltp, ownerId, propertyInput(body));

export async function updateProperty(ownerId, id, body) {
  const row = await properties.update(oltp, v.id(id), ownerId, propertyInput(body));
  if (!row) throw notFound('Properti tidak ditemukan');
  return row;
}

export async function deleteProperty(ownerId, id) {
  const prop = await properties.getOwned(oltp, v.id(id), ownerId);
  if (!prop) throw notFound('Properti tidak ditemukan');
  const list = await rooms.listByOwner(oltp, ownerId, { propertyId: prop.id, asOf: today() });
  if (list.length) throw conflict('Hapus semua kamar pada properti ini terlebih dahulu');
  await properties.remove(oltp, prop.id, ownerId);
}

// ------------------------------------------------------------------ kamar
const roomInput = (b) => ({
  room_number: v.str(b.room_number, 'Nomor kamar', { max: 20 }),
  room_type: v.str(b.room_type ?? 'Standar', 'Tipe kamar', { max: 50 }),
  price: v.money(b.price, 'Tarif sewa'),
  deposit_amount: v.money(b.deposit_amount ?? 0, 'Deposit', { allowZero: true }),
});

export const listRooms = (ownerId, query) =>
  rooms.listByOwner(oltp, ownerId, {
    propertyId: query.propertyId ? v.id(query.propertyId, 'propertyId') : null,
    asOf: today(),
  });

export async function createRoom(ownerId, body) {
  const prop = await properties.getOwned(oltp, v.id(body.property_id, 'Properti'), ownerId);
  if (!prop) throw notFound('Properti tidak ditemukan');
  return rooms.create(oltp, { property_id: prop.id, ...roomInput(body) });
}

/** Mengubah tarif = perubahan atribut pada Dim_Kamar (SCD tipe 2) setelah ETL berikutnya. */
export async function updateRoom(ownerId, id, body) {
  const room = await rooms.getOwned(oltp, v.id(id), ownerId);
  if (!room) throw notFound('Kamar tidak ditemukan');
  return rooms.update(oltp, room.id, roomInput(body));
}

export async function deleteRoom(ownerId, id) {
  const room = await rooms.getOwned(oltp, v.id(id), ownerId);
  if (!room) throw notFound('Kamar tidak ditemukan');
  if (await contracts.roomHasAny(oltp, room.id)) throw conflict('Kamar yang pernah memiliki kontrak tidak dapat dihapus');
  await rooms.remove(oltp, room.id);
}

// ------------------------------------------------------------------ penyewa (untuk pilihan saat membuat kontrak)
export const searchTenants = (query) => users.searchTenants(oltp, query.q ? String(query.q).trim() : null);

// ------------------------------------------------------------------ kontrak
export const listContracts = (ownerId, query) =>
  contracts.listByOwner(oltp, ownerId, {
    status: query.status ? v.oneOf(query.status, 'status', ['active', 'completed', 'terminated']) : null,
  });

export async function createContract(ownerId, body) {
  const room = await rooms.getOwned(oltp, v.id(body.room_id, 'Kamar'), ownerId);
  if (!room) throw notFound('Kamar tidak ditemukan');
  const tenantId = v.id(body.tenant_id, 'Penyewa');
  const tenant = await users.findById(oltp, tenantId);
  if (!tenant || tenant.role !== 'tenant') throw badRequest('Penyewa tidak valid');

  const startMonth = v.month(body.start_month, 'Bulan mulai');
  const months = v.int(body.months, 'Durasi (bulan)', { min: 1, max: 24 });
  const input = {
    tenant_id: tenantId,
    room_id: room.id,
    start_date: `${startMonth}-01`,
    end_date: lastDayOfMonth(startMonth, months - 1),
    rent_amount: v.money(body.rent_amount ?? room.price, 'Nilai sewa'),
    deposit_amount: v.money(body.deposit_amount ?? room.deposit_amount, 'Deposit', { allowZero: true }),
    due_day: v.int(body.due_day ?? 5, 'Tanggal jatuh tempo', { min: 1, max: 28 }),
  };
  return withTx(oltp, async (tx) => {
    const id = await contracts.create(tx, input);          // AB-05/AB-06 ditegakkan oleh constraint
    await billing.generateForContract(tx, today(), ownerId, id);   // tagihan bulan berjalan langsung terbit
    return contracts.getOwned(tx, id, ownerId);
  });
}

export async function terminateContract(ownerId, id, body) {
  const date = v.date(body.date ?? today(), 'Tanggal berakhir');
  const row = await billing.terminate(oltp, v.id(id), ownerId, date);
  return contracts.getOwned(oltp, row.id, ownerId);
}

// ------------------------------------------------------------------ tagihan & pembayaran
export const listInvoices = (ownerId, query) =>
  invoices.listByOwner(oltp, ownerId, {
    status: query.status ? v.oneOf(query.status, 'status', ['unpaid', 'paid', 'overdue', 'cancelled']) : null,
    month: query.month ? v.month(query.month, 'month') : null,
    propertyId: query.propertyId ? v.id(query.propertyId, 'propertyId') : null,
  });

export async function runBilling(ownerId, body) {
  const asOf = v.date(body.as_of ?? today(), 'Per tanggal');
  return billing.run(oltp, asOf, ownerId);
}

export async function recordPayment(ownerId, invoiceId, body) {
  const method = v.oneOf(body.method, 'Metode pembayaran', ['tunai', 'transfer_bank', 'dompet_digital']);
  const note = v.str(body.note, 'Catatan', { max: 300, optional: true });
  let paidAt = null;                                         // null -> now() di SQL
  if (body.paid_date) {
    const d = v.date(body.paid_date, 'Tanggal bayar');
    if (d > today()) throw badRequest('Tanggal bayar tidak boleh di masa depan');
    paidAt = `${d} 12:00:00+07`;
  }
  const pay = await billing.recordPayment(oltp, v.id(invoiceId), ownerId, method, paidAt ?? new Date().toISOString(), note);
  return pay;
}

// ------------------------------------------------------------------ pengaduan
export const listComplaints = (ownerId, query) =>
  complaints.listByOwner(oltp, ownerId, {
    status: query.status ? v.oneOf(query.status, 'status', ['open', 'in_progress', 'resolved']) : null,
  });

export async function updateComplaint(ownerId, id, body) {
  const status = v.oneOf(body.status, 'Status', ['in_progress', 'resolved']);
  const c = await complaints.getOwned(oltp, v.id(id), ownerId);
  if (!c) throw notFound('Pengaduan tidak ditemukan');
  if (c.status === 'resolved') throw conflict('Pengaduan sudah selesai');
  if (status === 'in_progress') {
    if (c.status !== 'open') throw conflict('Pengaduan sudah diproses');
    await complaints.markInProgress(oltp, c.id);
  } else {
    await complaints.markResolved(oltp, c.id, v.str(body.resolution_note, 'Catatan penyelesaian', { max: 500, optional: true }));
  }
  return complaints.getOwned(oltp, c.id, ownerId);
}
