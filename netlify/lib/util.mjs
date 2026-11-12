import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export class HttpError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

/* ---------------- Waktu (WIB) ---------------- */
const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
export const now = () => fmt.format(new Date()).replace('T', ' ');
export const today = () => now().slice(0, 10);
export function addDays(date, n) {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
export function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/* ---------------- Password ---------------- */
export function hashPassword(pw) {
    const salt = randomBytes(16).toString('hex');
    return `scrypt$${salt}$${scryptSync(pw, salt, 32).toString('hex')}`;
}
export function verifyPassword(pw, stored) {
    const [algo, salt, hash] = String(stored || '').split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const a = scryptSync(String(pw), salt, 32);
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------------- Sesi (cookie bertanda tangan HMAC) ---------------- */
const b64 = (s) => Buffer.from(s).toString('base64url');
export function signSession(payload, secret) {
    const body = b64(JSON.stringify(payload));
    return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}
export function readSession(token, secret) {
    if (!token || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    const expect = createHmac('sha256', secret).update(body).digest('base64url');
    if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    try {
        const p = JSON.parse(Buffer.from(body, 'base64url').toString());
        return p.exp > Date.now() ? p : null;
    } catch {
        return null;
    }
}
export function getCookie(req, name) {
    const raw = req.headers.get('cookie') || '';
    for (const part of raw.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
}

/* ---------------- Helper domain ---------------- */
export const trxCode = (id) => 'TRX-' + String(id).padStart(5, '0');
export const formatKode = (n) => 'BR' + String(n).padStart(3, '0');
export const isLate = (r, t = today()) => r.status === 'dipinjam' && !!r.tanggal_rencana_kembali && r.tanggal_rencana_kembali < t;
export function parseTrx(q) {
    const m = /^(?:trx-?)?0*(\d+)$/i.exec(String(q).trim());
    return m ? Number(m[1]) : null;
}
export const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
export const len = (s) => [...s].length;

export function diffText(oldV, newV, labels) {
    const parts = [];
    for (const [k, label] of Object.entries(labels)) {
        const o = str(oldV[k]);
        const n = str(newV[k]);
        if (o === n) continue;
        const f = (v) => (v === '' ? '(kosong)' : /^-?\d+(\.\d+)?$/.test(v) ? v : `"${v}"`);
        parts.push(`${label} ${f(o)} → ${f(n)}`);
    }
    return parts.length ? parts.join(', ') : 'tanpa perubahan data';
}
