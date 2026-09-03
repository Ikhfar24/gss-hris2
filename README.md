# Papaiz HRIS — Phase 1–6

Implementasi dari `PRD_HRIS_Papaiz_v0_2.md`, mencakup **Phase 1: Foundation**,
**Phase 2: Employee & Placement**, **Phase 3: Attendance**,
**Phase 4: Cuti, Izin & Resign**, **Phase 5: Monitoring & Reporting**, dan
**Phase 6: Payroll** pada Development Strategy (§22).

## Struktur

```
papaiz-hris/
├── backend/    # NestJS + PostgreSQL (Prisma)
├── frontend/   # Next.js (App Router) + Tailwind
└── docker-compose.yml   # PostgreSQL untuk development lokal
```

## Yang sudah diimplementasikan

- **Auth**: login via email/password (bcrypt hash), JWT session in an
  HttpOnly cookie. Backend validates the current user role/status on each
  request, so deactivation and role changes take effect immediately.
- **RBAC**: 8 role sesuai PRD §6 (`KARYAWAN`, `KOORDINATOR`, `ADMIN_HR`,
  `KEUANGAN`, `MARKETING`, `DIREKTUR`, `KOMISARIS`, `SYSTEM_ADMIN`), ditegakkan
  di backend lewat `@Roles()` + `RolesGuard` — **bukan** hanya di frontend.
- **User management**: create/update/deactivate user oleh Admin/HR & System
  Admin. Deactivate bersifat soft (tidak menghapus data) sesuai §24.
- **Company settings**: nama, logo, warna, email, alamat — configurable lewat
  dashboard tanpa perlu ubah kode (§18).
- **Audit log**: semua login, perubahan role/status user, dan perubahan
  company settings tercatat (aktor, waktu, nilai lama/baru) sesuai §9.3/§24.
- **Security dasar** (§19): password hashing, HTTPS-ready (helmet), rate
  limiting pada endpoint login, validasi input ketat (whitelist DTO),
  pemisahan authorization di backend.
- **Media privat**: selfie attendance dan dokumen leave tidak lagi disajikan
  sebagai file publik; akses melewati endpoint terautentikasi dengan scope
  pemilik, tim Koordinator, atau manajemen yang berwenang.

## Phase 2 — Employee & Placement (§8, §10)

- **Client & Location**: data perusahaan klien dan lokasi kerja, termasuk
  konfigurasi radius/jam kerja/toleransi per lokasi (§5, §12) — bisa diubah
  lewat dashboard tanpa kode (BR-008).
- **Data Karyawan**: Tenaga Borongan vs Tenaga Arsiparis (§8), status
  (training/aktif/resign/dst), kontrak (PKWT).
- **Penempatan (Placement)**: riwayat penempatan berbasis periode (§10.1),
  penempatan lama tidak pernah dihapus (BR-006).
- **Workflow pengajuan penempatan/mutasi**:
  - Tenaga Borongan → 1 langkah approval HR/SDM (BR-005).
  - Tenaga Arsiparis → 2 langkah: HR/SDM lalu Direktur (§8.2).
  - Koordinator hanya bisa mengajukan, tidak bisa mengaktifkan sendiri.
  - Setiap approval otomatis menutup penempatan lama & membuka yang baru
    dalam satu transaksi (BR-001, BR-002, BR-007).
- Akun test tambahan dibuat oleh seed: `hr@papaiz.corp`,
  `koordinator@papaiz.corp`, `direktur@papaiz.corp` (lihat bagian Seed di
  bawah untuk password) — supaya alur approval berjenjang bisa dicoba
  end-to-end oleh satu orang.

## Phase 3 — Attendance (§11, §12)

- **Check-in/check-out mandiri** (Karyawan): ambil GPS + selfie langsung dari
  browser (kamera & lokasi HP), divalidasi terhadap radius lokasi
  penempatan aktif (§11.1, BR-002).
- **Radius & jadwal per lokasi**: sudah configurable sejak Phase 2 (radius,
  jam masuk/pulang, toleransi, hari kerja) — dipakai di sini untuk validasi
  keterlambatan dan penentuan hari kerja/libur (§12).
- **Hari Libur & Kalender**: HR bisa menambah/menghapus libur nasional, cuti
  bersama, atau libur khusus satu lokasi. Absensi pada hari libur otomatis
  ditandai "tidak berlaku" untuk status telat, bukan dianggap alpa.
