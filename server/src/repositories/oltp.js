// Repository OLTP: seluruh SQL transaksional ada di sini. Setiap fungsi menerima `db`
// (Pool atau Client transaksi) sehingga service dapat menyusun transaksi sendiri.
// Semua query pemilik di-scope dengan properties.owner_id (padanan RLS di Supabase).

// ------------------------------------------------------------------ users
export const users = {
  async findByEmail(db, email) {
    const { rows } = await db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    return rows[0] ?? null;
  },
  async findById(db, id) {
    const { rows } = await db.query(
      'SELECT id, role, full_name, email, phone, business_name, created_at FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
  },
  async create(db, u) {
    const { rows } = await db.query(
      `INSERT INTO users (role, full_name, email, phone, password_hash, business_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, role, full_name, email, phone, business_name, created_at`,
      [u.role, u.full_name, u.email, u.phone, u.password_hash, u.business_name]);
    return rows[0];
  },
  async searchTenants(db, q) {
    const { rows } = await db.query(
      `SELECT id, full_name, email, phone,
              EXISTS (SELECT 1 FROM contracts c WHERE c.tenant_id = users.id AND c.status = 'active') AS has_active_contract
         FROM users
        WHERE role = 'tenant' AND ($1::text IS NULL OR full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
        ORDER BY full_name LIMIT 50`, [q]);
    return rows;
  },
};

// ------------------------------------------------------------------ properties
export const properties = {
  async listByOwner(db, ownerId) {
    const { rows } = await db.query(
      `SELECT p.*, (SELECT count(*) FROM rooms r WHERE r.property_id = p.id)::int AS room_count
         FROM properties p WHERE p.owner_id = $1 ORDER BY p.name`, [ownerId]);
    return rows;
  },
  async getOwned(db, id, ownerId) {
    const { rows } = await db.query('SELECT * FROM properties WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    return rows[0] ?? null;
  },
  async create(db, ownerId, p) {
    const { rows } = await db.query(
      `INSERT INTO properties (owner_id, name, property_type, address, city) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ownerId, p.name, p.property_type, p.address, p.city]);
    return rows[0];
  },
  async update(db, id, ownerId, p) {
    const { rows } = await db.query(
      `UPDATE properties SET name=$3, property_type=$4, address=$5, city=$6
        WHERE id=$1 AND owner_id=$2 RETURNING *`,
      [id, ownerId, p.name, p.property_type, p.address, p.city]);
    return rows[0] ?? null;
  },
  async remove(db, id, ownerId) {
    const { rowCount } = await db.query('DELETE FROM properties WHERE id=$1 AND owner_id=$2', [id, ownerId]);
    return rowCount > 0;
  },
};

// ------------------------------------------------------------------ rooms
export const rooms = {
  async listByOwner(db, ownerId, { propertyId, asOf }) {
    const { rows } = await db.query(
      `SELECT r.id, r.property_id, p.name AS property_name, p.city, r.room_number, r.room_type,
              r.price, r.deposit_amount, c.id AS contract_id, u.full_name AS tenant_name,
              (c.id IS NOT NULL) AS occupied
         FROM rooms r
         JOIN properties p ON p.id = r.property_id
         LEFT JOIN contracts c ON c.room_id = r.id AND $2::date BETWEEN c.start_date AND c.end_date
         LEFT JOIN users u ON u.id = c.tenant_id
        WHERE p.owner_id = $1 AND ($3::bigint IS NULL OR r.property_id = $3)
        ORDER BY p.name, r.room_number`, [ownerId, asOf, propertyId]);
    return rows;
  },
  async getOwned(db, id, ownerId) {
    const { rows } = await db.query(
      `SELECT r.* FROM rooms r JOIN properties p ON p.id = r.property_id WHERE r.id = $1 AND p.owner_id = $2`,
      [id, ownerId]);
    return rows[0] ?? null;
  },
  async create(db, r) {
    const { rows } = await db.query(
      `INSERT INTO rooms (property_id, room_number, room_type, price, deposit_amount) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [r.property_id, r.room_number, r.room_type, r.price, r.deposit_amount]);
    return rows[0];
  },
  async update(db, id, r) {
    const { rows } = await db.query(
      `UPDATE rooms SET room_number=$2, room_type=$3, price=$4, deposit_amount=$5 WHERE id=$1 RETURNING *`,
      [id, r.room_number, r.room_type, r.price, r.deposit_amount]);
    return rows[0];
  },
  async remove(db, id) {
    await db.query('DELETE FROM rooms WHERE id = $1', [id]);
  },
};

// ------------------------------------------------------------------ contracts
const CONTRACT_SELECT = `
  SELECT c.id, c.tenant_id, c.room_id, c.start_date, c.end_date, c.rent_amount, c.deposit_amount, c.due_day,
         c.status, c.created_at, u.full_name AS tenant_name, u.email AS tenant_email,
         r.room_number, r.room_type, p.id AS property_id, p.name AS property_name, p.city,
         (SELECT count(*) FROM invoices i WHERE i.contract_id = c.id AND i.status IN ('unpaid','overdue'))::int AS open_invoices
    FROM contracts c
    JOIN users u ON u.id = c.tenant_id
    JOIN rooms r ON r.id = c.room_id
    JOIN properties p ON p.id = r.property_id`;

export const contracts = {
  async listByOwner(db, ownerId, { status }) {
    const { rows } = await db.query(
      `${CONTRACT_SELECT} WHERE p.owner_id = $1 AND ($2::text IS NULL OR c.status::text = $2)
        ORDER BY c.start_date DESC, c.id DESC`, [ownerId, status]);
    return rows;
  },
  async listByTenant(db, tenantId) {
    const { rows } = await db.query(`${CONTRACT_SELECT} WHERE c.tenant_id = $1 ORDER BY c.start_date DESC`, [tenantId]);
    return rows;
  },
  async create(db, c) {
    const { rows } = await db.query(
      `INSERT INTO contracts (tenant_id, room_id, start_date, end_date, rent_amount, deposit_amount, due_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [c.tenant_id, c.room_id, c.start_date, c.end_date, c.rent_amount, c.deposit_amount, c.due_day]);
    return rows[0].id;
  },
  async getOwned(db, id, ownerId) {
    const { rows } = await db.query(`${CONTRACT_SELECT} WHERE c.id = $1 AND p.owner_id = $2`, [id, ownerId]);
    return rows[0] ?? null;
  },
  async roomCurrentContract(db, roomId, asOf) {
    const { rows } = await db.query(
      `SELECT id FROM contracts WHERE room_id=$1 AND $2::date BETWEEN start_date AND end_date`, [roomId, asOf]);
    return rows[0] ?? null;
  },
  async roomHasAny(db, roomId) {
    const { rows } = await db.query('SELECT 1 FROM contracts WHERE room_id = $1 LIMIT 1', [roomId]);
    return rows.length > 0;
  },
  async tenantRoomsOn(db, tenantId, asOf) {
    const { rows } = await db.query(
      `SELECT r.id AS room_id, r.room_number, p.name AS property_name
         FROM contracts c JOIN rooms r ON r.id = c.room_id JOIN properties p ON p.id = r.property_id
        WHERE c.tenant_id = $1 AND c.status IN ('active','completed') AND $2::date BETWEEN c.start_date AND c.end_date`,
      [tenantId, asOf]);
    return rows;
  },
};

// ------------------------------------------------------------------ invoices & payments
const INVOICE_SELECT = `
  SELECT i.id, i.contract_id, i.period_month, i.due_date, i.amount, i.status,
         u.full_name AS tenant_name, r.room_number, p.id AS property_id, p.name AS property_name,
         pay.paid_at, pay.method, pay.note
    FROM invoices i
    JOIN contracts c ON c.id = i.contract_id
    JOIN users u ON u.id = c.tenant_id
    JOIN rooms r ON r.id = c.room_id
    JOIN properties p ON p.id = r.property_id
    LEFT JOIN payments pay ON pay.invoice_id = i.id`;

export const invoices = {
  async listByOwner(db, ownerId, { status, month, propertyId }) {
    const { rows } = await db.query(
      `${INVOICE_SELECT}
        WHERE p.owner_id = $1
          AND ($2::text IS NULL OR i.status::text = $2)
          AND ($3::date IS NULL OR i.period_month = $3::date)
          AND ($4::bigint IS NULL OR p.id = $4)
        ORDER BY i.period_month DESC, p.name, r.room_number LIMIT 500`,
      [ownerId, status, month ? month + '-01' : null, propertyId]);
    return rows;
  },
  async listByTenant(db, tenantId) {
    const { rows } = await db.query(
      `${INVOICE_SELECT} WHERE c.tenant_id = $1 ORDER BY i.period_month DESC LIMIT 200`, [tenantId]);
    return rows;
  },
};

export const billing = {
  async generateForContract(db, asOf, ownerId, contractId) {
    const { rows } = await db.query('SELECT fn_generate_invoices($1::date, $2, $3) AS n', [asOf, ownerId, contractId]);
    return rows[0].n;
  },
  async run(db, asOf, ownerId) {
    const { rows } = await db.query('SELECT * FROM fn_run_billing($1::date, $2)', [asOf, ownerId]);
    return rows[0];
  },
  async terminate(db, contractId, ownerId, date) {
    const { rows } = await db.query('SELECT * FROM fn_terminate_contract($1, $2, $3::date)', [contractId, ownerId, date]);
    return rows[0];
  },
  async recordPayment(db, invoiceId, ownerId, method, paidAt, note) {
    const { rows } = await db.query(
      'SELECT * FROM fn_record_payment($1, $2, $3::payment_method, $4::timestamptz, $5)',
      [invoiceId, ownerId, method, paidAt, note]);
    return rows[0];
  },
};

// ------------------------------------------------------------------ complaints
const COMPLAINT_SELECT = `
  SELECT cp.id, cp.tenant_id, cp.room_id, cp.category, cp.description, cp.status, cp.created_at, cp.handled_at,
         cp.resolved_at, cp.resolution_note, u.full_name AS tenant_name, r.room_number,
         p.id AS property_id, p.name AS property_name
    FROM complaints cp
    JOIN users u ON u.id = cp.tenant_id
    JOIN rooms r ON r.id = cp.room_id
    JOIN properties p ON p.id = r.property_id`;

export const complaints = {
  async listByOwner(db, ownerId, { status }) {
    const { rows } = await db.query(
      `${COMPLAINT_SELECT} WHERE p.owner_id = $1 AND ($2::text IS NULL OR cp.status::text = $2)
        ORDER BY (cp.status = 'resolved'), cp.created_at DESC LIMIT 300`, [ownerId, status]);
    return rows;
  },
  async listByTenant(db, tenantId) {
    const { rows } = await db.query(`${COMPLAINT_SELECT} WHERE cp.tenant_id = $1 ORDER BY cp.created_at DESC`, [tenantId]);
    return rows;
  },
  async create(db, c) {
    const { rows } = await db.query(
      `INSERT INTO complaints (tenant_id, room_id, category, description) VALUES ($1,$2,$3,$4) RETURNING id`,
      [c.tenant_id, c.room_id, c.category, c.description]);
    return rows[0].id;
  },
  async getOwned(db, id, ownerId) {
    const { rows } = await db.query(`${COMPLAINT_SELECT} WHERE cp.id = $1 AND p.owner_id = $2`, [id, ownerId]);
    return rows[0] ?? null;
  },
  async markInProgress(db, id) {
    await db.query(`UPDATE complaints SET status='in_progress', handled_at = now() WHERE id = $1`, [id]);
  },
  async markResolved(db, id, note) {
    await db.query(
      `UPDATE complaints SET status='resolved', resolved_at = now(), handled_at = COALESCE(handled_at, now()),
              resolution_note = $2 WHERE id = $1`, [id, note]);
  },
};
