/* =====================================================================
 * Laboratory Inventory & Borrowing Management System — tampilan (SPA)
 * Semua data diambil dari /api (Netlify Functions).
 * ===================================================================== */
const APP = 'LabInventory';
const APP_FULL = 'Laboratory Inventory & Borrowing Management System';
const state = { user: null, flashes: [] };
const app = document.getElementById('app');

/* ---------------- util ---------------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const wib = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
const todayStr = () => { const d = wib(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function tgl(s, withTime = false) {
    if (!s) return '-';
    const [d, t] = s.split(' ');
    const [y, m, dd] = d.split('-').map(Number);
    return `${dd} ${BULAN[m - 1]} ${y}` + (withTime && t ? `, ${t.slice(0, 5)}` : '');
}
function hariIni() { const d = wib(); return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}`; }
function timeAgo(s) {
    const t = new Date(s.replace(' ', 'T') + '+07:00').getTime();
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return 'baru saja';
    if (diff < 3600) return Math.floor(diff / 60) + ' menit lalu';
    if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' hari lalu';
    return tgl(s, true);
}
const isAdmin = () => state.user?.role === 'admin';

function statusBadge(r) {
    if (r.status === 'selesai') return '<span class="status status-done">Selesai</span>';
    if (r.terlambat) return '<span class="status status-late">Terlambat</span>';
    return '<span class="status status-out">Dipinjam</span>';
}
function stockBadge(t, total) {
    if (t <= 0) return '<span class="status status-empty">Habis</span>';
    if (t <= Math.max(1, Math.floor(total * 0.2))) return '<span class="status status-low">Hampir habis</span>';
    return '<span class="status status-ok">Tersedia</span>';
}
const STAR_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path class="star" d="M5.83 3.65a.44.44 0 0 0-.41.28l-.3.81c-.41 1.1-.58 1.53-.88 1.83-.31.3-.73.47-1.83.88l-.81.3a.44.44 0 0 0 0 .82l.81.3c1.1.41 1.52.58 1.83.88.3.31.47.73.88 1.83l.3.81a.44.44 0 0 0 .82 0l.3-.81c.41-1.1.58-1.52.88-1.83.31-.3.73-.47 1.83-.88l.81-.3a.44.44 0 0 0 0-.82l-.81-.3c-1.1-.41-1.52-.58-1.83-.88-.3-.31-.47-.73-.88-1.83l-.3-.81a.44.44 0 0 0-.41-.28Z"/><path class="star" d="M10.5 1.31a.44.44 0 0 0-.41.29l-.13.35c-.18.49-.24.61-.32.69-.08.08-.2.14-.69.32l-.35.13a.44.44 0 0 0 0 .82l.35.13c.49.18.61.24.69.32.08.08.14.2.32.69l.13.35a.44.44 0 0 0 .82 0l.13-.35c.18-.49.24-.61.32-.69.08-.08.2-.14.69-.32l.35-.13a.44.44 0 0 0 0-.82l-.35-.13c-.49-.18-.61-.24-.69-.32-.08-.08-.14-.2-.32-.69l-.13-.35a.44.44 0 0 0-.41-.29Z"/></svg>';
const tplBadge = (text) => `<span class="tpl-badge">${STAR_SVG}${esc(text)}</span>`;

/* ---------------- API ---------------- */
class ApiError extends Error {
    constructor(status, data) { super(data?.error || 'Terjadi kesalahan.'); this.status = status; this.data = data || {}; }
}
async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch { data = {}; }
    if (res.status === 401 && path !== '/login') {
        state.user = null;
        flash('warning', data.error || 'Sesi berakhir. Silakan login kembali.');
        renderLogin();
        throw new ApiError(401, data);
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
}
function flash(type, msg) { state.flashes.push([type, msg]); }
function takeFlashes() {
    const f = state.flashes; state.flashes = [];
    return f.map(([t, m]) => `<div class="note note-${esc(t)}" role="status"><span>${esc(m)}</span><button type="button" class="btn-close btn-sm" aria-label="Tutup"></button></div>`).join('');
}
function showError(err) {
    if (err instanceof ApiError && err.status === 401) return;
    flash('danger', err.message || 'Terjadi kesalahan.');
    const box = document.getElementById('flashBox');
    if (box) { box.innerHTML = takeFlashes(); bindFlash(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}
function bindFlash() {
    document.querySelectorAll('.note .btn-close').forEach((b) => b.addEventListener('click', () => b.parentElement.remove()));
}
function formErrors(form, err) {
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    form.querySelectorAll('.invalid-feedback.dyn').forEach((el) => el.remove());
    const errors = err?.data?.errors;
    if (!errors) { showError(err); return; }
    for (const [name, msg] of Object.entries(errors)) {
        const input = form.querySelector(`[name="${name}"]`);
        if (!input) continue;
        input.classList.add('is-invalid');
        const fb = document.createElement('div');
        fb.className = 'invalid-feedback dyn';
        fb.textContent = msg;
        input.insertAdjacentElement('afterend', fb);
    }
    form.querySelector('.is-invalid')?.focus();
}
const formData = (form) => Object.fromEntries(new FormData(form).entries());

/* ---------------- routing ---------------- */
function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/dashboard';
    const [path, qs] = raw.split('?');
    return { path, params: new URLSearchParams(qs || '') };
}
function go(path) { if (location.hash === '#' + path) router(); else location.hash = path; }
function setQuery(path, obj) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null) p.set(k, v);
    go(path + (p.toString() ? '?' + p : ''));
}

const ROUTES = [
    [/^\/dashboard$/, pageDashboard],
    [/^\/barang$/, pageBarang],
    [/^\/barang\/tambah$/, pageBarangForm, true],
    [/^\/barang\/edit\/([A-Z0-9._-]+)$/i, pageBarangForm, true],
    [/^\/peminjaman$/, pagePeminjaman],
    [/^\/pengembalian$/, pagePengembalian],
    [/^\/riwayat$/, pageRiwayat],
    [/^\/pengguna$/, pagePengguna, true],
    [/^\/pengguna\/tambah$/, pageUserForm, true],
    [/^\/pengguna\/edit\/(\d+)$/, pageUserForm, true],
    [/^\/log$/, pageLog, true],
];

async function router() {
    if (!state.user) {
        try { state.user = (await api('/me')).user; } catch { return; }
    }
    const { path, params } = parseHash();
    for (const [re, fn, adminOnly] of ROUTES) {
        const m = path.match(re);
        if (!m) continue;
        if (adminOnly && !isAdmin()) { renderShell('Akses Ditolak', '', `<div class="card"><div class="card-body text-center py-5"><i class="bi bi-shield-lock display-4 text-danger"></i><h4 class="mt-3">Akses ditolak</h4><p class="text-muted">Halaman ini hanya dapat diakses oleh Admin.</p><a href="#/dashboard" class="btn btn-primary">Kembali ke Ringkasan</a></div></div>`); return; }
        try { await fn(params, ...m.slice(1)); } catch (e) { if (!(e instanceof ApiError && e.status === 401)) { renderShell('Terjadi kesalahan', '', ''); showError(e); } }
        return;
    }
    go('/dashboard');
}
window.addEventListener('hashchange', router);

