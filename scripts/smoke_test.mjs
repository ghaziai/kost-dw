// Uji end-to-end API. Prasyarat: server berjalan & database hasil scripts/demo.sh.
//   BASE=http://localhost:3000 npm run smoke
const BASE = process.env.BASE ?? 'http://localhost:3000';
let pass = 0; const fails = [];

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); } else { fails.push(name); console.log(`  GAGAL ${name} ${extra}`); }
}
const login = async (email, password = 'demo1234') => (await call('POST', '/api/auth/login', { body: { email, password } })).data?.token;

console.log('Autentikasi & otorisasi');
const owner = await login('budi@kost.test');
const owner2 = await login('siti@kost.test');
const tenant = await login('penyewa01@kost.test');
check('login owner', !!owner);
check('password salah -> 401', (await call('POST', '/api/auth/login', { body: { email: 'budi@kost.test', password: 'x' } })).status === 401);
check('tanpa token -> 401', (await call('GET', '/api/owner/properties')).status === 401);
check('tenant ke rute owner -> 403', (await call('GET', '/api/owner/properties', { token: tenant })).status === 403);
check('owner ke rute tenant -> 403', (await call('GET', '/api/tenant/invoices', { token: owner })).status === 403);

console.log('Registrasi & validasi');
const email = `uji${Date.now()}@kost.test`;
const reg = await call('POST', '/api/auth/register', { body: { role: 'tenant', full_name: 'Penyewa Uji', email, phone: '081200000000', password: 'rahasia123' } });
check('register tenant -> 201', reg.status === 201);
check('email ganda -> 409', (await call('POST', '/api/auth/register', { body: { role: 'tenant', full_name: 'Penyewa Uji', email, phone: '081200000000', password: 'rahasia123' } })).status === 409);
check('password pendek -> 400', (await call('POST', '/api/auth/register', { body: { role: 'tenant', full_name: 'X Y Z', email: 'a@b.co', phone: '081200000000', password: '123' } })).status === 400);

console.log('Alur bisnis OLTP');
const props = (await call('GET', '/api/owner/properties', { token: owner })).data;
check('owner melihat propertinya', props.length > 0);
const room = await call('POST', '/api/owner/rooms', { token: owner, body: { property_id: props[0].id, room_number: `U${Date.now() % 100000}`, room_type: 'Standar', price: 1500000, deposit_amount: 500000 } });
check('buat kamar -> 201', room.status === 201);
const before = (await call('GET', '/api/owner/analytics', { token: owner })).data.kpi;
const tid = reg.data.user.id;
const contract = await call('POST', '/api/owner/contracts', { token: owner, body: { room_id: room.data.id, tenant_id: tid, start_month: '2026-11', months: 3 } });
check('buat kontrak -> 201', contract.status === 201);
check('kontrak bentrok -> 409', (await call('POST', '/api/owner/contracts', { token: owner, body: { room_id: room.data.id, tenant_id: tid, start_month: '2026-12', months: 2 } })).status === 409);
const inv = (await call('GET', '/api/owner/invoices?status=unpaid&month=2026-11', { token: owner })).data.find((i) => i.tenant_name === 'Penyewa Uji');
check('tagihan terbit otomatis', !!inv && inv.amount === 1500000);
check('owner lain tidak boleh membayar -> 404', (await call('POST', `/api/owner/invoices/${inv.id}/payments`, { token: owner2, body: { method: 'tunai' } })).status === 404);
check('catat pembayaran -> 201', (await call('POST', `/api/owner/invoices/${inv.id}/payments`, { token: owner, body: { method: 'tunai', paid_date: '2026-11-05' } })).status === 201);
check('bayar dua kali -> 409', (await call('POST', `/api/owner/invoices/${inv.id}/payments`, { token: owner, body: { method: 'tunai' } })).status === 409);

const tenantTok = await login(email, 'rahasia123');
const myInv = (await call('GET', '/api/tenant/invoices', { token: tenantTok })).data;
check('penyewa melihat tagihannya (lunas)', myInv.length === 1 && myInv[0].status === 'paid');
check('pengaduan kamar orang lain -> 400', (await call('POST', '/api/tenant/complaints', { token: tenantTok, body: { room_id: 1, category: 'air', description: 'bukan kamar saya' } })).status === 400);
const cp = await call('POST', '/api/tenant/complaints', { token: tenantTok, body: { room_id: room.data.id, category: 'listrik', description: 'Lampu kamar mati' } });
check('pengaduan kamar sendiri -> 201', cp.status === 201);
check('proses pengaduan', (await call('PATCH', `/api/owner/complaints/${cp.data.id}`, { token: owner, body: { status: 'in_progress' } })).status === 200);
check('selesaikan pengaduan', (await call('PATCH', `/api/owner/complaints/${cp.data.id}`, { token: owner, body: { status: 'resolved', resolution_note: 'Diganti' } })).status === 200);
check('akhiri kontrak', (await call('POST', `/api/owner/contracts/${contract.data.id}/terminate`, { token: owner, body: { date: '2026-11-12' } })).status === 200);

console.log('Lapisan analitik (Data Warehouse)');
const after = (await call('GET', '/api/owner/analytics', { token: owner })).data;
check('payload dasbor lengkap', ['kpi', 'revenue', 'occupancy', 'lostRevenue', 'latePayment', 'complaints'].every((k) => k in after));
check('DW tidak berubah sebelum ETL berikutnya (batch, bukan real-time)', after.kpi.pendapatan === before.pendapatan);
check('rentang terbalik -> 400', (await call('GET', '/api/owner/analytics?from=2026-10&to=2026-01', { token: owner })).status === 400);
const siti = (await call('GET', '/api/owner/analytics', { token: owner2 })).data;
check('owner hanya melihat DW miliknya', siti.kpi.pendapatan !== after.kpi.pendapatan);

console.log(`\n${pass} lulus, ${fails.length} gagal`);
if (fails.length) { console.log('Gagal:', fails.join('; ')); process.exit(1); }
