#!/usr/bin/env python3
"""
Generator data sintetis (deterministik) untuk OLTP Manajemen Kost.

Menjalankan simulasi kejadian (kontrak, tagihan, pembayaran, pengaduan) berurutan
waktu, lalu menulis DUA berkas SQL:

  db/seed/01_oltp_seed_sampai_2026-09.sql   -> keadaan database per 30 Sep 2026
                                               (bahan FULL LOAD ETL / run 1)
  db/seed/02_oltp_aktivitas_2026-10.sql     -> INSERT/UPDATE aktivitas Oktober 2026
                                               (bahan INCREMENTAL ETL / run 2)

Seluruh updated_at diisi eksplisit sesuai waktu simulasi (trigger set_updated_at
menghormati nilai yang diisi pemanggil), sehingga CDC dapat diuji tanpa
menunggu waktu nyata.

Pemakaian:  python3 scripts/generate_seed.py
Akun demo : password semua akun = demo1234
"""
import hashlib
import heapq
import os
import random
from datetime import date, datetime, timedelta, timezone

TZ = timezone(timedelta(hours=7))
R = random.Random(20261112)
PASSWORD = "demo1234"

CUT1 = datetime(2026, 9, 30, 23, 59, 59, tzinfo=TZ)
CUT2 = datetime(2026, 10, 31, 23, 59, 59, tzinfo=TZ)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT1 = os.path.join(ROOT, "db", "seed", "01_oltp_seed_sampai_2026-09.sql")
OUT2 = os.path.join(ROOT, "db", "seed", "02_oltp_aktivitas_2026-10.sql")

COLS = {
    "users": ["id", "role", "full_name", "email", "phone", "password_hash", "business_name", "created_at", "updated_at"],
    "properties": ["id", "owner_id", "name", "property_type", "address", "city", "created_at", "updated_at"],
    "rooms": ["id", "property_id", "room_number", "room_type", "price", "deposit_amount", "created_at", "updated_at"],
    "contracts": ["id", "tenant_id", "room_id", "start_date", "end_date", "rent_amount", "deposit_amount",
                  "due_day", "status", "created_at", "updated_at"],
    "invoices": ["id", "contract_id", "period_month", "due_date", "amount", "status", "created_at", "updated_at"],
    "payments": ["id", "invoice_id", "amount", "method", "paid_at", "recorded_by", "note", "created_at", "updated_at"],
    "complaints": ["id", "tenant_id", "room_id", "category", "description", "status", "created_at", "handled_at",
                   "resolved_at", "resolution_note", "updated_at"],
}
ORDER = ["users", "properties", "rooms", "contracts", "invoices", "payments", "complaints"]


# --------------------------------------------------------------------------- util
def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, datetime):
        return "'%s'" % v.astimezone(TZ).strftime("%Y-%m-%d %H:%M:%S+07")
    if isinstance(v, date):
        return "'%s'" % v.isoformat()
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def hash_password(pw):
    salt = os.urandom(16)
    dk = hashlib.scrypt(pw.encode(), salt=salt, n=16384, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024)
    return "scrypt:%s:%s" % (salt.hex(), dk.hex())


def month_start(d):
    return date(d.year, d.month, 1)


def add_months(d, n):
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def last_day_of_month(d):
    return add_months(month_start(d), 1) - timedelta(days=1)


def at(d, h=0, m=0):
    return datetime(d.year, d.month, d.day, h, m, tzinfo=TZ)


def rand_time(d, h1=8, h2=19):
    return at(d, R.randint(h1, h2), R.randint(0, 59))


