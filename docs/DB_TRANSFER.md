# Memindahkan Database Asli dari PC Kantor ke Laptop

Dokumen ini dipakai kalau aplikasi di laptop harus menampilkan data asli dari PC
kantor, bukan data demo. Ada dua tahap: **dump di PC kantor** dan **restore di
laptop**.

> Jangan pernah commit file dump atau salinan `.env` ke Git. Keduanya berisi
> data karyawan (PII), password database, dan kunci enkripsi.

## Ringkasan kondisi laptop ini

| Komponen | Lokasi |
|---|---|
| PostgreSQL 16.14 | `%LOCALAPPDATA%\GSS-HRIS\postgresql-16\pgsql` |
| Data directory | `%LOCALAPPDATA%\GSS-HRIS\pgdata` |
| Log server | `%LOCALAPPDATA%\GSS-HRIS\pgdata\server.log` |
| Start / stop manual | `%LOCALAPPDATA%\GSS-HRIS\tools\start-db.cmd` dan `stop-db.cmd` |
| Auto-start saat login | Shortcut `GSS HRIS Database` di folder Startup |
| Database aktif | `papaiz_hris` di `localhost:5432` |
| Backend | `http://localhost:4000/api/v1` |
| Frontend | `http://localhost:3000` |

Database lokal saat ini berisi data minimal untuk uji coba: akun **System
Admin** bootstrap, akun Admin HR, satu akun Karyawan uji, dan satu profil
karyawan uji. Belum ada client, lokasi, kontrak, atau data operasional asli.
Restore dari PC kantor akan **mengganti seluruh isi database lokal ini**.

## Bagian A — Buat dump di PC kantor

Jalankan di PC kantor tempat data asli berada.

1. Pastikan database kantor sedang hidup. Kalau memakai Docker:

   ```powershell
   docker compose up -d
   ```

2. Dari root repo, jalankan:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\dump-database.ps1
   ```

   Skrip otomatis mencari container PostgreSQL yang berjalan. Kalau di PC kantor
   PostgreSQL dipasang langsung (bukan Docker), skrip memakai `pg_dump` lokal dan
   membaca kredensial dari `backend\.env`.

   Kalau nama container tidak terdeteksi, sebutkan eksplisit:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\dump-database.ps1 -Container nama-container
   ```

3. Hasilnya ada di folder `db-dump\`:

   - `papaiz_hris-YYYYMMDD-HHMMSS.dump` — isi database
   - `backend-YYYYMMDD-HHMMSS.env` — salinan konfigurasi, termasuk
     `PII_ENCRYPTION_KEY`, `PII_KEY_VERSION`, dan kredensial database

4. Salin **kedua file** ke laptop lewat flashdisk atau cloud pribadi. Jangan
   lewat GitHub.

### Alternatif tanpa skrip (Docker)

Kalau skrip belum ikut ter-push ke GitHub, jalankan manual di PC kantor:

```powershell
docker ps
docker exec <nama-container> pg_dump -U postgres -d papaiz_hris -Fc -f /tmp/papaiz_hris.dump
docker cp <nama-container>:/tmp/papaiz_hris.dump .\papaiz_hris.dump
Copy-Item backend\.env .\backend-kantor.env
```

Lalu bawa `papaiz_hris.dump` dan `backend-kantor.env` ke laptop.

## Bagian B — Restore di laptop

1. Pastikan PostgreSQL lokal hidup. Kalau belum, buka shortcut
   **GSS HRIS Database**, atau jalankan:

   ```powershell
   & "$env:LOCALAPPDATA\GSS-HRIS\tools\start-db.cmd"
   ```

2. Di laptop, dari root repo, jalankan:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\restore-local-database.ps1 `
     -DumpPath "db-dump\papaiz_hris-YYYYMMDD-HHMMSS.dump" `
     -OfficeEnvPath "db-dump\backend-YYYYMMDD-HHMMSS.env"
   ```

   Skrip akan:

   - menghentikan backend GSS HRIS yang sedang berjalan,
   - memutus koneksi aktif dan membuat ulang database `papaiz_hris`,
   - memulihkan dump dengan `pg_restore`,
   - menyalin kunci enkripsi PII dari `.env` kantor ke `backend\.env`
     (tanpa mengubah `DATABASE_URL` lokal),
   - menjalankan `prisma migrate deploy`,
   - menampilkan jumlah data dan daftar akun.