- **Dashboard monitoring absensi** (HR/Koordinator/Direktur): ringkasan
  Hadir/Terlambat/Tidak Hadir/Perlu Ditinjau persis seperti contoh di §14,
  plus tabel detail per karyawan.
- **Mitigasi fake GPS**: sesuai §11.4, sistem **tidak** mengklaim 100% bisa
  mendeteksi GPS palsu. Titik di luar radius lokasi tetap ditolak,
  tapi indikator "mock location" dari device hanya menandai data untuk
  ditinjau HR, bukan otomatis memblokir.

### Keputusan Phase 3 (perlu dikonfirmasi ulang ke bisnis)

PRD §11.5 secara eksplisit menandai beberapa hal sebagai *belum diputuskan*.
Ke-4 hal berikut **sudah diimplementasikan** dengan kebijakan MVP di bawah —
tapi tetap **bukan keputusan final**, harus dikonfirmasi ke HR/manajemen:

| Skenario | Perilaku saat ini |
|---|---|
| Di luar radius lokasi | Tetap **ditolak keras** (check-in gagal) — ini yang tidak berubah |
| GPS gagal | Karyawan bisa tetap absen tanpa titik GPS **asalkan** mengisi alasan (`failureReason`+`failureNote`); otomatis ditandai **Perlu Ditinjau** untuk HR |
| Kamera gagal | Sama seperti GPS gagal — bisa absen tanpa foto selfie asalkan mengisi alasan, ditandai Perlu Ditinjau |
| Internet mati (absensi offline) | Data absensi disimpan di browser (localStorage) saat submit gagal karena tidak ada koneksi, lalu otomatis (atau manual lewat tombol "Sinkronkan sekarang") dikirim ulang saat online. Waktu asli tetap dipakai (`clientRecordedAt`), bukan waktu saat berhasil sync, dan selalu ditandai Perlu Ditinjau |
| Lupa check-out | HR punya halaman "Belum Check-out" (30 hari terakhir) di Monitoring Absensi untuk menemukan dan mengoreksi manual — tidak ada auto-checkout otomatis |
| Koreksi absensi oleh HR | Ada tombol "Koreksi" di setiap baris absensi — HR bisa ubah jam check-in/out, wajib isi alasan, semua perubahan tercatat di audit log (nilai lama → baru) |
| Device binding | 1 karyawan = 1 perangkat (browser/HP) yang terikat otomatis saat check-in pertama kali. Percobaan absen dari perangkat lain **ditolak**. HR bisa reset ikatan lewat halaman "Perangkat Terikat" kalau karyawan ganti HP |
| Face verification | Masih belum ada vendor terintegrasi (tidak berubah) — status selalu `NOT_VERIFIED`, tidak memblokir |

**Catatan jujur soal device binding**: karena antarmuka absensi ini web app
(bukan aplikasi native), "perangkat" yang diikat sebenarnya adalah data yang
tersimpan di `localStorage` browser tersebut — bukan ID hardware HP yang
sesungguhnya. Kalau karyawan menghapus data browser atau pakai mode
penyamaran (incognito), sistem akan menganggapnya perangkat baru dan
menolak. Untuk device-ID yang benar-benar terikat ke hardware, perlu
aplikasi native (Android/iOS), bukan web app biasa — ini limitasi teknis
yang perlu diketahui manajemen.

## Phase 4 — Cuti, Izin & Resign (§13)

- **Pengajuan** oleh karyawan sendiri (self-service) untuk Cuti, Sakit, Izin
  Pulang Awal, Izin Mendadak, Izin Lain, dan **Resign** — dengan dokumen
  pendukung opsional (upload JPEG/PNG/PDF).
- **HR juga bisa mengajukan atas nama karyawan** yang belum punya akun login
  sendiri.
- **Review 1 langkah oleh Admin/HR** (approve/reject).
- **Resign yang disetujui otomatis**: status karyawan berubah jadi
  `RESIGNED`, tanggal resign tercatat, dan penempatan aktifnya ditutup
  (tidak dihapus — sama seperti prinsip riwayat penempatan di Phase 2).
- Pemohon atau HR bisa membatalkan pengajuan selama masih `PENDING`.

### Keputusan Phase 4 (perlu dikonfirmasi ulang ke bisnis)

PRD §13 secara eksplisit bilang *"Workflow approval detail belum final"*.
Kode ini memakai default MVP berikut — **bukan keputusan final**:

