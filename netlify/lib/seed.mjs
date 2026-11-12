import { randomBytes } from 'node:crypto';
import { hashPassword, now, today, addDays, trxCode } from './util.mjs';

export const SEED_USERS = [
    // [nama, username, password, role, aktif]
    ['Administrator Lab', 'admin', 'admin123', 'admin', true],
    ['Rina Wulandari', 'staff1', 'staff123', 'staff', true],
    ['Agus Setiawan', 'staff2', 'staff123', 'staff', true],
    ['Dimas Saputra', 'staff3', 'staff123', 'staff', false],
];

export const SEED_BARANG = [
    // [kode, nama, kategori, lokasi, stok] — data awal sesuai soal
    ['BR001', 'Laptop Lenovo', 'Laptop', 'Lemari A1', 5],
    ['BR002', 'Mouse Logitech', 'Periferal', 'Rak B1', 10],
    ['BR003', 'Keyboard Mechanical', 'Periferal', 'Rak B1', 8],
    ['BR004', 'Proyektor Epson', 'Presentasi', 'Lemari C1', 3],
    ['BR005', 'Monitor LG', 'Monitor', 'Rak D1', 6],
];

// [peminjam, identitas, kode, jumlah, hari_pinjam, hari_rencana, hari_kembali|null, pencatat, pemroses, keterangan, kondisi]
export const SEED_TRX = [
    ['Rizky Firmansyah', '2201010', 'BR003', 2, -12, -9, -9, 'staff1', 'staff2', 'Praktikum Pemrograman', 'Baik'],
    ['Budi Santoso', '2201003', 'BR002', 3, -8, -7, -7, 'staff1', 'staff1', 'Ujian praktik', 'Baik'],
    ['Fajar Nugroho', '2201022', 'BR004', 1, -6, -5, -6, 'admin', 'staff2', 'Seminar himpunan', 'Baik'],
    ['Siti Rahmawati', '2201015', 'BR004', 1, -5, -2, null, 'staff2', null, 'Presentasi tugas akhir', null],
    ['Dewi Lestari', '198702112015', 'BR002', 2, -3, 4, null, 'staff1', null, 'Kegiatan workshop', null],
    ['Andi Pratama', '2201001', 'BR001', 2, -1, 2, null, 'staff1', null, 'Pengerjaan proyek PBO', null],
    ['Maya Anggraini', '2201031', 'BR005', 1, -2, 5, -1, 'staff2', 'staff1', 'Desain antarmuka', 'Baik'],
    ['Nadia Putri', '2201027', 'BR005', 1, 0, 1, null, 'staff2', null, 'Desain grafis', null],
    ['Yoga Pratama', '2201040', 'BR003', 1, 0, 3, null, 'admin', null, 'Praktikum Basis Data', null],
];

export function seedData() {
    const t = today();
    const ts = now();
    const db = {
        version: 1,
        secret: randomBytes(32).toString('hex'),
        seq: { user: 0, trx: 0, barang: 0, log: 0 },
        users: [], barang: [], peminjaman: [], aktivitas: [], loginFail: {},
    };
    const uid = {};
    for (const [nama, username, pw, role, aktif] of SEED_USERS) {
        const id = ++db.seq.user;
        uid[username] = { id, nama };
        db.users.push({ id, nama, username, password_hash: hashPassword(pw), role, is_active: aktif, last_login: null, created_at: ts, updated_at: null });
    }
    for (const [kode, nama, kategori, lokasi, stok] of SEED_BARANG) {
        db.barang.push({ kode, nama, kategori, lokasi, stok_total: stok, stok_tersedia: stok, created_at: ts, updated_at: null });
        db.seq.barang = Math.max(db.seq.barang, Number(kode.slice(2)));
    }
    const logs = [];
    SEED_TRX.forEach(([peminjam, ident, kode, jml, hP, hR, hK, pencatat, pemroses, ket, kondisi], i) => {
        const b = db.barang.find((x) => x.kode === kode);
        const id = ++db.seq.trx;
        const tPinjam = addDays(t, hP) + ` ${String(8 + (i % 6)).padStart(2, '0')}:${String(10 + i * 5).padStart(2, '0')}:00`;
        const tKembali = hK === null ? null : addDays(t, hK) + ` ${String(14 + (i % 3)).padStart(2, '0')}:${String(5 + i * 3).padStart(2, '0')}:00`;
        const status = hK === null ? 'dipinjam' : 'selesai';
        db.peminjaman.push({
            id, nama_peminjam: peminjam, identitas_peminjam: ident, barang_kode: kode, kode_barang: kode, nama_barang: b.nama,
            jumlah: jml, tanggal_pinjam: addDays(t, hP), tanggal_rencana_kembali: addDays(t, hR), tanggal_kembali: tKembali,
            kondisi_kembali: kondisi, catatan_kembali: null, status, keterangan: ket,
            dicatat_oleh: uid[pencatat].id, diproses_oleh: pemroses ? uid[pemroses].id : null, created_at: tPinjam,
        });
        if (status === 'dipinjam') b.stok_tersedia -= jml;
        logs.push([tPinjam, pencatat, 'pinjam', `Mencatat peminjaman ${trxCode(id)}: ${jml} unit ${b.nama} oleh ${peminjam}`]);
        if (tKembali) logs.push([tKembali, pemroses, 'kembali', `Memproses pengembalian ${trxCode(id)}: ${jml} unit ${b.nama} dari ${peminjam}`]);
    });
    logs.sort((a, b) => a[0].localeCompare(b[0]));
    logs.unshift([addDays(t, -14) + ' 07:30:00', 'admin', 'sistem', 'Instalasi aplikasi & data awal inventaris']);
    for (const [waktu, user, aksi, deskripsi] of logs) {
        db.aktivitas.push({ id: ++db.seq.log, user_id: uid[user].id, nama_user: uid[user].nama, aksi, deskripsi, created_at: waktu });
    }
    return db;
}