3. Nyalakan backend:

   ```powershell
   cd backend
   npm run start:dev
   ```

4. Buka `http://localhost:3000` dan login memakai akun kantor. Akun bootstrap
   lokal (`admin@papaiz.corp`) tidak dipakai lagi setelah data kantor masuk.

Kalau backend ingin tetap hidup selama restore (misalnya untuk uji ke database
scratch), tambahkan `-KeepBackend`. Untuk database uji, tambahkan juga
`-Database nama_database_uji`; skrip otomatis melewati migrasi dan tidak
mengubah `.env`.

## Kenapa `backend\.env` kantor wajib dibawa

Field PII karyawan (NIK, NPWP, rekening, dan sebagainya) dienkripsi dengan
AES-256-GCM memakai `PII_ENCRYPTION_KEY`. Kalau database direstore ke laptop
yang memakai kunci berbeda, data tetap ada tetapi tidak bisa didekripsi.

Yang perlu cocok:

- `PII_ENCRYPTION_KEY`
- `PII_KEY_VERSION`
- `TEMP_CREDENTIAL_ENCRYPTION_KEY` dan `TEMP_CREDENTIAL_KEY_VERSION`
  (hanya untuk membuka temporary credential yang masih aktif)

`DATABASE_URL` **tidak** boleh ikut dipakai apa adanya karena menunjuk ke
database kantor. Skrip restore sengaja mempertahankan `DATABASE_URL` lokal.

Kalau file `.env` kantor hilang, dump masih bisa direstore, tetapi data PII
karyawan mungkin gagal dibaca. Jangan menimpa database kantor dengan data
laptop.

## Perintah harian

Cara termudah: double-click shortcut **GSS HRIS** di Desktop. Shortcut itu
menyalakan database, backend, dan frontend, lalu membuka browser.

Manual:

```powershell
# Database
& "$env:LOCALAPPDATA\GSS-HRIS\tools\start-db.cmd"
& "$env:LOCALAPPDATA\GSS-HRIS\tools\stop-db.cmd"

# Backend
cd backend
npm run start:dev

# Frontend
cd frontend
npm run dev
```

Cek database siap:

```powershell
& "$env:LOCALAPPDATA\GSS-HRIS\postgresql-16\pgsql\bin\pg_isready.exe" -h localhost -p 5432
```

## Backup rutin

Buat dump kapan saja (database lokal maupun kantor):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dump-database.ps1
```

Simpan folder `db-dump\` di media terenkripsi. Folder ini sudah masuk
`.gitignore`, tetapi tetap periksa `git status` sebelum commit.

## Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| `PostgreSQL tidak menerima koneksi` | Database belum hidup. Jalankan shortcut **GSS HRIS Database** atau `start-db.cmd`. |
| `password authentication failed` | `DATABASE_URL` di `backend\.env` tidak cocok dengan user/password PostgreSQL lokal. Perbaiki URL-nya, jangan ganti password database kantor. |
| `pg_restore: error: unsupported version` | Versi PostgreSQL kantor lebih baru dari 16. Samakan versi major (repo memakai `postgres:16-alpine`) atau restore dengan `pg_restore` dari versi yang sama. |
| Data karyawan tampil kosong / error dekripsi | `PII_ENCRYPTION_KEY` atau `PII_KEY_VERSION` tidak cocok. Jalankan ulang restore dengan `-OfficeEnvPath` yang benar. |
| `Port 4000 masih dipakai` | Hentikan backend manual, lalu ulangi restore. |
| Restore gagal di tengah jalan | Database mungkin kosong. Perbaiki error, lalu jalankan ulang skrip restore. Dump asli tidak diubah. |

## Catatan keamanan

- File dump dan `.env` mengandung PII serta kunci enkripsi. Kirim hanya lewat
  media yang aman, lalu hapus salinan sementara setelah restore berhasil.
- Jangan memakai password bootstrap di production.
- Setelah restore, ganti password akun kantor yang sensitif bila dump pernah
  berpindah tangan.