| Hal | Default saat ini | Yang perlu dikonfirmasi |
|---|---|---|
| Alur approval | 1 langkah: langsung ke Admin/HR, untuk semua jenis termasuk Resign | Apakah Koordinator perlu tanda tangan dulu sebelum ke HR? Apakah Resign butuh persetujuan Direktur juga? |
| Jatah cuti/kuota | Tidak ada pembatasan jumlah hari cuti/tahun — sistem menerima pengajuan apa pun tanggalnya | Perlu aturan kuota cuti tahunan per karyawan? |
| Karyawan Borongan vs Arsiparis | Kedua jenis diperlakukan sama untuk cuti/izin | Apakah aturan cuti berbeda untuk 2 jenis tenaga kerja ini? |

## Phase 5 — Monitoring & Reporting (§14, §16)

- **Dashboard operasional** (HR/Koordinator/Direktur/System Admin): ringkasan
  Hadir/Terlambat/Tidak Hadir/Verifikasi Gagal hari ini persis format §14,
  plus jumlah pengajuan cuti & penempatan yang masih pending, dan jumlah
  penempatan aktif — setiap angka bisa diklik untuk drill-down ke halaman
  detailnya.
- **Scoping otomatis per role**: Koordinator hanya melihat ringkasan tim yang
  ada di bawahnya (`Employee.coordinatorId`), sama seperti scoping yang
  sudah dipakai di modul Cuti/Izin — bukan data seluruh perusahaan.
- **Beranda Karyawan**: karyawan (non-manajemen) diarahkan ke halaman
  ringkas berisi jalan pintas ke Absensi dan Cuti/Izin, bukan dashboard
  manajemen (karena `/dashboard/summary` memang tidak untuk role Karyawan).
- **Export laporan** ke **Excel (.xlsx) dan PDF**, dengan filter tanggal/
  karyawan/lokasi/status:
  - Rekap Absensi & Keterlambatan
  - Riwayat Penempatan
  - Rekap Cuti & Izin

### Keputusan Phase 5 (perlu dikonfirmasi ulang ke bisnis)

| Hal | Default saat ini | Yang perlu dikonfirmasi |
|---|---|---|
| Siapa yang boleh export laporan | Admin/HR, System Admin, Direktur, **dan Koordinator** (semua export, belum di-scope ke tim Koordinator sendiri seperti dashboard) | Apakah Koordinator harus dibatasi hanya bisa export data timnya sendiri? |
| Layout PDF | Tabel polos (font, garis, teks) — cukup untuk kebutuhan "export minimal" §16, belum ada kop surat/logo perusahaan | Perlu PDF bermerek (pakai logo dari Company Settings) untuk laporan resmi? |
| Rekap payroll & slip gaji | **Belum ada** — PRD §16 menyebutkannya, tapi itu bergantung pada formula payroll yang menurut §15 "belum ditentukan dan akan dibahas pada fase berikutnya" | Menunggu Phase 6 |

## Phase 6 — Payroll (§15)

Formula payroll tidak diasumsikan — dibahas dan diputuskan langsung
bersama sebelum coding. Ini rangkuman keputusannya:

- **Basis gaji per periode**:
  - Karyawan dengan **kontrak PKWT aktif** (Arsiparis maupun Borongan yang
    sudah kontrak) → pakai **gaji pokok bulanan dari kontrak** (field baru
    `Contract.baseSalary`).
  - Karyawan **training/sementara** (belum ada kontrak) → **Harian Lepas**:
    `Employee.dailyRate × jumlah hari hadir dalam periode`. Tarif diisi per
    karyawan (bervariasi Rp90.000–97.000 sesuai kondisi Anda).