/* ---------------- shell (header, judul, menu) ---------------- */
const NAV = [
    ['dashboard', '#/dashboard', 'Ringkasan', 'bi-grid-1x2', false],
    ['barang', '#/barang', 'Barang', 'bi-box-seam', false],
    ['peminjaman', '#/peminjaman', 'Peminjaman', 'bi-box-arrow-up-right', false],
    ['pengembalian', '#/pengembalian', 'Pengembalian', 'bi-box-arrow-in-down-left', false],
    ['riwayat', '#/riwayat', 'Riwayat', 'bi-clock-history', false],
    ['pengguna', '#/pengguna', 'Pengguna', 'bi-people', true],
    ['log', '#/log', 'Log', 'bi-activity', true],
];
const SHORT = { peminjaman: 'Pinjam', pengembalian: 'Kembali' };

function renderShell(title, active, content) {
    document.title = `${title} - ${APP}`;
    document.body.className = '';
    const u = state.user;
    const items = NAV.filter((n) => !n[4] || isAdmin());
    app.innerHTML = `
<header class="site-header" id="siteHeader">
    <div class="container-xl header-row">
        <a class="brand" href="#/dashboard"><img src="/assets/logo-mark.svg" alt="" width="36" height="36" class="brand-logo"><span>${APP}</span></a>
        <nav class="pill-nav d-none d-lg-flex" aria-label="Menu utama">
            <span class="pill-indicator" aria-hidden="true"></span>
            ${items.map(([k, h, l, i]) => `<a href="${h}" title="${l}" class="pill-link${active === k ? ' active' : ''}"${active === k ? ' aria-current="page"' : ''}><i class="bi ${i}"></i><span>${l}</span></a>`).join('')}
        </nav>
        <div class="dropdown">
            <button class="user-btn dropdown-toggle" data-bs-toggle="dropdown" aria-label="Menu akun">
                <span class="dot">${esc((u.nama || '?').charAt(0).toUpperCase())}</span><span class="uname">${esc(u.nama)}</span>
            </button>
            <div class="dropdown-menu dropdown-menu-end">
                <div class="px-3 py-2 small text-secondary-emphasis">${u.role === 'admin' ? 'Admin' : 'Staff'}, username ${esc(u.username)}</div>
                ${isAdmin() ? `<div class="d-lg-none"><div class="dropdown-divider"></div><a class="dropdown-item" href="#/pengguna"><i class="bi bi-people me-2"></i>Pengguna</a><a class="dropdown-item" href="#/log"><i class="bi bi-activity me-2"></i>Log aktivitas</a></div>` : ''}
                <div class="dropdown-divider"></div>
                <button class="dropdown-item text-danger" id="btnLogout"><i class="bi bi-power me-2"></i>Keluar</button>
            </div>
        </div>
    </div>
</header>
<nav class="bottom-nav d-lg-none" aria-label="Menu utama">
    ${items.filter((n) => !n[4]).map(([k, h, l, i]) => `<a href="${h}" class="${active === k ? 'active' : ''}"><i class="bi ${i}"></i><span>${SHORT[k] || l}</span></a>`).join('')}
</nav>
<section class="page-hero" data-anim="hero">
    <div class="glow" aria-hidden="true"></div>
    <div class="container-xl">${tplBadge(hariIni())}<h1>${esc(title)}</h1></div>
</section>
<main class="container-xl page" data-anim="page">
    <div id="flashBox">${takeFlashes()}</div>
    ${content}
</main>
<footer class="site-footer no-print"><div class="container-xl d-flex flex-wrap justify-content-between gap-2"><span>${APP_FULL}</span><span>&copy; ${new Date().getFullYear()} Laboratorium Komputer</span></div></footer>`;
    bindFlash();
    document.getElementById('btnLogout').addEventListener('click', async () => {
        try { await api('/logout', { method: 'POST' }); } catch { /* abaikan */ }
        state.user = null;
        flash('info', 'Anda sudah keluar.');
        renderLogin();
    });
    window.scrollTo(0, 0);
    initNav();
}

/* ---------------- login ---------------- */
function renderLogin() {
    document.title = `Masuk - ${APP}`;
    history.replaceState(null, '', location.pathname + (location.hash || '#/dashboard'));
    app.innerHTML = `
<div class="login-page">
<main class="login-sheet">
    <span class="brand"><img src="/assets/logo-mark.svg" alt="" width="40" height="40"><span>${APP}</span></span>
    <div>${tplBadge('Laboratorium Komputer')}</div>
    <h1>Masuk</h1>
    <p class="intro">Kelola inventaris dan peminjaman barang lab.</p>
    <div id="flashBox">${takeFlashes()}</div>
    <form id="loginForm" autocomplete="on" novalidate>
        <div class="mb-3"><label class="form-label" for="username">Username</label>
            <input type="text" class="form-control" id="username" name="username" placeholder="Masukkan username" required autofocus></div>
        <div class="mb-4"><label class="form-label" for="password">Password</label>
            <input type="password" class="form-control" id="password" name="password" placeholder="Masukkan password" required></div>
        <button class="btn btn-primary w-100 py-3" id="btnLogin">Masuk</button>
    </form>
    <div class="demo">Akun uji coba: <code>admin</code> / <code>admin123</code> untuk Admin, <code>staff1</code> / <code>staff123</code> untuk Staff.</div>
</main>
</div>`;
    bindFlash();
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const btn = document.getElementById('btnLogin');
        btn.disabled = true;
        try {
            const { user } = await api('/login', { method: 'POST', body: formData(form) });
            state.user = user;
            go('/dashboard');
        } catch (e) {
            document.getElementById('flashBox').innerHTML = `<div class="note note-danger" role="alert"><span>${esc(e.message)}</span></div>`;
            btn.disabled = false;
        }
    });
    document.getElementById('username').focus();
}

