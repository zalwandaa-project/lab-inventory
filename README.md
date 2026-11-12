# Laboratory Inventory & Borrowing Management System — versi Netlify

Aplikasi web untuk mengelola inventaris dan peminjaman barang laboratorium komputer,
siap di-hosting gratis di **Netlify**.

- **Tampilan:** HTML + CSS + JavaScript (Bootstrap 5, desain diadaptasi dari template AutoMark – MIT)
- **Server:** Netlify Functions (Node.js) — semua aturan bisnis dan pembatasan akses dijalankan di server
- **Database:** Netlify Blobs (penyimpanan bawaan Netlify, tidak perlu daftar layanan lain)

## Akun Demo

| Role  | Username | Password |
|-------|----------|----------|
| Admin | `admin`  | `admin123` |
| Staff | `staff1` | `staff123` |
| Staff | `staff2` | `staff123` |
| Staff (nonaktif) | `staff3` | `staff123` |

Data awal (5 barang sesuai soal, akun, dan 9 contoh transaksi) dibuat otomatis saat aplikasi pertama kali dibuka.

## Fitur

| Fitur | Admin | Staff |
|---|:-:|:-:|
| Login/logout, pembatasan akses per role (dicek di server) | ✔ | ✔ |
| Ringkasan: total barang, tersedia, dipinjam, total transaksi, aktivitas terbaru | ✔ | ✔ |
| Lihat & cari barang, status ketersediaan | ✔ | ✔ |
| Tambah / edit / hapus barang (kode otomatis BR001, BR002, … dan tidak bisa diubah) | ✔ | ✘ |
| Catat peminjaman (nama, barang, jumlah, tanggal) | ✔ | ✔ |
| Proses pengembalian (stok bertambah, status Selesai) | ✔ | ✔ |
| Riwayat transaksi + filter + ekspor CSV + cetak | ✔ (semua) | ✔ (yang ia tangani) |
| Hapus transaksi, batalkan pengembalian, hapus semua riwayat | ✔ | ✘ |
| Kelola akun Staff: tambah, ubah, aktif/nonaktif, hapus | ✔ | ✘ |
| Log aktivitas & riwayat perubahan data (nilai lama → baru), hapus semua log | ✔ | ✘ |

Keamanan: password di-hash (scrypt), sesi berupa cookie HttpOnly bertanda tangan HMAC, proteksi CSRF,
stok dijaga dengan penulisan bersyarat (tidak bisa minus walau dua petugas menyimpan bersamaan).

## Cara Online di Netlify (lewat GitHub)

1. **Upload ke GitHub**
   - Buat repository baru di github.com (mis. `lab-inventory`).
   - Klik **uploading an existing file**, lalu tarik semua isi folder ini (termasuk `netlify.toml`,
     `package.json`, folder `netlify` dan `public`). Klik **Commit changes**.
2. **Hubungkan ke Netlify**
   - Login ke app.netlify.com (bisa pakai akun GitHub).
   - **Add new site → Import an existing project → GitHub** → pilih repository tadi.
   - Pengaturan build biarkan terisi otomatis dari `netlify.toml`
     (Publish directory: `public`, Functions directory: `netlify/functions`, Build command: kosong).
   - Klik **Deploy**. Tunggu 1–2 menit sampai status **Published**.
3. **Ubah nama situs (opsional)**: Site configuration → Change site name → mis. `lab-alwanda`
   sehingga alamatnya `https://lab-alwanda.netlify.app`.
4. **Buka alamatnya** → login `admin` / `admin123`. Data awal otomatis dibuat.

> Jangan pakai fitur *drag & drop* (Netlify Drop): fitur itu hanya untuk situs statis, sehingga server (Functions) tidak ikut jalan.

### Opsional
- **SESSION_SECRET**: Site configuration → Environment variables → tambah `SESSION_SECRET` berisi teks acak panjang.
  Bila tidak diisi, aplikasi membuat kunci sendiri dan menyimpannya di database.

## Menjalankan di Komputer Sendiri

Butuh Node.js 20+.
```
node dev-server.mjs
```
Buka http://localhost:8888. Data uji coba disimpan di file `.local-db.json` (hapus file ini untuk mengulang dari data awal).

## Struktur Folder
```
├── netlify.toml               # Konfigurasi Netlify
├── package.json               # Dependensi (@netlify/blobs)
├── netlify/
│   ├── functions/api.mjs      # Netlify Function: menangani semua /api/*
│   └── lib/
│       ├── app.mjs            # Semua endpoint & aturan bisnis
│       ├── store.mjs          # Penyimpanan (Netlify Blobs / file lokal)
│       ├── seed.mjs           # Data awal
│       └── util.mjs           # Waktu WIB, password, sesi, helper
├── public/
│   ├── index.html             # Halaman aplikasi
│   └── assets/                # app.js (tampilan), style.css, logo
└── dev-server.mjs             # Server lokal untuk uji coba
```

## Endpoint API
| Method | URL | Keterangan |
|---|---|---|
| POST | /api/login, /api/logout | Masuk / keluar |
| GET | /api/me, /api/dashboard | Akun aktif, ringkasan |
| GET/POST | /api/barang | Daftar / tambah barang (Admin) |
| PUT/DELETE | /api/barang/:kode | Ubah / hapus barang (Admin) |
| GET/POST | /api/peminjaman | Riwayat / catat peminjaman |
| POST | /api/peminjaman/:id/kembali | Proses pengembalian |
| POST | /api/peminjaman/:id/batal-kembali | Batalkan pengembalian (Admin) |
| DELETE | /api/peminjaman/:id | Hapus transaksi (Admin) |
| POST | /api/peminjaman/hapus-semua | Hapus semua riwayat (Admin) |
| GET/POST | /api/users | Daftar / tambah Staff (Admin) |
| PUT/DELETE | /api/users/:id | Ubah / hapus akun (Admin) |
| POST | /api/users/:id/toggle | Aktif/nonaktifkan Staff (Admin) |
| GET | /api/aktivitas | Log aktivitas (Admin) |
| POST | /api/aktivitas/hapus-semua | Hapus semua log (Admin) |

## Teknologi
JavaScript (Node.js 20), Netlify Functions, Netlify Blobs, HTML5, CSS3, Bootstrap 5, Bootstrap Icons, GitHub, Netlify.