# --------------------------------------------------------------------------- db in-memory
class DB:
    def __init__(self):
        self.t = {k: {} for k in COLS}
        self.seq = {k: 0 for k in COLS}
        self.recording = False
        self.stmts = []

    def insert(self, table, **row):
        self.seq[table] += 1
        row["id"] = self.seq[table]
        self.t[table][row["id"]] = row
        if self.recording:
            cols = COLS[table]
            self.stmts.append("INSERT INTO %s (%s) VALUES (%s);" % (
                table, ", ".join(cols), ", ".join(lit(row.get(c)) for c in cols)))
        return row

    def update(self, table, rid, when, **changes):
        row = self.t[table][rid]
        row.update(changes)
        row["updated_at"] = when
        if self.recording:
            sets = dict(changes)
            sets["updated_at"] = when
            self.stmts.append("UPDATE %s SET %s WHERE id = %d;" % (
                table, ", ".join("%s = %s" % (k, lit(v)) for k, v in sets.items()), rid))

    def dump_inserts(self):
        out = []
        for table in ORDER:
            rows = [self.t[table][i] for i in sorted(self.t[table])]
            if not rows:
                continue
            cols = COLS[table]
            out.append("-- %s (%d baris)" % (table, len(rows)))
            for i in range(0, len(rows), 50):
                chunk = rows[i:i + 50]
                out.append("INSERT INTO %s (%s) VALUES\n  %s;" % (
                    table, ", ".join(cols),
                    ",\n  ".join("(" + ", ".join(lit(r.get(c)) for c in cols) + ")" for r in chunk)))
            out.append("")
        return "\n".join(out)


db = DB()
heap, counter = [], 0


def schedule(ts, fn):
    global counter
    counter += 1
    heapq.heappush(heap, (ts, counter, fn))


def run_until(limit):
    while heap and heap[0][0] <= limit:
        ts, _, fn = heapq.heappop(heap)
        fn(ts)


# --------------------------------------------------------------------------- master data
FIRST = ["Rina", "Dewi", "Ayu", "Sari", "Putri", "Intan", "Maya", "Wulan", "Lestari", "Nadia", "Fitri", "Citra",
         "Agus", "Budi", "Dimas", "Eko", "Fajar", "Gilang", "Hendra", "Irfan", "Joko", "Kevin", "Rizky", "Yoga",
         "Andi", "Bayu", "Reza", "Taufik", "Wahyu", "Zaki"]
LAST = ["Pratama", "Wijaya", "Santoso", "Rahman", "Hidayat", "Saputra", "Nugroho", "Kurniawan", "Setiawan",
        "Lestari", "Wulandari", "Permata", "Firmansyah", "Ramadhan", "Susanto", "Utomo", "Hakim", "Maulana",
        "Anggraini", "Purnama"]
PROPS = [
    # id, nama, jenis, alamat, kota, owner, faktor harga
    (1, "Kost Teratai", "putri", "Jl. Ketintang Baru No. 12", "Surabaya", 1, 1.00),
    (2, "Kost Melati", "campur", "Jl. Gubeng Kertajaya No. 45", "Surabaya", 1, 1.05),
    (3, "Kost Anggrek", "putra", "Jl. Soekarno Hatta No. 8", "Malang", 1, 1.00),
    (4, "Kost Kenanga", "putri", "Jl. Veteran No. 21", "Malang", 2, 1.05),
    (5, "Kost Dahlia", "campur", "Jl. Mulyorejo No. 77", "Surabaya", 2, 0.95),
]
BASE = {"Surabaya": {"Standar": 1_200_000, "AC": 1_800_000, "Premium": 2_500_000},
        "Malang": {"Standar": 900_000, "AC": 1_400_000, "Premium": 2_000_000}}
ROOM_NUMBERS = ["101", "102", "103", "104", "201", "202", "203", "204"]
ROOM_TYPES = ["Standar", "Standar", "Standar", "AC", "AC", "AC", "Premium", "Premium"]


def round50k(x):
    return int(round(x / 50_000.0) * 50_000)