/* ---------------- komponen kecil ---------------- */
function paginate(rows, page, per = 15) {
    const pages = Math.max(1, Math.ceil(rows.length / per));
    const p = Math.min(Math.max(1, page || 1), pages);
    return { rows: rows.slice((p - 1) * per, p * per), page: p, pages, total: rows.length };
}
function pagerHtml(pg) {
    if (pg.pages <= 1) return '';
    let h = '<nav><ul class="pagination pagination-sm mb-0">';
    for (let i = 1; i <= pg.pages; i++) h += `<li class="page-item${i === pg.page ? ' active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
    return h + '</ul></nav>';
}
function bindPager(onPage) {
    document.querySelectorAll('[data-page]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); onPage(Number(a.dataset.page)); }));
}
function modal({ title, body, confirmText = 'Simpan', confirmClass = 'btn-primary', word = null, onConfirm }) {
    const el = document.createElement('div');
    el.className = 'modal fade';
    el.tabIndex = -1;
    el.innerHTML = `<div class="modal-dialog"><form class="modal-content" novalidate>
        <div class="modal-header"><h5 class="modal-title">${title}</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button></div>
        <div class="modal-body">${body}${word ? `<label class="form-label mt-3">Ketik <b>${word}</b> untuk konfirmasi</label><input name="konfirmasi" class="form-control" autocomplete="off" placeholder="${word}">` : ''}</div>
        <div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Batal</button><button class="btn ${confirmClass}"${word ? ' disabled' : ''}>${confirmText}</button></div>
    </form></div>`;
    document.body.appendChild(el);
    const m = new bootstrap.Modal(el);
    const form = el.querySelector('form');
    const btn = form.querySelector('.modal-footer .btn:last-child');
    if (word) form.konfirmasi.addEventListener('input', () => { btn.disabled = form.konfirmasi.value.trim() !== word; });
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (btn.disabled) return;
        btn.disabled = true;
        try { await onConfirm(formData(form)); m.hide(); } catch (e) { m.hide(); showError(e); }
    });
    el.addEventListener('hidden.bs.modal', () => el.remove());
    m.show();
}
async function doAction(promise, reload) {
    try {
        const r = await promise;
        if (r?.message) flash('success', r.message);
    } catch (e) {
        flash(e.status === 409 || e.status === 422 ? 'warning' : 'danger', e.message);
    }
    reload ? reload() : router();
}

/* ======================= RINGKASAN ======================= */
async function pageDashboard() {
    const d = await api('/dashboard');
    const admin = isAdmin();
    const h = wib().getHours();
    const sapa = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
    const pctIn = d.stok.total > 0 ? Math.round((d.stok.tersedia / d.stok.total) * 100) : 0;
    const jam = (s) => (s.slice(0, 10) === todayStr() ? s.slice(11, 16) : tgl(s));
    renderShell('Ringkasan', 'dashboard', `
<p class="greeting">${esc(sapa)}, ${esc(state.user.nama)}.</p>
<div class="figures">
    <div><div class="num">${d.stok.total}</div><div class="lbl">Total barang</div><div class="sub">${d.stok.jenis} jenis</div></div>
    <div><div class="num">${d.stok.tersedia}</div><div class="lbl">Tersedia</div><div class="sub">siap dipinjam</div></div>
    <div><div class="num">${d.stok.dipinjam}</div><div class="lbl">Dipinjam</div><div class="sub">dalam ${d.trx.aktif} transaksi</div></div>
    <div><div class="num">${d.trx.total}</div><div class="lbl">Total transaksi</div><div class="sub">${d.trx.hari_ini} hari ini</div></div>
</div>
<div class="availability">
    <div class="track" role="img" aria-label="${pctIn} persen barang tersedia"><div class="fill" style="width:${pctIn}%"></div></div>
    <p>${pctIn}% barang ada di rak${admin ? `, ${d.staffAktif} staff aktif` : ''}.</p>
</div>
${d.trx.terlambat > 0 ? `<p class="late-line">${d.trx.terlambat} peminjaman sudah lewat tanggal kembali. <a href="#/riwayat?status=terlambat">Lihat daftarnya</a></p>` : ''}
<div class="d-flex flex-wrap gap-2 mb-5 quick-actions">
    <a href="#/peminjaman" class="btn btn-primary">Catat peminjaman</a>
    <a href="#/pengembalian" class="btn btn-outline-primary">Terima pengembalian</a>
    ${admin ? '<a href="#/barang/tambah" class="btn btn-outline-primary">Tambah barang</a><a href="#/pengguna/tambah" class="btn btn-outline-primary">Tambah akun staff</a>' : '<a href="#/barang" class="btn btn-outline-primary">Cek ketersediaan</a>'}
</div>
<div class="row g-5">
    <div class="col-xl-7">
        <section class="card">
            <div class="card-header"><span>Sedang dipinjam</span><a href="#/pengembalian">Terima pengembalian</a></div>
            <div class="table-responsive"><table class="table align-middle">
                <thead><tr><th>Barang</th><th>Peminjam</th><th>Harus kembali</th><th>Status</th></tr></thead>
                <tbody>${d.pinjamAktif.map((r) => `<tr class="${r.terlambat ? 'table-danger' : ''}">
                    <td>${esc(r.nama_barang)} <span class="text-muted">(${r.jumlah})</span><div class="small"><code class="kode">${esc(r.kode_barang)}</code></div></td>
                    <td>${esc(r.nama_peminjam)}<div class="small text-muted">${r.kode}</div></td>
                    <td class="text-nowrap">${tgl(r.tanggal_rencana_kembali)}</td><td>${statusBadge(r)}</td></tr>`).join('')
                    || '<tr><td colspan="4" class="text-muted py-4">Semua barang sudah kembali ke rak.</td></tr>'}</tbody>
            </table></div>
        </section>
        <section class="card">
            <div class="card-header"><span>Stok hampir habis</span><a href="#/barang?status=habis">Lihat yang habis</a></div>
            <ul class="list-group list-group-flush">${d.menipis.map((b) => `<li class="list-group-item d-flex justify-content-between align-items-center gap-3">
                <span><code class="kode">${esc(b.kode)}</code> ${esc(b.nama)}</span>
                <span class="text-nowrap">${b.stok_tersedia} dari ${b.stok_total} &nbsp;${stockBadge(b.stok_tersedia, b.stok_total)}</span></li>`).join('')
                || '<li class="list-group-item text-muted">Stok semua barang masih cukup.</li>'}</ul>
        </section>
    </div>
    <div class="col-xl-5">
        <section class="card">
            <div class="card-header"><span>${admin ? 'Catatan aktivitas' : 'Peminjaman & pengembalian terbaru'}</span>${admin ? '<a href="#/log">Buka log lengkap</a>' : ''}</div>
            <ul class="timeline">${d.aktivitas.map((a) => `<li><time title="${esc(timeAgo(a.created_at))}">${esc(jam(a.created_at))}</time><div>${esc(a.deskripsi)}<small>oleh ${esc(a.nama_user)}</small></div></li>`).join('')
                || '<li><span></span><span class="text-muted">Belum ada aktivitas.</span></li>'}</ul>
        </section>
    </div>
</div>`);
    animate();
}

/* ======================= BARANG ======================= */
async function pageBarang(params) {
    const q = params.get('q') || '', kat = params.get('kategori') || '', status = params.get('status') || '';
    const d = await api('/barang?' + new URLSearchParams({ q, kategori: kat, status }));
    const admin = isAdmin();
    const pg = paginate(d.rows, Number(params.get('page')) || 1);
    renderShell('Data Barang', 'barang', `
<div class="card">
    <div class="card-body border-bottom">
        <form class="row g-2 align-items-end filter-form" id="fBarang">
            <div class="col-lg"><label class="form-label small text-muted mb-1">Cari barang</label>
                <input type="search" name="q" value="${esc(q)}" class="form-control" placeholder="Kode, nama, kategori, lokasi…"></div>
            <div class="col-sm-6 col-lg-3"><label class="form-label small text-muted mb-1">Kategori</label>
                <select name="kategori" class="form-select"><option value="">Semua kategori</option>${d.kategori.map((k) => `<option ${k === kat ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
            <div class="col-sm-6 col-lg-2"><label class="form-label small text-muted mb-1">Ketersediaan</label>
                <select name="status" class="form-select"><option value="">Semua</option>
                ${[['tersedia', 'Tersedia'], ['dipinjam', 'Sedang dipinjam'], ['habis', 'Habis']].map(([v, l]) => `<option value="${v}" ${status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="col-lg-auto d-flex gap-2 flex-wrap">
                <button class="btn btn-primary"><i class="bi bi-search"></i> Cari</button>
                <a href="#/barang" class="btn btn-light">Reset</a>
                ${admin ? '<a href="#/barang/tambah" class="btn btn-success ms-auto"><i class="bi bi-plus-lg"></i> Tambah</a>' : ''}
            </div>
        </form>
    </div>
    <div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Kode</th><th>Nama Barang</th><th>Kategori</th><th>Lokasi</th><th class="text-center">Stok</th><th class="text-center">Tersedia</th><th class="text-center">Dipinjam</th><th>Status</th><th class="text-end">Aksi</th></tr></thead>
        <tbody>${pg.rows.map((b) => `<tr>
            <td><code class="kode">${esc(b.kode)}</code></td>
            <td class="fw-semibold">${esc(b.nama)}</td>
            <td><span class="badge text-bg-light border">${esc(b.kategori)}</span></td>
            <td class="text-muted small">${esc(b.lokasi || '-')}</td>
            <td class="text-center">${b.stok_total}</td><td class="text-center fw-bold">${b.stok_tersedia}</td><td class="text-center">${b.stok_total - b.stok_tersedia}</td>
            <td>${stockBadge(b.stok_tersedia, b.stok_total)}</td>
            <td class="text-end text-nowrap">
                ${b.stok_tersedia > 0 ? `<a href="#/peminjaman?barang=${encodeURIComponent(b.kode)}" class="btn btn-sm btn-icon btn-outline-primary" title="Pinjam" aria-label="Pinjam"><i class="bi bi-arrow-up-right"></i></a>` : ''}
                ${admin ? `<a href="#/barang/edit/${encodeURIComponent(b.kode)}" class="btn btn-sm btn-icon btn-outline-secondary" title="Edit" aria-label="Edit"><i class="bi bi-pencil"></i></a>
                <button class="btn btn-sm btn-icon btn-outline-danger" data-hapus="${esc(b.kode)}" data-nama="${esc(b.nama)}" title="Hapus" aria-label="Hapus"><i class="bi bi-trash"></i></button>` : ''}
            </td></tr>`).join('') || '<tr><td colspan="9" class="text-center text-muted py-5">Barang tidak ditemukan.</td></tr>'}</tbody>
    </table></div>
    <div class="card-body d-flex justify-content-between align-items-center"><span class="small text-muted">Menampilkan ${pg.rows.length} dari ${pg.total} barang</span>${pagerHtml(pg)}</div>
</div>`);
    const form = document.getElementById('fBarang');
    form.addEventListener('submit', (ev) => { ev.preventDefault(); setQuery('/barang', formData(form)); });
    bindPager((p) => setQuery('/barang', { q, kategori: kat, status, page: p }));
    document.querySelectorAll('[data-hapus]').forEach((btn) => btn.addEventListener('click', () => {
        if (!confirm(`Hapus barang ${btn.dataset.hapus} - ${btn.dataset.nama}? Riwayat transaksi tetap tersimpan.`)) return;
        doAction(api('/barang/' + encodeURIComponent(btn.dataset.hapus), { method: 'DELETE' }));
    }));
    animate();
}

async function pageBarangForm(params, kode) {
    const d = await api('/barang');
    const b = kode ? d.rows.find((x) => x.kode === kode.toUpperCase()) : null;
    if (kode && !b) { flash('danger', 'Barang tidak ditemukan.'); go('/barang'); return; }
    const dipinjam = b ? b.stok_total - b.stok_tersedia : 0;
    renderShell(b ? 'Edit Barang' : 'Tambah Barang', 'barang', `
<div class="row justify-content-center"><div class="col-lg-7"><div class="card">
    <div class="card-header"><span>${b ? 'Edit ' + esc(b.kode) : 'Barang Baru'}</span></div>
    <div class="card-body"><form id="fForm" novalidate>
        <div class="row g-3">
            <div class="col-md-4"><label class="form-label" for="kode">Kode Barang</label>
                <input id="kode" class="form-control" value="${esc(b ? b.kode : d.nextKode)}" readonly disabled>
                <div class="form-text">${b ? 'Kode tidak dapat diubah.' : 'Dibuat otomatis saat disimpan.'}</div></div>
            <div class="col-md-8"><label class="form-label">Nama Barang</label><input name="nama" class="form-control" value="${esc(b?.nama)}" maxlength="150" required></div>
            <div class="col-md-6"><label class="form-label">Kategori</label><input name="kategori" list="katList" class="form-control" value="${esc(b?.kategori)}" maxlength="50" required>
                <datalist id="katList">${d.kategori.map((k) => `<option value="${esc(k)}">`).join('')}</datalist></div>
            <div class="col-md-6"><label class="form-label">Lokasi Penyimpanan <span class="text-muted small">(opsional)</span></label><input name="lokasi" class="form-control" value="${esc(b?.lokasi)}" maxlength="100" placeholder="mis. Rak B1"></div>
            <div class="col-md-6"><label class="form-label">Jumlah Stok (total unit)</label><input type="number" name="stok_total" min="${dipinjam}" class="form-control" value="${b ? b.stok_total : 1}" required>
                ${b ? `<div class="form-text">Sedang dipinjam: ${dipinjam} unit. Stok tersedia akan disesuaikan otomatis.</div>` : ''}</div>
        </div>
        <div class="d-flex gap-2 mt-4"><button class="btn btn-primary"><i class="bi bi-save"></i> Simpan</button><a href="#/barang" class="btn btn-light">Batal</a></div>
    </form></div>
</div></div></div>`);
    const form = document.getElementById('fForm');
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
            const r = await api(b ? '/barang/' + encodeURIComponent(b.kode) : '/barang', { method: b ? 'PUT' : 'POST', body: formData(form) });
            flash('success', r.message);
            go('/barang');
        } catch (e) { formErrors(form, e); }
    });
    animate();
}

/* ======================= PEMINJAMAN ======================= */
async function pagePeminjaman(params) {
    const [bd, td] = await Promise.all([api('/barang'), api('/peminjaman?mode=terbaru')]);
    const pilih = (params.get('barang') || '').toUpperCase();
    const tersedia = bd.rows.filter((b) => b.stok_tersedia > 0).sort((a, b) => a.nama.localeCompare(b.nama));
    const admin = isAdmin();
    renderShell('Peminjaman Barang', 'peminjaman', `
<div class="row g-4">
    <div class="col-lg-5"><div class="card">
        <div class="card-header"><span>Catat Peminjaman Baru</span></div>
        <div class="card-body"><form id="fPinjam" novalidate>
            <div class="mb-3"><label class="form-label">Nama Peminjam</label><input name="nama_peminjam" class="form-control" maxlength="100" required></div>
            <div class="mb-3"><label class="form-label">NIM / NIP <span class="text-muted small">(opsional)</span></label><input name="identitas_peminjam" class="form-control" maxlength="50"></div>
            <div class="mb-3"><label class="form-label">Barang</label>
                <select name="barang_kode" id="barang_id" class="form-select" required><option value="">— Pilih barang —</option>
                ${tersedia.map((b) => `<option value="${esc(b.kode)}" data-stok="${b.stok_tersedia}" ${b.kode === pilih ? 'selected' : ''}>${esc(b.kode + ' — ' + b.nama)} (tersedia ${b.stok_tersedia})</option>`).join('')}</select></div>
            <div class="mb-3"><label class="form-label">Jumlah</label><input type="number" min="1" name="jumlah" id="jumlah" class="form-control" value="1" required><div class="form-text" id="stok-info"></div></div>
            <div class="row g-2 mb-3">
                <div class="col-6"><label class="form-label">Tanggal Pinjam</label><input type="date" name="tanggal_pinjam" max="${todayStr()}" class="form-control" value="${todayStr()}" required></div>
                <div class="col-6"><label class="form-label">Rencana Kembali</label><input type="date" name="tanggal_rencana_kembali" class="form-control" value="${addDays(todayStr(), 3)}"></div>
            </div>
            <div class="mb-3"><label class="form-label">Keperluan / Keterangan <span class="text-muted small">(opsional)</span></label><textarea name="keterangan" rows="2" maxlength="255" class="form-control"></textarea></div>
            <button class="btn btn-primary w-100"><i class="bi bi-save"></i> Simpan Transaksi</button>
        </form></div>
    </div></div>
    <div class="col-lg-7"><div class="card">
        <div class="card-header"><span>Transaksi Terbaru</span><a href="#/riwayat">Lihat semua riwayat</a></div>
        <div class="table-responsive"><table class="table table-hover align-middle mb-0">
            <thead><tr><th>Transaksi</th><th>Peminjam</th><th>Barang</th><th>Tgl Pinjam</th><th>Status</th>${admin ? '<th></th>' : ''}</tr></thead>
            <tbody>${td.rows.map((r) => `<tr>
                <td><code class="kode">${r.kode}</code><div class="small text-muted">${esc(r.pencatat ?? 'Akun dihapus')}</div></td>
                <td>${esc(r.nama_peminjam)}</td><td>${esc(r.nama_barang)} <span class="text-muted">×${r.jumlah}</span></td>
                <td class="text-nowrap">${tgl(r.tanggal_pinjam)}</td><td>${statusBadge(r)}</td>
                ${admin ? `<td class="text-end"><button class="btn btn-sm btn-icon btn-outline-danger" data-hapus="${r.id}" data-info="${esc(r.kode + ' (' + r.nama_barang + ' oleh ' + r.nama_peminjam + ')')}" data-aktif="${r.status === 'dipinjam' ? 1 : 0}" title="Hapus transaksi" aria-label="Hapus transaksi"><i class="bi bi-trash"></i></button></td>` : ''}
            </tr>`).join('') || `<tr><td colspan="6" class="text-center text-muted py-4">Belum ada transaksi.</td></tr>`}</tbody>
        </table></div>
    </div></div>
</div>`);
    const form = document.getElementById('fPinjam');
    const sel = form.barang_kode, qty = form.jumlah, info = document.getElementById('stok-info');
    const upd = () => { const s = Number(sel.selectedOptions[0]?.dataset.stok || 0); if (s > 0) { qty.max = s; info.textContent = `Stok tersedia: ${s} unit`; } else { qty.removeAttribute('max'); info.textContent = ''; } };
    sel.addEventListener('change', upd); upd();
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try { const r = await api('/peminjaman', { method: 'POST', body: formData(form) }); flash('success', r.message); go('/peminjaman'); } catch (e) { formErrors(form, e); }
    });
    bindHapusTrx();
    animate();
}
function bindHapusTrx() {
    document.querySelectorAll('[data-hapus]').forEach((btn) => btn.addEventListener('click', () => {
        const extra = btn.dataset.aktif === '1' ? ' Barang belum dikembalikan, stoknya akan dikembalikan ke rak.' : '';
        if (!confirm(`Hapus transaksi ${btn.dataset.info}?${extra} Tindakan ini tidak bisa dibatalkan.`)) return;
        doAction(api('/peminjaman/' + btn.dataset.hapus, { method: 'DELETE' }));
    }));
}

/* ======================= PENGEMBALIAN ======================= */
async function pagePengembalian(params) {
    const q = params.get('q') || '';
    const d = await api('/peminjaman?' + new URLSearchParams({ mode: 'aktif', q }));
    const admin = isAdmin();
    renderShell('Pengembalian Barang', 'pengembalian', `
<div class="card">
    <div class="card-body border-bottom"><form class="row g-2 filter-form" id="fCari">
        <div class="col-md-6"><input type="search" name="q" value="${esc(q)}" class="form-control" placeholder="Cari kode transaksi, peminjam, NIM, atau barang…"></div>
        <div class="col-md-6 d-flex gap-2"><button class="btn btn-primary"><i class="bi bi-search"></i> Cari</button><a href="#/pengembalian" class="btn btn-light">Reset</a>
            <span class="ms-auto align-self-center small text-muted">${d.rows.length} barang sedang dipinjam</span></div>
    </form></div>
    <div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Transaksi</th><th>Peminjam</th><th>Barang</th><th class="text-center">Jumlah</th><th>Tgl Pinjam</th><th>Rencana Kembali</th><th>Status</th><th class="text-end">Aksi</th></tr></thead>
        <tbody>${d.rows.map((r) => `<tr class="${r.terlambat ? 'table-danger' : ''}">
            <td><code class="kode">${r.kode}</code><div class="small text-muted">oleh ${esc(r.pencatat ?? 'Akun dihapus')}</div></td>
            <td>${esc(r.nama_peminjam)}<div class="small text-muted">${esc(r.identitas_peminjam || '')}</div></td>
            <td>${esc(r.nama_barang)}<div class="small text-muted">${esc(r.kode_barang)}</div></td>
            <td class="text-center fw-semibold">${r.jumlah}</td><td class="text-nowrap">${tgl(r.tanggal_pinjam)}</td><td class="text-nowrap">${tgl(r.tanggal_rencana_kembali)}</td><td>${statusBadge(r)}</td>
            <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-success" data-kembali="${r.id}"><i class="bi bi-arrow-down-left"></i> Kembalikan</button>
                ${admin ? `<button class="btn btn-sm btn-outline-danger" data-hapus="${r.id}" data-info="${esc(r.kode + ' (' + r.nama_barang + ' oleh ' + r.nama_peminjam + ')')}" data-aktif="1"><i class="bi bi-trash"></i> Hapus</button>` : ''}
            </td></tr>`).join('') || '<tr><td colspan="8" class="text-center text-muted py-5"><i class="bi bi-check2-all fs-3 d-block"></i>Tidak ada barang yang sedang dipinjam.</td></tr>'}</tbody>
    </table></div>
</div>`);
    const form = document.getElementById('fCari');
    form.addEventListener('submit', (ev) => { ev.preventDefault(); setQuery('/pengembalian', formData(form)); });
    document.querySelectorAll('[data-kembali]').forEach((btn) => btn.addEventListener('click', () => {
        const r = d.rows.find((x) => x.id === Number(btn.dataset.kembali));
        modal({
            title: `Proses Pengembalian <span class="text-primary">${r.kode}</span>`,
            body: `<dl class="row small mb-3">
                <dt class="col-4">Peminjam</dt><dd class="col-8">${esc(r.nama_peminjam)}</dd>
                <dt class="col-4">Barang</dt><dd class="col-8">${esc(r.kode_barang + ' — ' + r.nama_barang)}</dd>
                <dt class="col-4">Jumlah</dt><dd class="col-8">${r.jumlah} unit</dd>
                <dt class="col-4">Tgl Pinjam</dt><dd class="col-8">${tgl(r.tanggal_pinjam)}</dd></dl>
                <div class="mb-3"><label class="form-label">Kondisi Barang</label><select name="kondisi_kembali" class="form-select"><option>Baik</option><option>Rusak Ringan</option><option>Rusak Berat</option></select></div>
                <div><label class="form-label">Catatan <span class="text-muted small">(opsional)</span></label><textarea name="catatan_kembali" rows="2" maxlength="255" class="form-control"></textarea></div>`,
            confirmText: '<i class="bi bi-check2-circle"></i> Konfirmasi Pengembalian', confirmClass: 'btn-success',
            onConfirm: async (data) => { const res = await api(`/peminjaman/${r.id}/kembali`, { method: 'POST', body: data }); flash('success', res.message); router(); },
        });
    }));
    bindHapusTrx();
    animate();
}

/* ======================= RIWAYAT ======================= */
async function pageRiwayat(params) {
    const f = { q: params.get('q') || '', status: params.get('status') || '', dari: params.get('dari') || '', sampai: params.get('sampai') || '', petugas: params.get('petugas') || '' };
    const d = await api('/peminjaman?' + new URLSearchParams(f));
    const admin = isAdmin();
    const pg = paginate(d.rows, Number(params.get('page')) || 1);
    renderShell(admin ? 'Riwayat Peminjaman & Pengembalian' : 'Riwayat Transaksi Saya', 'riwayat', `
<div class="card">
    <div class="card-body border-bottom"><form class="row g-2 align-items-end filter-form" id="fRiwayat">
        <div class="col-md-3"><label class="form-label small text-muted mb-1">Cari</label><input type="search" name="q" value="${esc(f.q)}" class="form-control" placeholder="TRX, peminjam, barang…"></div>
        <div class="col-md-2"><label class="form-label small text-muted mb-1">Status</label><select name="status" class="form-select"><option value="">Semua</option>
            ${[['dipinjam', 'Dipinjam'], ['terlambat', 'Terlambat'], ['selesai', 'Selesai']].map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="col-6 col-md-2"><label class="form-label small text-muted mb-1">Dari tanggal</label><input type="date" name="dari" value="${esc(f.dari)}" class="form-control"></div>
        <div class="col-6 col-md-2"><label class="form-label small text-muted mb-1">Sampai</label><input type="date" name="sampai" value="${esc(f.sampai)}" class="form-control"></div>
        ${admin ? `<div class="col-md-3"><label class="form-label small text-muted mb-1">Petugas</label><select name="petugas" class="form-select"><option value="">Semua petugas</option>
            ${d.petugas.map((p) => `<option value="${p.id}" ${String(p.id) === f.petugas ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}</select></div>` : ''}
        <div class="col-12 d-flex gap-2 flex-wrap">
            <button class="btn btn-primary"><i class="bi bi-funnel"></i> Terapkan</button><a href="#/riwayat" class="btn btn-light">Reset</a>
            <button type="button" id="btnCsv" class="btn btn-outline-success ms-auto"><i class="bi bi-file-earmark-spreadsheet"></i> Ekspor CSV</button>
            <button type="button" onclick="window.print()" class="btn btn-outline-secondary"><i class="bi bi-printer"></i> Cetak</button>
            ${admin ? '<button type="button" id="btnHapusSemua" class="btn btn-outline-danger"><i class="bi bi-trash"></i> Hapus semua riwayat</button>' : ''}
        </div>
    </form></div>
    ${admin ? '' : '<div class="px-4 pt-3 small text-muted"><i class="bi bi-info-circle"></i> Menampilkan transaksi yang Anda catat atau yang pengembaliannya Anda proses.</div>'}
    <div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Transaksi</th><th>Peminjam</th><th>Barang</th><th class="text-center">Jml</th><th>Tgl Pinjam</th><th>Rencana Kembali</th><th>Tgl Kembali</th><th>Status</th><th>Petugas</th>${admin ? '<th class="text-end no-print">Aksi</th>' : ''}</tr></thead>
        <tbody>${pg.rows.map((r) => `<tr>
            <td><code class="kode">${r.kode}</code></td>
            <td>${esc(r.nama_peminjam)}<div class="small text-muted">${esc(r.identitas_peminjam || '')}</div></td>
            <td>${esc(r.nama_barang)}<div class="small text-muted">${esc(r.kode_barang)}${r.keterangan ? ', ' + esc(r.keterangan) : ''}</div></td>
            <td class="text-center">${r.jumlah}</td><td class="text-nowrap">${tgl(r.tanggal_pinjam)}</td><td class="text-nowrap">${tgl(r.tanggal_rencana_kembali)}</td>
            <td class="text-nowrap">${tgl(r.tanggal_kembali, true)}${r.kondisi_kembali ? `<div class="small text-muted">Kondisi: ${esc(r.kondisi_kembali)}</div>` : ''}</td>
            <td>${statusBadge(r)}</td>
            <td class="small text-nowrap"><div><i class="bi bi-pencil text-muted"></i> ${esc(r.pencatat ?? 'Akun dihapus')}</div>${r.status === 'selesai' ? `<div><i class="bi bi-arrow-down-left text-muted"></i> ${esc(r.pemroses ?? 'Akun dihapus')}</div>` : ''}</td>
            ${admin ? `<td class="text-end text-nowrap no-print">
                ${r.status === 'selesai' ? `<button class="btn btn-sm btn-icon btn-outline-secondary" data-batal="${r.id}" data-info="${esc(r.kode)}" data-nama="${esc(r.nama_barang)}" data-jml="${r.jumlah}" title="Batalkan pengembalian" aria-label="Batalkan pengembalian"><i class="bi bi-arrow-counterclockwise"></i></button>` : ''}
                <button class="btn btn-sm btn-icon btn-outline-danger" data-hapus="${r.id}" data-info="${esc(r.kode + ' (' + r.nama_barang + ' oleh ' + r.nama_peminjam + ')')}" data-aktif="${r.status === 'dipinjam' ? 1 : 0}" title="Hapus transaksi" aria-label="Hapus transaksi"><i class="bi bi-trash"></i></button></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${admin ? 10 : 9}" class="text-center text-muted py-5">Tidak ada transaksi yang cocok.</td></tr>`}</tbody>
    </table></div>
    <div class="card-body d-flex justify-content-between align-items-center"><span class="small text-muted">Total ${pg.total} transaksi</span>${pagerHtml(pg)}</div>
</div>`);
    const form = document.getElementById('fRiwayat');
    form.addEventListener('submit', (ev) => { ev.preventDefault(); setQuery('/riwayat', formData(form)); });
    bindPager((p) => setQuery('/riwayat', { ...f, page: p }));
    document.getElementById('btnCsv').addEventListener('click', () => exportCsv(d.rows));
    bindHapusTrx();
    document.querySelectorAll('[data-batal]').forEach((btn) => btn.addEventListener('click', () => {
        if (!confirm(`Batalkan pengembalian ${btn.dataset.info}? Status kembali menjadi Dipinjam dan stok ${btn.dataset.nama} berkurang ${btn.dataset.jml} unit.`)) return;
        doAction(api(`/peminjaman/${btn.dataset.batal}/batal-kembali`, { method: 'POST' }));
    }));
    document.getElementById('btnHapusSemua')?.addEventListener('click', () => modal({
        title: 'Hapus semua riwayat',
        body: `<p>Pilih riwayat yang akan dihapus. Tindakan ini <b>tidak bisa dibatalkan</b>.</p>
            <div class="form-check mb-2"><input class="form-check-input" type="radio" name="cakupan" id="ck1" value="selesai" checked><label class="form-check-label" for="ck1">Hanya transaksi yang sudah <b>Selesai</b><span class="d-block small text-muted">Peminjaman yang masih berjalan tetap tersimpan.</span></label></div>
            <div class="form-check"><input class="form-check-input" type="radio" name="cakupan" id="ck2" value="semua"><label class="form-check-label" for="ck2"><b>Semua</b> transaksi, termasuk yang masih dipinjam<span class="d-block small text-muted">Stok semua barang dikembalikan penuh ke rak.</span></label></div>`,
        word: 'HAPUS', confirmText: 'Hapus riwayat', confirmClass: 'btn-danger',
        onConfirm: async (data) => { const r = await api('/peminjaman/hapus-semua', { method: 'POST', body: data }); flash('success', r.message); router(); },
    }));
    animate();
}
function exportCsv(rows) {
    const head = ['Kode Transaksi', 'Nama Peminjam', 'NIM/NIP', 'Kode Barang', 'Nama Barang', 'Jumlah', 'Tanggal Pinjam', 'Rencana Kembali', 'Tanggal Kembali', 'Kondisi', 'Status', 'Keterangan', 'Dicatat Oleh', 'Diproses Oleh'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(cell).join(';')].concat(rows.map((r) => [r.kode, r.nama_peminjam, r.identitas_peminjam, r.kode_barang, r.nama_barang, r.jumlah, r.tanggal_pinjam, r.tanggal_rencana_kembali, r.tanggal_kembali, r.kondisi_kembali,
        r.status === 'selesai' ? 'Selesai' : r.terlambat ? 'Terlambat' : 'Dipinjam', r.keterangan, r.pencatat, r.pemroses].map(cell).join(';')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `riwayat-transaksi-${todayStr()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ======================= PENGGUNA ======================= */
async function pagePengguna(params) {
    const f = { q: params.get('q') || '', role: params.get('role') || '', status: params.get('status') || '' };
    const d = await api('/users');
    let rows = d.rows;
    if (f.q) rows = rows.filter((u) => (u.nama + ' ' + u.username).toLowerCase().includes(f.q.toLowerCase()));
    if (f.role) rows = rows.filter((u) => u.role === f.role);
    if (f.status) rows = rows.filter((u) => u.is_active === (f.status === 'aktif'));
    renderShell('Manajemen Pengguna', 'pengguna', `
<div class="card">
    <div class="card-body border-bottom"><form class="row g-2 align-items-end filter-form" id="fUser">
        <div class="col-lg"><label class="form-label small text-muted mb-1">Cari</label><input type="search" name="q" value="${esc(f.q)}" class="form-control" placeholder="Nama atau username…"></div>
        <div class="col-6 col-md-2"><label class="form-label small text-muted mb-1">Role</label><select name="role" class="form-select"><option value="">Semua</option><option value="admin" ${f.role === 'admin' ? 'selected' : ''}>Admin</option><option value="staff" ${f.role === 'staff' ? 'selected' : ''}>Staff</option></select></div>
        <div class="col-6 col-md-2"><label class="form-label small text-muted mb-1">Status</label><select name="status" class="form-select"><option value="">Semua</option><option value="aktif" ${f.status === 'aktif' ? 'selected' : ''}>Aktif</option><option value="nonaktif" ${f.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option></select></div>
        <div class="col-lg-auto d-flex gap-2 flex-wrap"><button class="btn btn-primary"><i class="bi bi-search"></i> Cari</button><a href="#/pengguna" class="btn btn-light">Reset</a>
            <a href="#/pengguna/tambah" class="btn btn-success ms-auto"><i class="bi bi-person-plus"></i> Tambah Staff</a></div>
    </form></div>
    <div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th class="text-center">Peminjaman Dicatat</th><th class="text-center">Pengembalian Diproses</th><th>Login Terakhir</th><th class="text-end">Aksi</th></tr></thead>
        <tbody>${rows.map((u) => {
            const self = u.id === state.user.id;
            return `<tr class="${u.is_active ? '' : 'text-muted'}">
            <td class="fw-semibold">${esc(u.nama)}${self ? ' <span class="badge text-bg-light border">Anda</span>' : ''}</td>
            <td><code>${esc(u.username)}</code></td>
            <td><span class="badge ${u.role === 'admin' ? 'bg-primary' : 'text-bg-info'}">${u.role === 'admin' ? 'Admin' : 'Staff'}</span></td>
            <td>${u.is_active ? '<span class="badge text-bg-success">Aktif</span>' : '<span class="badge text-bg-secondary">Nonaktif</span>'}</td>
            <td class="text-center">${u.jml_pinjam}</td><td class="text-center">${u.jml_kembali}</td><td class="small">${tgl(u.last_login, true)}</td>
            <td class="text-end text-nowrap">
                ${u.role === 'staff' || self ? `<a href="#/pengguna/edit/${u.id}" class="btn btn-sm btn-icon btn-outline-secondary" title="Edit" aria-label="Edit"><i class="bi bi-pencil"></i></a>` : ''}
                ${u.role === 'staff' ? `<button class="btn btn-sm btn-outline-secondary" data-toggle="${u.id}" data-nama="${esc(u.nama)}" data-aktif="${u.is_active ? 1 : 0}">${u.is_active ? '<i class="bi bi-person-x"></i> Nonaktifkan' : '<i class="bi bi-person-check"></i> Aktifkan'}</button>
                <button class="btn btn-sm btn-outline-danger" data-hapususer="${u.id}" data-nama="${esc(u.nama)}" title="Hapus akun"><i class="bi bi-trash"></i> Hapus</button>` : ''}
            </td></tr>`;
        }).join('') || '<tr><td colspan="8" class="text-center text-muted py-5">Pengguna tidak ditemukan.</td></tr>'}</tbody>
    </table></div>
</div>`);
    const form = document.getElementById('fUser');
    form.addEventListener('submit', (ev) => { ev.preventDefault(); setQuery('/pengguna', formData(form)); });
    document.querySelectorAll('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
        if (!confirm(`${btn.dataset.aktif === '1' ? 'Nonaktifkan' : 'Aktifkan'} akun ${btn.dataset.nama}?`)) return;
        doAction(api(`/users/${btn.dataset.toggle}/toggle`, { method: 'POST' }));
    }));
    document.querySelectorAll('[data-hapususer]').forEach((btn) => btn.addEventListener('click', () => {
        if (!confirm(`Hapus akun ${btn.dataset.nama} secara permanen? Riwayat transaksinya tetap tersimpan, tetapi akun ini tidak bisa dipulihkan.`)) return;
        doAction(api(`/users/${btn.dataset.hapususer}`, { method: 'DELETE' }));
    }));
    animate();
}

async function pageUserForm(params, id) {
    let t = null;
    if (id) {
        t = (await api('/users')).rows.find((u) => u.id === Number(id));
        if (!t || (t.role !== 'staff' && t.id !== state.user.id)) { flash('danger', 'Pengguna tidak ditemukan atau tidak dapat diubah.'); go('/pengguna'); return; }
    }
    const self = t && t.id === state.user.id;
    renderShell(t ? 'Edit Pengguna' : 'Tambah Akun Staff', 'pengguna', `
<div class="row justify-content-center"><div class="col-lg-6"><div class="card">
    <div class="card-header"><span>${t ? 'Edit ' + esc(t.nama) : 'Akun Staff Baru'}</span><span class="badge ${t?.role === 'admin' ? 'bg-primary' : 'text-bg-info'}">${t?.role === 'admin' ? 'Admin' : 'Staff'}</span></div>
    <div class="card-body"><form id="fForm" novalidate>
        <div class="mb-3"><label class="form-label">Nama Lengkap</label><input name="nama" class="form-control" value="${esc(t?.nama)}" maxlength="100" required></div>
        <div class="mb-3"><label class="form-label">Username</label><input name="username" class="form-control" value="${esc(t?.username)}" maxlength="50" autocomplete="off" required></div>
        <div class="row g-2 mb-3">
            <div class="col-md-6"><label class="form-label">Password${t ? ' baru' : ''}</label><input type="password" name="password" class="form-control" autocomplete="new-password"></div>
            <div class="col-md-6"><label class="form-label">Konfirmasi Password</label><input type="password" name="password_konfirmasi" class="form-control" autocomplete="new-password"></div>
            ${t ? '<div class="form-text">Kosongkan jika password tidak diubah.</div>' : ''}
        </div>
        ${self ? '' : `<div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" role="switch" id="is_active" ${!t || t.is_active ? 'checked' : ''}><label class="form-check-label" for="is_active">Akun aktif (dapat login)</label></div>`}
        <div class="d-flex gap-2"><button class="btn btn-primary"><i class="bi bi-save"></i> Simpan</button><a href="#/pengguna" class="btn btn-light">Batal</a></div>
    </form></div>
</div></div></div>`);
    const form = document.getElementById('fForm');
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const body = { ...formData(form), is_active: self ? true : document.getElementById('is_active').checked };
        try { const r = await api(t ? `/users/${t.id}` : '/users', { method: t ? 'PUT' : 'POST', body }); flash('success', r.message); go('/pengguna'); } catch (e) { formErrors(form, e); }
    });
    animate();
}

/* ======================= LOG ======================= */
const GRUP = [['', 'Semua'], ['barang', 'Data barang'], ['transaksi', 'Transaksi'], ['pengguna', 'Pengguna'], ['akses', 'Login & sistem']];
const JENIS = { login: 'Login', logout: 'Logout', pinjam: 'Peminjaman', kembali: 'Pengembalian', barang_tambah: 'Tambah barang', barang_ubah: 'Ubah barang', barang_hapus: 'Hapus barang', user: 'Kelola pengguna', trx_hapus: 'Hapus transaksi', batal_kembali: 'Batal pengembalian', log_hapus: 'Hapus log' };
function aksiLabel(a) {
    return ({ barang_tambah: ['Tambah', 'lbl-add'], barang_ubah: ['Ubah', 'lbl-edit'], barang_hapus: ['Hapus', 'lbl-del'], trx_hapus: ['Hapus', 'lbl-del'], log_hapus: ['Hapus', 'lbl-del'],
        pinjam: ['Pinjam', 'lbl-out'], kembali: ['Kembali', 'lbl-in'], batal_kembali: ['Batal', 'lbl-edit'], user: ['Akun', 'lbl-user'], login: ['Login', 'lbl-muted'], logout: ['Logout', 'lbl-muted'] })[a] || ['Sistem', 'lbl-muted'];
}
async function pageLog(params) {
    const f = { grup: params.get('grup') || '', aksi: params.get('aksi') || '', q: params.get('q') || '' };
    const d = await api('/aktivitas?' + new URLSearchParams(f));
    const pg = paginate(d.rows, Number(params.get('page')) || 1, 25);
    renderShell('Log Aktivitas & Riwayat Data', 'log', `
<nav class="log-tabs mb-3" aria-label="Kelompok aktivitas">${GRUP.map(([k, l]) => `<a href="#/log${k ? '?grup=' + k : ''}" class="${f.grup === k ? 'active' : ''}">${l}</a>`).join('')}</nav>
<div class="card">
    <div class="card-body border-bottom"><form class="row g-2 filter-form" id="fLog">
        <div class="col-md-5"><input type="search" name="q" value="${esc(f.q)}" class="form-control" placeholder="Cari deskripsi atau nama pengguna…"></div>
        <div class="col-md-3"><select name="aksi" class="form-select"><option value="">Semua aktivitas</option>${Object.entries(JENIS).map(([k, v]) => `<option value="${k}" ${f.aksi === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="col-md-4 d-flex gap-2"><button class="btn btn-primary"><i class="bi bi-search"></i> Filter</button><a href="#/log" class="btn btn-light">Reset</a>
            <button type="button" id="btnHapusLog" class="btn btn-outline-danger ms-auto"><i class="bi bi-trash"></i> Hapus semua log</button></div>
    </form></div>
    <div class="table-responsive"><table class="table align-middle mb-0">
        <thead><tr><th style="width:170px">Waktu</th><th style="width:90px">Jenis</th><th>Pengguna</th><th>Aktivitas</th></tr></thead>
        <tbody>${pg.rows.map((a) => { const [lt, lc] = aksiLabel(a.aksi); return `<tr><td class="small text-nowrap">${tgl(a.created_at, true)}</td><td><span class="lbl ${lc}">${lt}</span></td><td class="text-nowrap">${esc(a.nama_user)}</td><td>${esc(a.deskripsi)}</td></tr>`; }).join('')
            || '<tr><td colspan="4" class="text-center text-muted py-5">Belum ada aktivitas di kelompok ini.</td></tr>'}</tbody>
    </table></div>
    <div class="card-body d-flex justify-content-between align-items-center"><span class="small text-muted">${pg.total} aktivitas</span>${pagerHtml(pg)}</div>
</div>`);
    const form = document.getElementById('fLog');
    form.addEventListener('submit', (ev) => { ev.preventDefault(); setQuery('/log', { ...formData(form), grup: f.grup }); });
    bindPager((p) => setQuery('/log', { ...f, page: p }));
    document.getElementById('btnHapusLog').addEventListener('click', () => modal({
        title: 'Hapus semua log aktivitas',
        body: `<p>Semua catatan log aktivitas (${d.total} entri) akan dihapus dan <b>tidak bisa dikembalikan</b>. Data barang, transaksi, dan akun tidak terpengaruh.</p>`,
        word: 'HAPUS', confirmText: 'Hapus semua log', confirmClass: 'btn-danger',
        onConfirm: async (data) => { const r = await api('/aktivitas/hapus-semua', { method: 'POST', body: data }); flash('success', r.message); router(); },
    }));
    animate();
}

/* ======================= animasi & menu ======================= */
let navResize = null;
function initNav() {
    const nav = document.querySelector('.pill-nav');
    if (!nav) return;
    const ind = nav.querySelector('.pill-indicator');
    const active = nav.querySelector('.pill-link.active');
    const moveTo = (el) => {
        if (!el) { ind.classList.remove('ready'); return; }
        ind.style.width = el.offsetWidth + 'px';
        ind.style.transform = `translateX(${el.offsetLeft}px)`;
        ind.classList.add('ready');
        nav.querySelectorAll('.pill-link').forEach((l) => l.classList.toggle('is-hover', l === el && l !== active));
    };
    const place = () => { const t = ind.style.transition; ind.style.transition = 'none'; moveTo(active); void ind.offsetWidth; ind.style.transition = t; };
    nav.querySelectorAll('.pill-link').forEach((l) => { l.addEventListener('mouseenter', () => moveTo(l)); l.addEventListener('focus', () => moveTo(l)); });
    nav.addEventListener('mouseleave', () => moveTo(active));
    if (navResize) window.removeEventListener('resize', navResize);
    navResize = place;
    window.addEventListener('resize', place);
    if (document.fonts?.ready) document.fonts.ready.then(place);
    place();
}
window.addEventListener('scroll', () => document.getElementById('siteHeader')?.classList.toggle('scrolled', window.scrollY > 10), { passive: true });

function animate() {
    document.querySelectorAll('.table tbody, .timeline, .list-group').forEach((list) => [...list.children].forEach((row, i) => row.style.setProperty('--i', Math.min(i, 14))));
    const targets = document.querySelectorAll('main .card, .figures > div, .greeting, .availability, .late-line, .quick-actions');
    targets.forEach((el, i) => el.style.setProperty('--d', Math.min(i, 8) * 0.07 + 's'));
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.05 });
        targets.forEach((el) => io.observe(el));
    }
    setTimeout(() => targets.forEach((el) => el.classList.add('in')), 1500); // pengaman
    document.querySelectorAll('.figures .num').forEach((el) => {
        const target = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
        let start = null;
        el.textContent = '0';
        const step = (ts) => { start ??= ts; const p = Math.min((ts - start) / 1200, 1); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('id-ID'); if (p < 1) requestAnimationFrame(step); };
        setTimeout(() => requestAnimationFrame(step), 250);
    });
    document.querySelectorAll('.availability .fill').forEach((bar) => { const w = bar.style.width; bar.style.width = '0'; setTimeout(() => { bar.style.width = w; }, 350); });
}

/* ---------------- mulai ---------------- */
(async () => {
    try {
        const r = await fetch('/api/me', { credentials: 'same-origin' });
        if (r.ok) { state.user = (await r.json()).user; router(); } else renderLogin();
    } catch {
        app.innerHTML = '<div class="login-page"><div class="note note-danger">Tidak dapat terhubung ke server. Muat ulang halaman.</div></div>';
    }
})();
