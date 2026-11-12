/**
 * Penyimpanan data.
 * - Di Netlify: Netlify Blobs (store "lab-inventory", kunci "db"), konsistensi kuat.
 * - Di komputer (uji coba): file JSON lokal bila LOCAL_DB_FILE di-set.
 *
 * Seluruh data disimpan sebagai satu dokumen JSON. Setiap perubahan memakai
 * penulisan bersyarat (ETag) sehingga dua permintaan bersamaan tidak saling
 * menimpa: jika data sudah berubah, perubahan diulang dengan data terbaru.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { HttpError } from './util.mjs';
import { seedData } from './seed.mjs';

const KEY = 'db';
let impl = null;

async function getImpl() {
    if (impl) return impl;
    if (process.env.LOCAL_DB_FILE) {
        const file = process.env.LOCAL_DB_FILE;
        const tag = (s) => createHash('sha1').update(s).digest('hex');
        impl = {
            async read() {
                try {
                    const s = await readFile(file, 'utf8');
                    return { data: JSON.parse(s), etag: tag(s) };
                } catch {
                    return null;
                }
            },
            async write(data, etag) {
                const cur = await this.read();
                if ((cur && cur.etag !== etag) || (!cur && etag)) return false;
                await writeFile(file, JSON.stringify(data));
                return true;
            },
        };
    } else {
        const { getStore } = await import('@netlify/blobs');
        const store = getStore({ name: 'lab-inventory', consistency: 'strong' });
        impl = {
            async read() {
                const r = await store.getWithMetadata(KEY, { type: 'json' });
                return r ? { data: r.data, etag: r.etag } : null;
            },
            async write(data, etag) {
                const res = await store.setJSON(KEY, data, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
                return !res || res.modified !== false;
            },
        };
    }
    return impl;
}

/** Baca seluruh data (membuat data awal pada pemakaian pertama). */
export async function load() {
    const s = await getImpl();
    const cur = await s.read();
    if (cur) return cur.data;
    const data = seedData();
    await s.write(data, null);
    const again = await s.read();
    return again ? again.data : data;
}

/**
 * Ubah data secara aman. fn(data) boleh mengubah objek data dan mengembalikan hasil.
 * Jika fn melempar error, tidak ada yang disimpan.
 */
export async function mutate(fn) {
    const s = await getImpl();
    for (let attempt = 0; attempt < 15; attempt++) {
        let cur = await s.read();
        if (!cur) {
            await load();
            cur = await s.read();
        }
        const data = structuredClone(cur.data);
        const result = await fn(data);
        if (await s.write(data, cur.etag)) return result;
        // Jeda acak agar permintaan yang bentrok tidak terus bertabrakan.
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)));
    }
    throw new HttpError(409, 'Server sedang sibuk menyimpan data lain. Silakan coba lagi.');
}

/** Ganti seluruh data (dipakai untuk reset). */
export async function replaceAll(data) {
    const s = await getImpl();
    const cur = await s.read();
    return s.write(data, cur ? cur.etag : null);
}