def build_master():
    t0 = at(date(2025, 12, 1), 9)
    db.insert("users", role="owner", full_name="Budi Santoso", email="budi@kost.test", phone="081234560001",
              password_hash=hash_password(PASSWORD), business_name="Kost Budi Group", created_at=t0, updated_at=t0)
    db.insert("users", role="owner", full_name="Siti Rahayu", email="siti@kost.test", phone="081234560002",
              password_hash=hash_password(PASSWORD), business_name="Rahayu Residence", created_at=t0, updated_at=t0)
    for pid, name, jenis, alamat, kota, owner, factor in PROPS:
        t1 = at(date(2025, 12, 10), 10)
        db.insert("properties", owner_id=owner, name=name, property_type=jenis, address=alamat, city=kota,
                  created_at=t1, updated_at=t1)
        for num, rtype in zip(ROOM_NUMBERS, ROOM_TYPES):
            price = round50k(BASE[kota][rtype] * factor)
            t2 = at(date(2025, 12, 15), 10)
            db.insert("rooms", property_id=pid, room_number=num, room_type=rtype, price=price,
                      deposit_amount=price // 2, created_at=t2, updated_at=t2)


# --------------------------------------------------------------------------- tenants & profiles
tenant_profile = {}
tenant_serial = [0]
PHONE_SEQ = [0]


def new_tenant(created):
    tenant_serial[0] += 1
    PHONE_SEQ[0] += 1
    n = tenant_serial[0]
    name = "%s %s" % (R.choice(FIRST), R.choice(LAST))
    u = db.insert("users", role="tenant", full_name=name, email="penyewa%02d@kost.test" % n,
                  phone="08521%07d" % (1000 + PHONE_SEQ[0] * 37), password_hash=hash_password(PASSWORD),
                  business_name=None, created_at=created, updated_at=created)
    r = R.random()
    tenant_profile[u["id"]] = "ontime" if r < 0.55 else "late" if r < 0.85 else "verylate" if r < 0.95 else "bad"
    return u


def tenant_has_active(tid):
    return any(c["tenant_id"] == tid and c["status"] == "active" for c in db.t["contracts"].values())


def pick_tenant(plan_ts):
    idle = [u for u in db.t["users"].values() if u["role"] == "tenant" and not tenant_has_active(u["id"])
            and not any(c["tenant_id"] == u["id"] for c in db.t["contracts"].values())]
    reuse = [u for u in db.t["users"].values() if u["role"] == "tenant" and not tenant_has_active(u["id"])
             and any(c["tenant_id"] == u["id"] for c in db.t["contracts"].values())]
    x = R.random()
    if idle and x < 0.5:
        return R.choice(idle)
    if reuse and x < 0.7:
        return R.choice(reuse)
    return new_tenant(plan_ts - timedelta(days=R.randint(1, 14), hours=R.randint(0, 6)))


# --------------------------------------------------------------------------- contracts, invoices, payments
def owner_of_contract(c):
    room = db.t["rooms"][c["room_id"]]
    return db.t["properties"][room["property_id"]]["owner_id"]


def issue_invoice(cid, period):
    def fn(ts):
        c = db.t["contracts"][cid]
        if period > c["end_date"]:
            return
        due = period + timedelta(days=c["due_day"] - 1)
        inv = db.insert("invoices", contract_id=cid, period_month=period, due_date=due, amount=c["rent_amount"],
                        status="unpaid", created_at=ts, updated_at=ts)
        iid = inv["id"]
        schedule(at(due + timedelta(days=1), 0, 5), lambda t, iid=iid: mark_overdue(iid, t))
        plan_payment(iid, period, due, c)
    return fn


def mark_overdue(iid, ts):
    inv = db.t["invoices"][iid]
    if inv["status"] == "unpaid":
        db.update("invoices", iid, ts, status="overdue")


def plan_payment(iid, period, due, c):
    profile = tenant_profile.get(c["tenant_id"], "ontime")
    x = R.random()
    if profile == "bad":
        if x < 0.7:
            return                                   # tidak pernah membayar
        offset = R.randint(11, 35)
    elif profile == "ontime":
        offset = -R.randint(0, 3)
    elif profile == "late":
        offset = R.randint(1, 10)
    else:
        offset = R.randint(11, 35)
    method = R.choices(["tunai", "transfer_bank", "dompet_digital"], [0.2, 0.5, 0.3])[0]
    if method == "tunai" and profile != "ontime":
        offset += 2
    if method == "dompet_digital" and offset > 1:
        offset -= 1
    pay_day = max(due + timedelta(days=offset), period)
    when = rand_time(pay_day, 9, 19)

    def fn(ts, iid=iid, method=method):
        inv = db.t["invoices"][iid]
        if inv["status"] not in ("unpaid", "overdue"):
            return
        cc = db.t["contracts"][inv["contract_id"]]
        db.insert("payments", invoice_id=iid, amount=inv["amount"], method=method, paid_at=ts,
                  recorded_by=owner_of_contract(cc), note=None, created_at=ts, updated_at=ts)
        db.update("invoices", iid, ts, status="paid")
    schedule(when, fn)


def complete_contract(cid, ts):
    if db.t["contracts"][cid]["status"] == "active":
        db.update("contracts", cid, ts, status="completed")


def terminate_contract(cid, day):
    def fn(ts):
        c = db.t["contracts"][cid]
        if c["status"] == "active" and c["end_date"] > day:
            db.update("contracts", cid, ts, status="terminated", end_date=day)
    return fn


def room_free_from(room_id):
    ends = [c["end_date"] for c in db.t["contracts"].values() if c["room_id"] == room_id]
    return (max(ends) + timedelta(days=1)) if ends else date(2000, 1, 1)


def plan_contracts(start):
    def fn(ts):
        prob = 0.62 if start == date(2026, 1, 1) else 0.5
        for room in sorted(db.t["rooms"].values(), key=lambda r: r["id"]):
            if room["created_at"] > ts or room_free_from(room["id"]) > start or R.random() > prob:
                continue
            tenant = pick_tenant(ts)
            months = R.choice([3, 6, 6, 12, 12])
            end = last_day_of_month(add_months(start, months - 1))
            c = db.insert("contracts", tenant_id=tenant["id"], room_id=room["id"], start_date=start, end_date=end,
                          rent_amount=room["price"], deposit_amount=room["deposit_amount"],
                          due_day=R.choice([1, 5, 5, 10]), status="active", created_at=ts, updated_at=ts)
            cid = c["id"]
            for i in range(months):
                p = add_months(start, i)
                schedule(at(p, 0, 5), issue_invoice(cid, p))
            schedule(at(end + timedelta(days=1), 0, 10), lambda t, cid=cid: complete_contract(cid, t))
            if R.random() < 0.06 and months >= 6:
                day = start + timedelta(days=R.randint(61, months * 28 - 10))
                schedule(at(day, 14, 0), terminate_contract(cid, day))
    return fn


# --------------------------------------------------------------------------- complaints
CAT_W = [("listrik", 0.20, 2, 6), ("air", 0.20, 1, 2), ("furnitur", 0.20, 3, 6),
         ("kebersihan", 0.15, 1, 1), ("keamanan", 0.10, 1, 2), ("lainnya", 0.15, 3, 5)]
DESC = {
    "listrik": ["Lampu kamar mati total", "Stopkontak dekat meja tidak berfungsi", "MCB sering turun saat AC menyala"],
    "air": ["Air kamar mandi tidak mengalir", "Keran wastafel bocor", "Air panas shower tidak berfungsi"],
    "furnitur": ["Engsel lemari patah", "Kasur ambles di bagian tengah", "Kunci pintu kamar macet"],
    "kebersihan": ["Tempat sampah belum diangkut", "Lorong lantai 2 kotor", "Kamar mandi luar perlu dibersihkan"],
    "keamanan": ["Gerbang tidak terkunci malam hari", "Lampu halaman depan mati", "CCTV tidak menyala"],
    "lainnya": ["Wifi sering putus", "Jemuran tidak tersedia", "Parkir motor penuh"],
}
NOTE = ["Sudah diperbaiki dan dicek ulang", "Komponen diganti baru", "Ditangani oleh teknisi langganan",
        "Masalah teratasi", "Sudah dikonfirmasi penyewa"]


def complaint_tick(day):
    def fn(ts):
        by_room = {}
        for c in db.t["contracts"].values():
            if c["start_date"] <= day <= c["end_date"]:
                by_room[c["room_id"]] = c
        for room_id, c in sorted(by_room.items()):
            if R.random() > 0.0065:
                continue
            cat, _, mr, md = R.choices(CAT_W, [w[1] for w in CAT_W])[0]
            created = rand_time(day, 7, 21)
            row = db.insert("complaints", tenant_id=c["tenant_id"], room_id=room_id, category=cat,
                            description=R.choice(DESC[cat]), status="open", created_at=created,
                            handled_at=None, resolved_at=None, resolution_note=None, updated_at=created)
            cid = row["id"]
            lag = min(int(R.expovariate(1.0 / mr)), 30)
            handled = created + timedelta(days=lag, hours=R.randint(1, 6))
            schedule(handled, lambda t, cid=cid: db.update("complaints", cid, t, status="in_progress", handled_at=t))
            if R.random() < 0.04:
                continue                              # tidak pernah selesai
            dur = min(int(R.expovariate(1.0 / md)), 60)
            if cat == "listrik" and R.random() < 0.15:
                dur = min(dur * 4 + 5, 90)
            resolved = handled + timedelta(days=dur, hours=R.randint(1, 8))
            schedule(resolved, lambda t, cid=cid: db.update("complaints", cid, t, status="resolved", resolved_at=t,
                                                           resolution_note=R.choice(NOTE)))
    return fn


# --------------------------------------------------------------------------- aktivitas Oktober (skrip)
def october_script():
    price_rooms = sorted(R.sample(sorted(db.t["rooms"]), 10))

    def raise_price(ts):
        for rid in price_rooms:
            r = db.t["rooms"][rid]
            db.update("rooms", rid, ts, price=round50k(r["price"] * 1.10))
    schedule(at(date(2026, 10, 1), 8, 0), raise_price)

    schedule(at(date(2026, 10, 3), 11), lambda t: db.update("properties", 1, t, name="Kost Teratai Residence"))
    schedule(at(date(2026, 10, 5), 10), lambda t: db.update("users", 1, t, business_name="Budi Santoso Property"))

    def change_phones(ts):
        tenants = sorted(u["id"] for u in db.t["users"].values() if u["role"] == "tenant")
        for k, uid in enumerate(tenants[:3]):
            db.update("users", uid, ts + timedelta(minutes=k), phone="08199%07d" % (3000 + uid))
    schedule(at(date(2026, 10, 7), 9), change_phones)

    def add_room(ts):
        price = round50k(BASE["Malang"]["AC"] * 1.05)
        db.insert("rooms", property_id=4, room_number="205", room_type="AC", price=price,
                  deposit_amount=price // 2, created_at=ts, updated_at=ts)
    schedule(at(date(2026, 10, 12), 9), add_room)


# --------------------------------------------------------------------------- main
def main():
    build_master()
    for _ in range(6):                                 # penyewa terdaftar yang belum punya kontrak
        new_tenant(at(date(2025, 12, R.randint(11, 28)), R.randint(8, 20)))
    s = date(2026, 1, 1)
    while s <= date(2026, 11, 1):
        schedule(at(s - timedelta(days=R.randint(6, 10)), 10), plan_contracts(s))
        s = add_months(s, 1)
    d = date(2026, 1, 1)
    while d <= date(2026, 10, 31):
        schedule(at(d, 12), complaint_tick(d))
        d += timedelta(days=1)
    october_script()

    run_until(CUT1)
    sql1 = db.dump_inserts()
    stats1 = {k: len(v) for k, v in db.t.items()}
    db.recording = True
    run_until(CUT2)
    stats2 = {k: len(v) for k, v in db.t.items()}

    setvals = "\n".join(
        "SELECT setval(pg_get_serial_sequence('%s', 'id'), (SELECT COALESCE(MAX(id), 1) FROM %s));" % (t, t)
        for t in ORDER)
    head = ("-- Dihasilkan oleh scripts/generate_seed.py (deterministik; jangan edit manual)\n"
            "-- Password semua akun demo: %s\nSET timezone = 'Asia/Jakarta';\n" % PASSWORD)
    with open(OUT1, "w") as f:
        f.write(head + "-- Keadaan database per 2026-09-30 23:59:59+07\nBEGIN;\n\n" + sql1 + "\n" + setvals + "\nCOMMIT;\n")
    with open(OUT2, "w") as f:
        f.write(head + "-- Aktivitas 2026-10-01 s.d. 2026-10-31 (urut waktu kejadian)\nBEGIN;\n\n"
                + "\n".join(db.stmts) + "\n\n" + setvals + "\nCOMMIT;\n")
    print("Baris per tabel sampai 30 Sep 2026:", stats1)
    print("Baris per tabel sampai 31 Okt 2026:", stats2)
    print("Pernyataan SQL aktivitas Oktober  :", len(db.stmts))


if __name__ == "__main__":
    main()