- **Potongan (telat/alpa/sakit tanpa surat) & Lembur = manual sepenuhnya.**
  Sistem **tidak** punya formula otomatis untuk ini — HR/Keuangan/Admin
  input sendiri nominal & keterangannya per karyawan per periode ("Tambah
  Item" di halaman Payroll). Lembur juga selalu manual, sesuai keputusan
  bahwa lembur hanya lewat pengajuan resmi per proyek, bukan dihitung dari
  selisih jam pulang.
- **Periode payroll fleksibel** — HR menentukan sendiri tanggal mulai/
  selesai tiap kali membuat periode baru (bukan tanggal tetap), karena
  bisnis outsourcing ini gajiannya mengikuti siklus tagihan ke klien
  (maks. tanggal 20), bukan kalender tetap.
- **Semua jenis Cuti/Izin tidak dibayar** — otomatis konsisten dengan Phase
  4 di mana cuti/izin memang tidak menghasilkan hari kerja/hadir.
- **Alur kerja**: Draft (bisa ditambah/hapus item) → Finalisasi (terkunci
  permanen, tidak bisa diedit lagi — kalau ada koreksi, buat periode baru)
  → Export rekap (Excel/PDF) & slip gaji per karyawan (PDF).
- **Keuangan** (dan Direktur) **hanya bisa lihat & download** periode yang
  sudah **Final** — tidak bisa lihat Draft, tidak bisa approve/ubah.
- **Karyawan** bisa lihat & download slip gajinya sendiri (yang sudah
  Final saja) di menu Payroll.

### Keputusan Phase 6 yang masih bisa disesuaikan nanti

| Hal | Kondisi saat ini |
|---|---|
| Potongan telat hanya berlaku untuk siapa | Sistem **tidak membatasi otomatis** siapa yang boleh kena potongan telat — karena potongannya manual, HR yang menentukan sendiri per kasus (sesuai kesepakatan: "Keuangan/HR/Admin setting manual"). Kalau perlu, aturan "Harian Lepas tidak boleh dipotong telat" bisa ditambahkan sebagai validasi di kode nanti. |
| Rekap alpa/sakit tanpa surat vs jatah cuti 12/tahun | **Belum otomatis dipotong dari kuota cuti** — itu perlu modul "saldo cuti tahunan" yang belum ada di Phase 4. Untuk sekarang, HR input manual sebagai potongan di payroll kalau memang diputuskan memotong. |
| Slip gaji & rekap resmi ke bank | Tetap sesuai PRD — **tidak ada integrasi bank**, uang tidak disimpan di aplikasi, hanya cetak slip & rekap untuk transfer manual oleh Keuangan. |

## Yang belum (menunggu keputusan bisnis / fase berikutnya)

Lihat §25 PRD (Open Questions) dan §22 (Phase 7) — Phase 7 (AI & Advanced
Features: AI assistant, analytics, automation) belum termasuk di sini
secara sengaja, mengikuti prinsip PRD: *"Jangan coding berdasarkan
asumsi."* Ini juga bukan prioritas MVP menurut PRD §26.

Catatan desain: role saat ini adalah **enum tetap**, bukan tabel permission
dinamis — cukup untuk Phase 1, tapi hak akses final Komisaris & System Admin
(§25) masih perlu diputuskan sebelum di-lock lebih jauh.

## Menjalankan secara lokal

### 1. Database

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env      # sesuaikan JWT_SECRET dsb
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed               # buat company settings default + user admin@papaiz.corp
npm run start:dev          # http://localhost:4000/api/v1
```

Akun default hasil seed (**ganti password setelah login pertama**):

| Role | Email | Password |
|---|---|---|
| System Admin | admin@papaiz.corp | ChangeMe123! |
| Admin/HR | hr@papaiz.corp | HR12345678! |
| Koordinator | koordinator@papaiz.corp | Koor12345678! |
| Direktur | direktur@papaiz.corp | Direktur12345678! |
| Keuangan | keuangan@papaiz.corp | Keuangan12345! |
| Karyawan (Arif, Tenaga Borongan) | arif@papaiz.corp | Karyawan12345! |

Seed juga membuat 1 client, 2 lokasi dengan koordinat GPS asli (Muntilan,
Purwokerto — supaya check-in beneran bisa divalidasi radiusnya), 2 karyawan
dummy (Arif = Harian Lepas dengan tarif Rp95.000/hari, Budi = kontrak PKWT
gaji pokok Rp3.500.000/bulan — keduanya siap dipakai untuk demo payroll), 1
contoh hari libur nasional, dan 1 contoh pengajuan cuti (status PENDING,
siap direview).

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                # http://localhost:3000
```

## Endpoint utama (backend)

| Method | Path                    | Akses                              |
|--------|--------------------------|-------------------------------------|
| POST   | `/api/v1/auth/login`     | Publik (rate-limited)              |
| GET    | `/api/v1/company-settings` | Publik (untuk branding login page) |
| PATCH  | `/api/v1/company-settings` | Admin/HR, System Admin            |
| GET    | `/api/v1/users`          | Admin/HR, System Admin, Direktur   |
| POST   | `/api/v1/users`          | Admin/HR, System Admin             |
| PATCH  | `/api/v1/users/:id`      | Admin/HR, System Admin             |
| GET/POST | `/api/v1/clients`      | Read: HR/Koordinator/Direktur; Write: Admin/HR |
| GET/POST | `/api/v1/locations`    | Read: HR/Koordinator/Direktur; Write: Admin/HR |
| GET/POST | `/api/v1/employees`    | Read: HR/Koordinator/Direktur; Write: Admin/HR |
| POST   | `/api/v1/contracts`      | Admin/HR, System Admin             |
| GET    | `/api/v1/placements/active` | HR, Koordinator, Direktur       |
| GET/POST | `/api/v1/placement-requests` | Read: HR/Koordinator/Direktur; Create: Koordinator/HR |
| PATCH  | `/api/v1/placement-requests/:id/hr-review` | Admin/HR, System Admin |
| PATCH  | `/api/v1/placement-requests/:id/director-approve` | Direktur, System Admin |
| PATCH  | `/api/v1/placement-requests/:id/cancel` | Pengaju atau Admin/HR    |
| POST   | `/api/v1/attendance/check-in` | Karyawan (akun sendiri)      |
| PATCH  | `/api/v1/attendance/check-out` | Karyawan (akun sendiri)     |
| GET    | `/api/v1/attendance/me/today` | Karyawan (akun sendiri)      |
| GET    | `/api/v1/attendance` \| `/attendance/summary` | HR, Koordinator, Direktur |
| GET    | `/api/v1/attendance/open` | HR, Koordinator, Direktur (lupa check-out) |
| PATCH  | `/api/v1/attendance/:id/correct` | Admin/HR, System Admin |
| GET    | `/api/v1/attendance/devices` | Admin/HR, System Admin |
| DELETE | `/api/v1/attendance/devices/:employeeId` | Admin/HR, System Admin (reset device) |
| GET/POST/DELETE | `/api/v1/holidays` | Read: semua role; Write: Admin/HR |
| GET/POST | `/api/v1/leave-requests` | Read: sesuai scope (lihat catatan); Create: Karyawan (diri sendiri), Admin/HR (atas nama siapa pun) |
| PATCH  | `/api/v1/leave-requests/:id/review` | Admin/HR, System Admin |
| PATCH  | `/api/v1/leave-requests/:id/cancel` | Pemohon sendiri atau Admin/HR |

Catatan scope `GET /leave-requests`: Karyawan hanya lihat pengajuan miliknya
sendiri; Koordinator hanya lihat pengajuan tim yang berada di bawahnya
(`coordinatorId`); Admin/HR, Direktur, System Admin lihat semua.
| GET    | `/api/v1/dashboard/summary` | Admin/HR, System Admin, Koordinator (scoped ke tim), Direktur |
| GET    | `/api/v1/reports/attendance` \| `/reports/placements` \| `/reports/leave-requests` (`?format=xlsx\|pdf`) | Admin/HR, System Admin, Koordinator, Direktur |
| POST   | `/api/v1/payroll/runs` | Admin/HR, System Admin (buat periode + auto-generate slip draft) |
| GET    | `/api/v1/payroll/runs` \| `/payroll/runs/:id` | Admin/HR, System Admin (semua); Keuangan, Direktur (hanya Final) |
| PATCH  | `/api/v1/payroll/runs/:id/finalize` | Admin/HR, System Admin |
| GET    | `/api/v1/payroll/runs/:id/export?format=xlsx\|pdf` | Sama seperti GET run |
| POST/DELETE | `/api/v1/payroll/slips/:slipId/items` | Admin/HR, System Admin (hanya saat run masih Draft) |
| GET    | `/api/v1/payroll/slips/:slipId/export` | Manajer (semua); Keuangan/Direktur & pemilik slip (hanya Final) |
| GET    | `/api/v1/payroll/my-slips` | Karyawan (slip final miliknya sendiri) |

**Catatan penting:** endpoint check-in/check-out butuh akses **kamera dan
GPS browser**, yang browser modern hanya izinkan di halaman `https://` atau
`http://localhost`. Jadi fitur absensi hanya akan berfungsi normal saat
diakses lewat `localhost:3000`, bukan lewat alamat IP biasa — ini perlu
diingat nanti saat deploy ke server sungguhan (perlu HTTPS).

## Catatan verifikasi

`npx nest build` (backend) dan `npx next build` (frontend) sudah dijalankan
dan sukses tanpa error di lingkungan pembuatan kode ini. `npx prisma
generate` **perlu dijalankan ulang di environment Anda** karena proses
pembuatan kode ini tidak punya akses jaringan ke `binaries.prisma.sh`.
