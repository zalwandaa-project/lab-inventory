/**
 * API aplikasi. Semua aturan bisnis ada di sini (sama dengan versi PHP):
 * role Admin/Staff, stok atomik, kode barang otomatis & tidak bisa diubah,
 * pengembalian, pembatalan, hapus, log aktivitas dengan detail perubahan.
 */
import { load, mutate } from './store.mjs';
import {
    HttpError, now, today, validDate, hashPassword, verifyPassword, signSession, readSession, getCookie,
    trxCode, formatKode, isLate, parseTrx, str, len, diffText,
} from './util.mjs';

const SESSION_HOURS = 12;
const KONDISI = ['Baik', 'Rusak Ringan', 'Rusak Berat'];

/* ====================== helper ====================== */
const json = (data, status = 200, headers = {}) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const secretOf = (db) => process.env.SESSION_SECRET || db.secret;

function sessionCookie(req, value, maxAge) {
    const secure = new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
    return `sid=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function currentUser(req, db) {
    const s = readSession(getCookie(req, 'sid'), secretOf(db));
    if (!s) return null;
    const u = db.users.find((x) => x.id === s.uid);
    return u && u.is_active ? u : null;
}
function requireUser(req, db) {
    const u = currentUser(req, db);
    if (!u) throw new HttpError(401, 'Sesi berakhir. Silakan login kembali.');
    return u;
}
function requireAdmin(req, db) {
    const u = requireUser(req, db);
    if (u.role !== 'admin') throw new HttpError(403, 'Akses ditolak. Fitur ini hanya untuk Admin.');
    return u;
}
const publicUser = (u) => u && { id: u.id, nama: u.nama, username: u.username, role: u.role };

function log(db, actor, aksi, deskripsi) {
    db.aktivitas.push({
        id: ++db.seq.log, user_id: actor?.id ?? null, nama_user: actor?.nama ?? 'Sistem', aksi,
        deskripsi: len(deskripsi) > 1000 ? [...deskripsi].slice(0, 997).join('') + '...' : deskripsi, created_at: now(),
    });
    if (db.aktivitas.length > 3000) db.aktivitas.splice(0, db.aktivitas.length - 3000);
}
const userName = (db, id) => (id == null ? null : db.users.find((u) => u.id === id)?.nama ?? 'Akun dihapus');
const withNames = (db, r) => ({ ...r, kode: trxCode(r.id), terlambat: isLate(r), pencatat: userName(db, r.dicatat_oleh), pemroses: userName(db, r.diproses_oleh) });
const like = (v, q) => String(v ?? '').toLowerCase().includes(q.toLowerCase());

function validationError(errors) {
    return new HttpError(422, 'Periksa kembali isian formulir.', { errors });
}

/* ====================== auth ====================== */
async function login(req, body) {
    const username = str(body.username);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) throw new HttpError(422, 'Username dan password wajib diisi.');
    const key = username.toLowerCase();
    return mutate((db) => {
        const f = db.loginFail[key];
        if (f && f.until > Date.now()) {
            throw new HttpError(429, `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil((f.until - Date.now()) / 1000)} detik.`);
        }
        const u = db.users.find((x) => x.username.toLowerCase() === key);
        if (!u || !verifyPassword(password, u.password_hash)) {
            const cnt = (f?.count || 0) + 1;
            db.loginFail[key] = cnt >= 5 ? { count: 0, until: Date.now() + 60000 } : { count: cnt, until: 0 };
            return { fail: 'Username atau password salah.' };
        }
        if (!u.is_active) return { fail: 'Akun Anda sedang dinonaktifkan. Hubungi Admin laboratorium.' };
        delete db.loginFail[key];
        u.last_login = now();
        log(db, u, 'login', `${u.nama} login ke sistem`);
        const token = signSession({ uid: u.id, exp: Date.now() + SESSION_HOURS * 3600e3 }, secretOf(db));
        return { user: publicUser(u), token };
    }).then((r) => {
        if (r.fail) return json({ error: r.fail }, 401);
        return json({ user: r.user }, 200, { 'set-cookie': sessionCookie(req, r.token, SESSION_HOURS * 3600) });
    });
}

async function logout(req) {
    const db = await load();
    const u = currentUser(req, db);
    if (u) await mutate((d) => log(d, u, 'logout', `${u.nama} logout dari sistem`));
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, '', 0) });
}

/* ====================== dashboard ====================== */
function dashboard(req, db) {
    const u = requireUser(req, db);
    const t = today();
    const total = db.barang.reduce((s, b) => s + b.stok_total, 0);
    const tersedia = db.barang.reduce((s, b) => s + b.stok_tersedia, 0);
    const aktif = db.peminjaman.filter((p) => p.status === 'dipinjam');
    const akt = [...db.aktivitas]
        .filter((a) => u.role === 'admin' || ['pinjam', 'kembali'].includes(a.aksi))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, 8);
    return json({
        stok: { jenis: db.barang.length, total, tersedia, dipinjam: total - tersedia },
        trx: {
            total: db.peminjaman.length, aktif: aktif.length,
            selesai: db.peminjaman.filter((p) => p.status === 'selesai').length,
            terlambat: aktif.filter((p) => isLate(p, t)).length,
            hari_ini: db.peminjaman.filter((p) => p.tanggal_pinjam === t).length,
        },
        staffAktif: u.role === 'admin' ? db.users.filter((x) => x.role === 'staff' && x.is_active).length : null,
        pinjamAktif: aktif
            .sort((a, b) => (a.tanggal_rencana_kembali || '9999').localeCompare(b.tanggal_rencana_kembali || '9999') || a.id - b.id)
            .slice(0, 6).map((r) => withNames(db, r)),
        menipis: db.barang.filter((b) => b.stok_tersedia <= 1 || b.stok_tersedia * 5 <= b.stok_total)
            .sort((a, b) => a.stok_tersedia - b.stok_tersedia || a.nama.localeCompare(b.nama)).slice(0, 6),
        aktivitas: akt,
    });
}

/* ====================== barang ====================== */
function listBarang(req, db, url) {
    requireUser(req, db);
    const q = str(url.searchParams.get('q'));
    const kat = str(url.searchParams.get('kategori'));
    const status = str(url.searchParams.get('status'));
    let rows = [...db.barang];
    if (q) rows = rows.filter((b) => like(b.kode, q) || like(b.nama, q) || like(b.kategori, q) || like(b.lokasi, q));
    if (kat) rows = rows.filter((b) => b.kategori === kat);
    if (status === 'tersedia') rows = rows.filter((b) => b.stok_tersedia > 0);
    if (status === 'habis') rows = rows.filter((b) => b.stok_tersedia === 0);
    if (status === 'dipinjam') rows = rows.filter((b) => b.stok_tersedia < b.stok_total);
    rows.sort((a, b) => a.kode.localeCompare(b.kode));
    return json({
        rows,
        kategori: [...new Set(db.barang.map((b) => b.kategori))].sort(),
        nextKode: formatKode(db.seq.barang + 1),
    });
}

function validateBarang(body, dipinjam) {
    const d = { nama: str(body.nama), kategori: str(body.kategori), lokasi: str(body.lokasi), stok: str(body.stok_total) };
    const e = {};
    if (!d.nama || len(d.nama) > 150) e.nama = 'Nama barang wajib diisi (maks. 150 karakter).';
    if (!d.kategori || len(d.kategori) > 50) e.kategori = 'Kategori wajib diisi (maks. 50 karakter).';
    if (len(d.lokasi) > 100) e.lokasi = 'Lokasi maks. 100 karakter.';
    if (!/^\d{1,6}$/.test(d.stok)) e.stok_total = 'Stok harus berupa angka 0 – 999999.';
    else if (Number(d.stok) < dipinjam) e.stok_total = `Stok tidak boleh kurang dari jumlah yang sedang dipinjam (${dipinjam} unit).`;
    if (Object.keys(e).length) throw validationError(e);
    return { ...d, stok: Number(d.stok) };
}

async function createBarang(req, body) {
    return mutate((db) => {
        const u = requireAdmin(req, db);
        const d = validateBarang(body, 0);
        let kode;
        do { kode = formatKode(++db.seq.barang); } while (db.barang.some((b) => b.kode === kode));
        db.barang.push({ kode, nama: d.nama, kategori: d.kategori, lokasi: d.lokasi || null, stok_total: d.stok, stok_tersedia: d.stok, created_at: now(), updated_at: null });
        log(db, u, 'barang_tambah', `Menambah barang ${kode} - ${d.nama} (kategori ${d.kategori}, lokasi ${d.lokasi || '-'}, stok ${d.stok})`);
        return json({ message: `Barang ${kode} - ${d.nama} berhasil ditambahkan.`, kode }, 201);
    });
}

async function updateBarang(req, kode, body) {
    return mutate((db) => {
        const u = requireAdmin(req, db);
        const b = db.barang.find((x) => x.kode === kode);
        if (!b) throw new HttpError(404, 'Barang tidak ditemukan.');
        const dipinjam = b.stok_total - b.stok_tersedia;
        const d = validateBarang(body, dipinjam);
        // Kode tidak pernah diubah (primary key). Stok tersedia = total baru - yang sedang dipinjam.
        const perubahan = diffText(b, { nama: d.nama, kategori: d.kategori, lokasi: d.lokasi, stok_total: d.stok },
            { nama: 'nama', kategori: 'kategori', lokasi: 'lokasi', stok_total: 'stok' });
        Object.assign(b, { nama: d.nama, kategori: d.kategori, lokasi: d.lokasi || null, stok_total: d.stok, stok_tersedia: d.stok - dipinjam, updated_at: now() });
        log(db, u, 'barang_ubah', `Mengubah barang ${kode}: ${perubahan}`);
        return json({ message: `Barang ${kode} berhasil diperbarui.` });
    });
}

async function deleteBarang(req, kode) {
    return mutate((db) => {
        const u = requireAdmin(req, db);
        const i = db.barang.findIndex((x) => x.kode === kode);
        if (i < 0) throw new HttpError(404, 'Barang tidak ditemukan.');
        const b = db.barang[i];
        if (b.stok_tersedia < b.stok_total || db.peminjaman.some((p) => p.barang_kode === kode && p.status === 'dipinjam')) {
            throw new HttpError(409, `Barang ${kode} tidak dapat dihapus karena masih ada unit yang dipinjam.`);
        }
        db.barang.splice(i, 1);
        // Riwayat tetap utuh: kode & nama barang tersimpan di transaksi. Kode tidak dipakai ulang.
        for (const p of db.peminjaman) if (p.barang_kode === kode) p.barang_kode = null;
        log(db, u, 'barang_hapus', `Menghapus barang ${kode} - ${b.nama} (kategori ${b.kategori}, lokasi ${b.lokasi || '-'}, stok ${b.stok_total})`);
        return json({ message: `Barang ${kode} - ${b.nama} berhasil dihapus.` });
    });
}

/* ====================== peminjaman ====================== */
function listPeminjaman(req, db, url) {
    const u = requireUser(req, db);
    const p = url.searchParams;
    const t = today();
    let rows = [...db.peminjaman];
    const mode = p.get('mode');
    if (mode === 'aktif') {
        rows = rows.filter((r) => r.status === 'dipinjam');
    } else if (mode === 'terbaru') {
        rows = rows.sort((a, b) => b.id - a.id).slice(0, 8);
        return json({ rows: rows.map((r) => withNames(db, r)) });
    } else if (u.role !== 'admin') {
        // Staff hanya melihat transaksi yang relevan: yang ia catat atau proses.
        rows = rows.filter((r) => r.dicatat_oleh === u.id || r.diproses_oleh === u.id);
    } else if (Number(p.get('petugas')) > 0) {
        const pt = Number(p.get('petugas'));
        rows = rows.filter((r) => r.dicatat_oleh === pt || r.diproses_oleh === pt);
    }
    const q = str(p.get('q'));
    if (q) {
        const tid = parseTrx(q);
        rows = rows.filter((r) => like(r.nama_peminjam, q) || like(r.identitas_peminjam, q) || like(r.kode_barang, q) || like(r.nama_barang, q) || r.id === tid);
    }
    const status = p.get('status');
    if (status === 'dipinjam' || status === 'selesai') rows = rows.filter((r) => r.status === status);
    if (status === 'terlambat') rows = rows.filter((r) => isLate(r, t));
    if (validDate(p.get('dari'))) rows = rows.filter((r) => r.tanggal_pinjam >= p.get('dari'));
    if (validDate(p.get('sampai'))) rows = rows.filter((r) => r.tanggal_pinjam <= p.get('sampai'));
    if (mode === 'aktif') {
        rows.sort((a, b) => (a.tanggal_rencana_kembali || '9999').localeCompare(b.tanggal_rencana_kembali || '9999') || a.id - b.id);
    } else {
        rows.sort((a, b) => b.tanggal_pinjam.localeCompare(a.tanggal_pinjam) || b.id - a.id);
    }
    const petugas = u.role === 'admin' ? db.users.map((x) => ({ id: x.id, nama: x.nama })).sort((a, b) => a.nama.localeCompare(b.nama)) : [];
    return json({ rows: rows.map((r) => withNames(db, r)), petugas });
}

async function createPeminjaman(req, body) {
    return mutate((db) => {
        const u = requireUser(req, db);
        const d = {
            nama: str(body.nama_peminjam), ident: str(body.identitas_peminjam), kode: str(body.barang_kode).toUpperCase(),
            jumlah: str(body.jumlah), tgl: str(body.tanggal_pinjam), rencana: str(body.tanggal_rencana_kembali), ket: str(body.keterangan),
        };
        const e = {};
        if (!d.nama || len(d.nama) > 100) e.nama_peminjam = 'Nama peminjam wajib diisi (maks. 100 karakter).';
        if (len(d.ident) > 50) e.identitas_peminjam = 'Maks. 50 karakter.';
        const b = db.barang.find((x) => x.kode === d.kode);
        if (!d.kode) e.barang_kode = 'Pilih barang yang akan dipinjam.';
        else if (!b) e.barang_kode = 'Barang tidak ditemukan.';
        if (!/^\d{1,6}$/.test(d.jumlah) || Number(d.jumlah) < 1) e.jumlah = 'Jumlah minimal 1.';
        else if (b && Number(d.jumlah) > b.stok_tersedia) e.jumlah = `Stok tidak mencukupi. Tersedia ${b.stok_tersedia} unit.`;
        if (!validDate(d.tgl)) e.tanggal_pinjam = 'Tanggal peminjaman tidak valid.';
        else if (d.tgl > today()) e.tanggal_pinjam = 'Tanggal peminjaman tidak boleh melebihi hari ini.';
        if (d.rencana) {
            if (!validDate(d.rencana)) e.tanggal_rencana_kembali = 'Tanggal tidak valid.';
            else if (validDate(d.tgl) && d.rencana < d.tgl) e.tanggal_rencana_kembali = 'Tidak boleh sebelum tanggal peminjaman.';
        }
        if (len(d.ket) > 255) e.keterangan = 'Keterangan maks. 255 karakter.';
        if (Object.keys(e).length) throw validationError(e);

        const jumlah = Number(d.jumlah);
        b.stok_tersedia -= jumlah;
        b.updated_at = now();
        const id = ++db.seq.trx;
        db.peminjaman.push({
            id, nama_peminjam: d.nama, identitas_peminjam: d.ident || null, barang_kode: b.kode, kode_barang: b.kode, nama_barang: b.nama,
            jumlah, tanggal_pinjam: d.tgl, tanggal_rencana_kembali: d.rencana || null, tanggal_kembali: null, kondisi_kembali: null,
            catatan_kembali: null, status: 'dipinjam', keterangan: d.ket || null, dicatat_oleh: u.id, diproses_oleh: null, created_at: now(),
        });
        log(db, u, 'pinjam', `Mencatat peminjaman ${trxCode(id)}: ${jumlah} unit ${b.nama} oleh ${d.nama}`);
        return json({ message: `Transaksi ${trxCode(id)} berhasil disimpan. Status: Dipinjam.` }, 201);
    });
}

async function kembalikan(req, id, body) {
    return mutate((db) => {
        const u = requireUser(req, db);
        const r = db.peminjaman.find((x) => x.id === id);
        if (!r) throw new HttpError(404, 'Transaksi tidak ditemukan.');
        if (r.status !== 'dipinjam') throw new HttpError(409, `Transaksi ${trxCode(id)} sudah diproses sebelumnya.`);
        const kondisi = KONDISI.includes(body.kondisi_kembali) ? body.kondisi_kembali : 'Baik';
        const catatan = [...str(body.catatan_kembali)].slice(0, 255).join('');
        Object.assign(r, { status: 'selesai', tanggal_kembali: now(), kondisi_kembali: kondisi, catatan_kembali: catatan || null, diproses_oleh: u.id });
        const b = db.barang.find((x) => x.kode === r.barang_kode);
        if (b) { b.stok_tersedia += r.jumlah; b.updated_at = now(); }
        log(db, u, 'kembali', `Memproses pengembalian ${trxCode(id)}: ${r.jumlah} unit ${r.nama_barang} dari ${r.nama_peminjam}` + (kondisi !== 'Baik' ? ` (kondisi: ${kondisi})` : ''));
        return json({ message: `Pengembalian ${trxCode(id)} berhasil diproses. Stok ${r.nama_barang} bertambah ${r.jumlah} unit, status transaksi: Selesai.` });
    });
}

async function batalKembali(req, id) {
    return mutate((db) => {
        const u = requireAdmin(req, db);
        const r = db.peminjaman.find((x) => x.id === id);
        if (!r || r.status !== 'selesai') throw new HttpError(409, 'Hanya transaksi berstatus Selesai yang pengembaliannya bisa dibatalkan.');
        const b = db.barang.find((x) => x.kode === r.barang_kode);
        if (b) {
            if (b.stok_tersedia < r.jumlah) {
                throw new HttpError(409, `Pengembalian ${trxCode(id)} tidak bisa dibatalkan: stok ${r.nama_barang} yang tersedia kurang dari ${r.jumlah} unit karena sedang dipinjam transaksi lain.`);
            }
            b.stok_tersedia -= r.jumlah;
            b.updated_at = now();
        }
        Object.assign(r, { status: 'dipinjam', tanggal_kembali: null, kondisi_kembali: null, catatan_kembali: null, diproses_oleh: null });
        log(db, u, 'batal_kembali', `Membatalkan pengembalian ${trxCode(id)}: ${r.jumlah} unit ${r.nama_barang} kembali berstatus Dipinjam`);
        return json({ message: `Pengembalian ${trxCode(id)} dibatalkan. Status kembali menjadi Dipinjam dan stok ${r.nama_barang} berkurang ${r.jumlah} unit.` });
    });
}

async function hapusTransaksi(req, id) {
    return mutate((db) => {
        const u = requireAdmin(req, db);
        const i = db.peminjaman.findIndex((x) => x.id === id);
        if (i < 0) throw new HttpError(404, 'Transaksi tidak ditemukan atau sudah dihapus.');
        const r = db.peminjaman[i];
        db.peminjaman.splice(i, 1);
        if (r.status === 'dipinjam') {
            const b = db.barang.find((x) => x.kode === r.barang_kode);
            if (b) { b.stok_tersedia += r.jumlah; b.updated_at = now(); }
        }
        log(db, u, 'trx_hapus', `Menghapus transaksi ${trxCode(id)}: ${r.jumlah} unit ${r.nama_barang} oleh ${r.nama_peminjam} (status ${r.status})`);
        const info = r.status === 'dipinjam' ? `Stok ${r.nama_barang} dikembalikan ${r.jumlah} unit.` : 'Stok tidak berubah karena barang sudah dikembalikan.';
        return json({ message: `Transaksi ${trxCode(id)} dihapus. ${info}` });
    });
}

async function hapusSemuaRiwayat(req, body) {
    if (body.konfirmasi !== 'HAPUS') throw new HttpError(422, 'Riwayat tidak dihapus. Ketik HAPUS (huruf besar) untuk konfirmasi.');
    const semua = body.cakupan === 'semua';
    return mutate((db) => {
        const u = requireAdmin(req, db);
        let n;
        if (semua) {
            n = db.peminjaman.length;
            db.peminjaman = [];
            for (const b of db.barang) if (b.stok_tersedia !== b.stok_total) { b.stok_tersedia = b.stok_total; b.updated_at = now(); }
        } else {
            const before = db.peminjaman.length;
            db.peminjaman = db.peminjaman.filter((r) => r.status !== 'selesai');
            n = before - db.peminjaman.length;
        }
        log(db, u, 'trx_hapus', semua
            ? `Menghapus semua riwayat transaksi (${n} transaksi, termasuk yang masih dipinjam; stok dikembalikan penuh)`
            : `Menghapus riwayat transaksi yang sudah selesai (${n} transaksi)`);
        return json({
            message: n === 0 ? 'Tidak ada transaksi yang perlu dihapus.'
                : semua ? `${n} transaksi dihapus. Semua stok barang kembali tersedia.`
                    : `${n} transaksi yang sudah selesai dihapus. Peminjaman aktif tetap tersimpan.`,
        });
    });
}

/* ====================== pengguna ====================== */
function listUsers(req, db) {
    requireAdmin(req, db);
    const rows = db.users.map((x) => ({
        id: x.id, nama: x.nama, username: x.username, role: x.role, is_active: x.is_active, last_login: x.last_login,
        jml_pinjam: db.peminjaman.filter((p) => p.dicatat_oleh === x.id).length,
        jml_kembali: db.peminjaman.filter((p) => p.diproses_oleh === x.id).length,
    })).sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) || a.nama.localeCompare(b.nama));
    return json({ rows });
}

function validateUser(db, body, target) {
    const d = { nama: str(body.nama), username: str(body.username), password: typeof body.password === 'string' ? body.password : '', konfirmasi: typeof body.password_konfirmasi === 'string' ? body.password_konfirmasi : '' };
    const e = {};
    if (!d.nama || len(d.nama) > 100) e.nama = 'Nama wajib diisi (maks. 100 karakter).';
    if (!/^[A-Za-z0-9_.]{3,50}$/.test(d.username)) e.username = 'Username 3–50 karakter: huruf, angka, titik, atau garis bawah.';
    else if (db.users.some((x) => x.username.toLowerCase() === d.username.toLowerCase() && x.id !== target?.id)) e.username = 'Username sudah digunakan.';
    if (!target || d.password !== '') {
        if (d.password.length < 6) e.password = 'Password minimal 6 karakter.';
        else if (d.password !== d.konfirmasi) e.password_konfirmasi = 'Konfirmasi password tidak sama.';
    }
    if (Object.keys(e).length) throw validationError(e);
    return d;
}

async function createUser(req, body) {
    return mutate((db) => {
        const u = requireAdmin(req, db);
        const d = validateUser(db, body, null);
        const id = ++db.seq.user;
        db.users.push({ id, nama: d.nama, username: d.username, password_hash: hashPassword(d.password), role: 'staff', is_active: body.is_active !== false, last_login: null, created_at: now(), updated_at: null });
        log(db, u, 'user', `Menambah akun Staff ${d.nama} (${d.username})`);
        return json({ message: `Akun Staff ${d.nama} berhasil dibuat.` }, 201);
    });
}

async function updateUser(req, id, body) {
    return mutate((db) => {
        const me = requireAdmin(req, db);
        const t = db.users.find((x) => x.id === id);
        if (!t || (t.role !== 'staff' && t.id !== me.id)) throw new HttpError(404, 'Pengguna tidak ditemukan atau tidak dapat diubah.');
        const d = validateUser(db, body, t);
        const isSelf = t.id === me.id;
        const aktif = isSelf ? true : body.is_active !== false;
        const st = (v) => (v ? 'Aktif' : 'Nonaktif');
        let perubahan = diffText({ nama: t.nama, username: t.username, status: st(t.is_active) }, { nama: d.nama, username: d.username, status: st(aktif) },
            { nama: 'nama', username: 'username', status: 'status' });
        Object.assign(t, { nama: d.nama, username: d.username, is_active: aktif, updated_at: now() });
        if (d.password) {
            t.password_hash = hashPassword(d.password);
            perubahan = (perubahan === 'tanpa perubahan data' ? '' : perubahan + ', ') + 'password diganti';
        }
        log(db, me, 'user', `Mengubah akun ${t.username}: ${perubahan}`);
        return json({ message: `Data akun ${d.nama} berhasil diperbarui.` });
    });
}

async function toggleUser(req, id) {
    return mutate((db) => {
        const me = requireAdmin(req, db);
        const t = db.users.find((x) => x.id === id && x.role === 'staff');
        if (!t) throw new HttpError(404, 'Akun Staff tidak ditemukan.');
        t.is_active = !t.is_active;
        t.updated_at = now();
        log(db, me, 'user', `${t.is_active ? 'Mengaktifkan' : 'Menonaktifkan'} akun Staff ${t.nama} (${t.username})`);
        return json({ message: `Akun ${t.nama} berhasil ${t.is_active ? 'diaktifkan' : 'dinonaktifkan'}.` });
    });
}

async function deleteUser(req, id) {
    return mutate((db) => {
        const me = requireAdmin(req, db);
        const i = db.users.findIndex((x) => x.id === id && x.role === 'staff');
        if (i < 0) throw new HttpError(404, 'Hanya akun Staff yang bisa dihapus.');
        const t = db.users[i];
        db.users.splice(i, 1);
        for (const p of db.peminjaman) {
            if (p.dicatat_oleh === id) p.dicatat_oleh = null;
            if (p.diproses_oleh === id) p.diproses_oleh = null;
        }
        log(db, me, 'user', `Menghapus akun Staff ${t.nama} (${t.username})`);
        return json({ message: `Akun ${t.nama} berhasil dihapus. Riwayat transaksinya tetap tersimpan.` });
    });
}

/* ====================== log aktivitas ====================== */
const GRUP = {
    barang: ['barang_tambah', 'barang_ubah', 'barang_hapus'],
    transaksi: ['pinjam', 'kembali', 'trx_hapus', 'batal_kembali'],
    pengguna: ['user'],
    akses: ['login', 'logout', 'log_hapus', 'sistem'],
};
function listAktivitas(req, db, url) {
    requireAdmin(req, db);
    const grup = url.searchParams.get('grup');
    const aksi = url.searchParams.get('aksi');
    const q = str(url.searchParams.get('q'));
    let rows = [...db.aktivitas];
    if (GRUP[grup]) rows = rows.filter((a) => GRUP[grup].includes(a.aksi));
    if (aksi) rows = rows.filter((a) => a.aksi === aksi);
    if (q) rows = rows.filter((a) => like(a.deskripsi, q) || like(a.nama_user, q));
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    return json({ rows, total: db.aktivitas.length });
}
async function hapusSemuaLog(req, body) {
    if (body.konfirmasi !== 'HAPUS') throw new HttpError(422, 'Log tidak dihapus. Ketik HAPUS (huruf besar) untuk konfirmasi.');
    return mutate((db) => {
        const u = requireAdmin(req, db);
        const n = db.aktivitas.length;
        db.aktivitas = [];
        log(db, u, 'log_hapus', `Menghapus semua log aktivitas (${n} entri)`);
        return json({ message: `${n} entri log aktivitas dihapus.` });
    });
}

/* ====================== router ====================== */
export async function handle(req) {
    try {
        const url = new URL(req.url);
        const path = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)/, '').replace(/\/+$/, '') || '/';
        const method = req.method.toUpperCase();

        // Proteksi CSRF: semua permintaan pengubah data wajib membawa header khusus
        // (tidak bisa dikirim lintas situs tanpa izin CORS), ditambah cookie SameSite=Strict.
        if (method !== 'GET' && req.headers.get('x-requested-with') !== 'fetch') {
            throw new HttpError(403, 'Permintaan ditolak.');
        }
        let body = {};
        if (method !== 'GET') {
            try { body = (await req.json()) || {}; } catch { body = {}; }
        }
        let m;
        if (path === '/login' && method === 'POST') return await login(req, body);
        if (path === '/logout' && method === 'POST') return await logout(req);
        if (path === '/me' && method === 'GET') {
            const db = await load();
            const u = currentUser(req, db);
            return u ? json({ user: publicUser(u) }) : json({ error: 'Belum login.' }, 401);
        }
        if (path === '/dashboard' && method === 'GET') return dashboard(req, await load());

        if (path === '/barang' && method === 'GET') return listBarang(req, await load(), url);
        if (path === '/barang' && method === 'POST') return await createBarang(req, body);
        if ((m = path.match(/^\/barang\/([A-Za-z0-9._-]+)$/))) {
            const kode = m[1].toUpperCase();
            if (method === 'PUT') return await updateBarang(req, kode, body);
            if (method === 'DELETE') return await deleteBarang(req, kode);
        }

        if (path === '/peminjaman' && method === 'GET') return listPeminjaman(req, await load(), url);
        if (path === '/peminjaman' && method === 'POST') return await createPeminjaman(req, body);
        if (path === '/peminjaman/hapus-semua' && method === 'POST') return await hapusSemuaRiwayat(req, body);
        if ((m = path.match(/^\/peminjaman\/(\d+)(\/kembali|\/batal-kembali)?$/))) {
            const id = Number(m[1]);
            if (m[2] === '/kembali' && method === 'POST') return await kembalikan(req, id, body);
            if (m[2] === '/batal-kembali' && method === 'POST') return await batalKembali(req, id);
            if (!m[2] && method === 'DELETE') return await hapusTransaksi(req, id);
        }

        if (path === '/users' && method === 'GET') return listUsers(req, await load());
        if (path === '/users' && method === 'POST') return await createUser(req, body);
        if ((m = path.match(/^\/users\/(\d+)(\/toggle)?$/))) {
            const id = Number(m[1]);
            if (m[2] && method === 'POST') return await toggleUser(req, id);
            if (!m[2] && method === 'PUT') return await updateUser(req, id, body);
            if (!m[2] && method === 'DELETE') return await deleteUser(req, id);
        }

        if (path === '/aktivitas' && method === 'GET') return listAktivitas(req, await load(), url);
        if (path === '/aktivitas/hapus-semua' && method === 'POST') return await hapusSemuaLog(req, body);

        throw new HttpError(404, 'Alamat API tidak ditemukan.');
    } catch (err) {
        if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status);
        console.error(err);
        return json({ error: 'Terjadi kesalahan pada server.' }, 500);
    }
}
