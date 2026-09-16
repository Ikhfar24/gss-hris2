# PRD — HRIS & Workforce Management System

**Versi:** 0.2  
**Status:** Draft / Prototype  
**Nama perusahaan sementara:** Papaiz.corp  
**Jenis usaha sementara:** Outsourcing  
**Platform:** Web Application / PWA  
**Target awal:** Internal perusahaan  
**Estimasi tenaga kerja:** ±100 orang

> **Catatan:** Nama perusahaan, logo, branding, dan informasi identitas perusahaan harus dapat diganti melalui konfigurasi/admin tanpa mengubah source code.

---

# 1. Overview

## 1.1 Deskripsi Produk

Aplikasi web/PWA untuk membantu perusahaan mengelola tenaga kerja outsourcing secara terintegrasi, terutama:

- Data karyawan
- Kontrak kerja
- Penempatan
- Absensi
- GPS
- Selfie dan verifikasi wajah
- Cuti dan izin
- Monitoring
- Rekap absensi
- Payroll
- Laporan
- Slip gaji

Sistem harus mengikuti proses bisnis perusahaan dan menyediakan pengaturan yang dapat diubah oleh role berwenang tanpa perlu programmer.

---

# 2. Latar Belakang

Perusahaan membutuhkan sistem terintegrasi untuk mengurangi proses manual dalam pengelolaan tenaga kerja.

Masalah utama yang ingin diselesaikan:

- Absensi masih membutuhkan monitoring/manual checking.
- Penempatan karyawan dapat berubah sesuai kebutuhan proyek.
- Karyawan memiliki aturan kerja yang dapat berbeda berdasarkan lokasi.
- Rekap keterlambatan dan ketidakhadiran perlu dipermudah.
- Data operasional perlu tersimpan dan dapat ditelusuri.
- HR membutuhkan kontrol tanpa bergantung kepada programmer untuk perubahan aturan operasional.

---

# 3. Goals & Prioritas

## 3.1 P0 — Critical

1. Absensi.
2. Pengelolaan penempatan.

## 3.2 P1 — High Priority

1. Data karyawan.
2. Cuti dan izin.
3. Monitoring HR.
4. Rekapitulasi absensi.
5. Payroll.
6. Reporting dan export.

## 3.3 P2 — Future Development

1. AI features.
2. Advanced analytics.
3. Fitur tambahan sesuai kebutuhan perusahaan.
4. Pengembangan menjadi produk yang dapat digunakan perusahaan lain.

---

# 4. Non-Goals

Untuk versi awal, sistem tidak harus langsung mencakup:

- AI assistant kompleks.
- Aplikasi native Android/iOS.
- Integrasi eksternal yang belum diperlukan.
- Fitur yang tidak berhubungan langsung dengan operasional.
- Fitur kosmetik yang tidak memberikan manfaat operasional.

AI diposisikan sebagai fitur tambahan setelah sistem inti stabil.

---

# 5. Prinsip Desain Utama

## 5.1 Configurable, Bukan Hard-Coded

Aturan operasional yang dapat berubah harus disimpan sebagai konfigurasi/data, bukan ditanam permanen di source code.

Contoh konfigurasi:

- Radius absensi.
- Jam masuk.
- Jam pulang.
- Toleransi keterlambatan.
- Hari kerja.
- Shift.
- Aturan lembur.
- Aturan cuti.
- Branding perusahaan.

Contoh:

```text
Pengaturan Lokasi
Radius Absensi : 300 meter
Jam Masuk      : 08:00
Jam Pulang     : 16:00
Toleransi      : 10 menit
```

HR dapat mengubah konfigurasi melalui dashboard sesuai hak akses.

---

# 6. Target Users

Sistem memiliki role:

1. Karyawan
2. Koordinator
3. Admin / HR / SDM
4. Keuangan
5. Marketing
6. Direktur
7. Komisaris — hak akses belum ditentukan
8. System Admin — hak akses teknis akan ditentukan kemudian

---

# 7. Struktur Organisasi Awal

Struktur organisasi yang telah diketahui:

- 2 Direktur
- 1 Komisaris
- 2 Koordinator
- 1 Keuangan
- 1 Marketing
- 1 Administrasi / HR / SDM

Beberapa jabatan dapat dirangkap.

> Struktur final dan pembagian kewenangan dapat diperbarui dalam pengembangan PRD berikutnya.

---

# 8. Jenis Tenaga Kerja

## 8.1 Tenaga Arsip Borongan

### Karakteristik

- Bersifat sementara dan fleksibel.
- Dapat keluar atau masuk sesuai kebutuhan.
- Kontrak tidak selalu memiliki durasi yang sama.
- Training biasanya ±1 bulan.
- Selama training, tenaga kerja tetap dapat mengundurkan diri.
- Setelah training biasanya diberikan PKWT ±3 bulan.
- Dapat berpindah lokasi sesuai kebutuhan proyek.

### Penempatan

Penempatan bersifat fleksibel.

Contoh:

```text
Arif

01 Sep — 10 Sep
Muntilan

11 Sep — 15 Sep
Purwokerto

16 Sep — dst.
Muntilan
```

Perubahan penempatan dilakukan melalui workflow pengajuan dan approval.

### Otoritas

- Koordinator mengajukan perubahan penempatan.
- HR/SDM/Admin melakukan review dan persetujuan.
- HR/SDM/Admin memiliki kewenangan administratif tertinggi dalam operasional SDM.

---

## 8.2 Tenaga Arsiparis

### Karakteristik

- Menggunakan PKWT ±1 tahun.
- Umumnya ditempatkan pada satu lokasi selama masa kontrak.
- Penempatan lebih tetap dibanding tenaga borongan.

### Mutasi

Perpindahan lokasi diperlakukan sebagai mutasi.

Alur approval awal:

```text
Koordinator
    ↓
HR/SDM
    ↓
Direktur
```

Mutasi wajib menyimpan:

- Lokasi lama.
- Lokasi baru.
- Tanggal efektif.
- Alasan mutasi.
- Pengaju.
- Pihak yang menyetujui.
- Waktu persetujuan.
- Catatan.

> Urutan final approval masih dapat disesuaikan setelah proses bisnis dikonfirmasi lebih lanjut.

---

# 9. Role & Permission

Sistem menggunakan **Role-Based Access Control (RBAC)**.

## 9.1 Karyawan

### Hak Akses

- Login.
- Check-in.
- Check-out.
- Melihat riwayat absensi sendiri.
- Mengajukan izin pulang awal.
- Mengajukan izin keperluan mendesak/mendadak.
- Mengajukan cuti.
- Mengajukan resign.
- Melihat status pengajuan.
- Melihat informasi penempatan pribadi.
- Melihat profil pribadi.

### Batasan

Karyawan tidak dapat:

- Mengubah absensi.
- Mengubah lokasi penempatan.
- Mengubah data karyawan.
- Mengubah data karyawan lain.
- Mengubah payroll.
- Menyetujui pengajuan sendiri.

---

## 9.2 Koordinator

### Hak Akses

- Check-in / check-out pribadi.
- Memantau karyawan di bawah koordinasinya.
- Memantau kehadiran.
- Memantau keterlambatan.
- Memantau ketidakhadiran.
- Memantau kinerja absensi.
- Mengajukan mutasi/penempatan.
- Melihat riwayat penempatan.
- Melihat status pengajuan mutasi.
- Melihat data operasional yang menjadi tanggung jawabnya.

### Batasan

Koordinator tidak dapat:

- Mengaktifkan mutasi secara sepihak.
- Mengubah absensi secara bebas.
- Mengubah konfigurasi sistem.
- Mengubah payroll.
- Menghapus histori operasional.

---

## 9.3 Admin / HR / SDM

Admin/HR memiliki kewenangan administratif tertinggi dalam operasional SDM.

### Hak Akses

- Seluruh fungsi Koordinator.
- Mengelola data karyawan.
- Mengelola kontrak.
- Mengelola penempatan.
- Menyetujui/menolak pengajuan mutasi.
- Menyetujui/menolak izin.
- Menyetujui/menolak cuti.
- Mengelola status karyawan.
- Melakukan koreksi data tertentu.
- Melakukan override proses operasional.
- Mengelola lokasi kerja.
- Mengelola jadwal kerja.
- Mengelola radius absensi.
- Melihat seluruh data absensi.
- Melihat seluruh riwayat penempatan.
- Mengelola konfigurasi operasional.

### Override

HR dapat melakukan override terhadap proses tertentu, seperti:

- Koreksi absensi.
- Koreksi penempatan.
- Perubahan status karyawan.
- Koreksi data izin/cuti.

Setiap override wajib dicatat dalam Audit Log.

### Audit Log

Minimal menyimpan:

- Pengguna yang melakukan perubahan.
- Data yang diubah.
- Nilai sebelum perubahan.
- Nilai setelah perubahan.
- Waktu perubahan.
- Alasan perubahan.

---

## 9.4 Keuangan

### Hak Akses

- Login.
- Check-in / check-out.
- Melihat riwayat absensi sendiri.
- Melihat status absensi sendiri.
- Mengakses data yang diperlukan untuk proses payroll sesuai kewenangan pada tahap akhir payroll.

### Batasan

Keuangan tidak dapat:

- Melihat absensi karyawan lain sebagai fungsi monitoring harian.
- Mengubah absensi.
- Mengubah penempatan.
- Mengubah data karyawan.
- Mengubah konfigurasi sistem.
- Mengubah hasil approval operasional.
- Menghapus data operasional.

> Hak akses detail Keuangan pada modul payroll belum final dan akan ditentukan ketika modul payroll dibahas.

---

## 9.5 Marketing

### Hak Akses

- Login.
- Check-in / check-out.
- Melihat riwayat absensi sendiri.
- Melihat status absensi sendiri.

### Batasan

Marketing tidak dapat:

- Melihat absensi karyawan lain.
- Mengubah absensi.
- Mengubah penempatan.
- Mengubah data karyawan.
- Mengubah konfigurasi sistem.
- Mengakses atau mengubah payroll.
- Menghapus data operasional.

---

## 9.6 Direktur

Direktur memiliki akses monitoring dan kewenangan tertinggi dalam sistem.

### Hak Akses

- Monitoring seluruh sistem.
- Monitoring seluruh karyawan.
- Monitoring seluruh penempatan.
- Monitoring absensi.
- Monitoring performa.
- Melihat laporan.
- Melakukan approval.
- Mengubah data sesuai kewenangan.
- Memindahkan karyawan.
- Melakukan override.
- Mengakses seluruh modul.

Setiap perubahan penting dan override tetap dicatat dalam Audit Log.

---

# 10. Modul Penempatan

Penempatan adalah modul inti karena karyawan outsourcing dapat memiliki lokasi kerja berbeda.

## 10.1 Riwayat Penempatan

Sistem harus menyimpan histori penempatan berdasarkan periode.

| Karyawan | Lokasi | Mulai | Selesai | Status |
|---|---|---|---|---|
| Arif | Muntilan | 01/09 | 10/09 | Selesai |
| Arif | Purwokerto | 11/09 | 15/09 | Selesai |
| Arif | Muntilan | 16/09 | - | Aktif |

## 10.2 Workflow Perubahan Penempatan Tenaga Borongan

```text
Koordinator
    ↓
Mengajukan Perubahan Penempatan
    ↓
HR/SDM/Admin
    ↓
Review Pengajuan
    ↓
┌───────────────┐
│               │
▼               ▼
Approved       Rejected
│
▼
Penempatan Baru Aktif
```

### Data Pengajuan

Minimal menyimpan:

- Karyawan.
- Lokasi asal.
- Lokasi tujuan.
- Tanggal mulai.
- Tanggal selesai jika diketahui.
- Alasan perpindahan.
- Pengaju.
- Tanggal pengajuan.
- Status approval.
- Pihak yang menyetujui.
- Waktu persetujuan.
- Catatan HR.

### Status

- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED`

## 10.3 Business Rules Penempatan

### BR-001 — Penempatan Berbasis Periode

Setiap karyawan dapat memiliki lebih dari satu riwayat penempatan.

### BR-002 — Lokasi Aktif

Pada saat absensi, sistem menentukan lokasi aktif berdasarkan penempatan yang berlaku pada tanggal dan waktu tersebut.

### BR-003 — Tenaga Borongan

Tenaga Arsip Borongan dapat memiliki penempatan yang berubah sesuai kebutuhan proyek.

### BR-004 — Tenaga Arsiparis

Tenaga Arsiparis memiliki penempatan utama selama periode kontrak. Perubahan penempatan dilakukan melalui proses mutasi dan approval.

### BR-005 — Approval Borongan

Koordinator tidak dapat langsung mengaktifkan penempatan baru. Penempatan baru aktif setelah HR/SDM/Admin menyetujui.

### BR-006 — Histori

Penempatan lama tidak boleh dihapus melalui proses normal karena merupakan histori operasional.

### BR-007 — Konflik Periode

Sistem harus mencegah dua penempatan aktif yang waktunya bertabrakan untuk karyawan yang sama, kecuali model multi-assignment secara eksplisit ditambahkan di masa depan.

### BR-008 — Tanpa Coding

Perubahan lokasi, jadwal, radius GPS, dan konfigurasi operasional harus dapat dilakukan melalui dashboard sesuai hak akses.

---

# 11. Modul Absensi

## 11.1 Alur Check-in Awal

```text
Karyawan membuka aplikasi
        ↓
Klik Check-in
        ↓
Ambil GPS
        ↓
Validasi lokasi/radius
        ↓
Selfie
        ↓
Face Verification
        ↓
Validasi anti-fake GPS
        ↓
Validasi jadwal
        ↓
Absensi berhasil
```

## 11.2 Data Absensi

Setiap absensi dapat menyimpan:

- Employee ID.
- Tanggal.
- Waktu check-in.
- Waktu check-out.
- Latitude.
- Longitude.
- Lokasi penempatan saat absensi.
- Jarak dari titik lokasi.
- Foto selfie.
- Hasil face verification.
- Status GPS.
- Status validasi.
- Status keterlambatan.
- Device information yang relevan.
- Metadata audit.

## 11.3 Radius

Radius awal yang dipertimbangkan:

- 200–300 meter.

Nilai harus dapat dikonfigurasi oleh HR berdasarkan lokasi/penempatan.

## 11.4 Fake GPS

Sistem perlu melakukan mitigasi terhadap manipulasi lokasi.

> Sistem tidak boleh menjanjikan deteksi fake GPS 100%. Tujuannya adalah mengurangi risiko manipulasi dan memberikan indikator untuk pemeriksaan HR.

## 11.5 Detail yang Belum Diputuskan

Masih perlu dibahas:

- GPS gagal.
- Internet mati.
- Kamera gagal.
- Face verification gagal.
- Karyawan berada di luar radius.
- Karyawan lupa check-out.
- Karyawan terlambat.
- Absensi offline.
- Koreksi absensi.

---

# 12. Modul Hari Kerja, Kalender & Jadwal

Aturan hari kerja dapat berbeda berdasarkan lokasi/penempatan.

Contoh:

### Lokasi A

- Senin–Jumat kerja.
- Sabtu libur.

### Lokasi B

- Senin–Sabtu kerja.

Sistem harus mendukung:

- Hari kerja per lokasi.
- Hari libur nasional.
- Cuti bersama.
- Shift.
- Jam masuk.
- Jam pulang.
- Toleransi keterlambatan.
- Pengecualian khusus lokasi jika diperlukan.

Jadwal tidak ditanam permanen pada data karyawan apabila sebenarnya mengikuti lokasi penempatan.

---

# 13. Modul Cuti, Izin & Resign

Karyawan dapat mengajukan:

- Cuti.
- Sakit.
- Izin pulang awal.
- Izin keperluan mendesak/mendadak.
- Izin lain sesuai kebijakan.
- Resign.

Dokumen pendukung dapat di-upload jika diperlukan.

Setiap pengajuan minimal memiliki:

- Pemohon.
- Jenis pengajuan.
- Tanggal/periode.
- Alasan.
- Dokumen pendukung.
- Status.
- Reviewer.
- Waktu approval.
- Catatan.

Workflow approval detail belum final.

---

# 14. Dashboard HR

Dashboard HR harus memberikan ringkasan operasional tanpa mewajibkan HR membuka selfie satu per satu.

Contoh:

```text
HARI INI

Hadir             92
Terlambat          5
Tidak Hadir        3
Verifikasi Gagal   1
```

Dashboard dapat menampilkan:

- Kehadiran.
- Keterlambatan.
- Ketidakhadiran.
- Pengajuan izin.
- Pengajuan cuti.
- Pengajuan mutasi.
- Penempatan aktif.
- Indikator absensi bermasalah.

HR dapat melakukan drill-down untuk melihat detail absensi, lokasi, selfie, dan riwayat jika diperlukan.

---

# 15. Payroll

Payroll menggunakan data dari modul absensi dan administrasi.

Konsep awal:

```text
Absensi
   ↓
Rekap Kehadiran
   ↓
Keterlambatan / Ketidakhadiran / Lembur / Izin
   ↓
Payroll Review
   ↓
Approval
   ↓
Slip Gaji / Export
```

Menjelang payroll, misalnya H-5, sistem diharapkan membantu HR melakukan review.

Sistem dapat membantu:

- Rekap kehadiran.
- Rekap keterlambatan.
- Rekap alpha/ketidakhadiran.
- Rekap cuti/izin.
- Lembur sesuai aturan.
- Potongan sesuai aturan.
- Payroll review.
- Export Excel.
- Export PDF.
- Generate slip gaji PDF.

> Detail formula payroll belum ditentukan dan akan dibahas pada fase berikutnya.

Uang tidak disimpan di aplikasi. Transfer gaji berasal dari rekening perusahaan. Integrasi bank bukan prioritas MVP.

---

# 16. Reporting & Export

Sistem harus menyediakan export minimal:

- Excel.
- PDF.

Contoh laporan:

- Rekap absensi.
- Keterlambatan.
- Ketidakhadiran.
- Riwayat penempatan.
- Rekap izin/cuti.
- Rekap payroll.
- Slip gaji.

---

# 17. File Storage

Data terstruktur disimpan di database.

File seperti:

- Selfie absensi.
- Foto profil.
- Dokumen izin.
- Surat pendukung.

Disimpan di object/file storage.

Pilihan awal:

- Supabase Storage.
- Amazon S3.
- Storage kompatibel S3.

Database menyimpan metadata/reference file, bukan file gambar besar secara langsung.

## 17.1 Retention & Auto Cleanup

Foto selfie tidak harus disimpan selamanya.

Konsep:

```text
Foto Selfie
    ↓
Disimpan selama periode tertentu
    ↓
Archive / Auto Cleanup
```

Durasi retention belum ditentukan dan harus mengikuti kebutuhan operasional serta kebijakan perusahaan yang berlaku.

Record absensi tetap dapat dipertahankan meskipun file selfie sudah dihapus sesuai kebijakan retention.

---

# 18. Company Branding / White-Label Foundation

Identitas perusahaan harus configurable.

Contoh:

```text
Company Settings

Nama Perusahaan : Papaiz.corp
Logo            : [Upload]
Favicon         : [Upload]
Nama Aplikasi   : Papaiz HR
Email           : ...
Alamat          : ...
Warna Utama     : ...
```

Tujuan:

- Nama perusahaan dapat diganti tanpa coding.
- Logo dapat diganti tanpa coding.
- Branding dapat diganti melalui dashboard/configuration.
- Fondasi memungkinkan pengembangan white-label di masa depan.

> Multi-company/SaaS penuh bukan scope MVP internal saat ini.

---

# 19. Security

Security minimum:

- HTTPS.
- Password hashing.
- RBAC.
- Authorization di backend.
- Session/token security.
- Validasi input.
- Audit log.
- Database backup.
- File access control.
- Rate limiting untuk endpoint sensitif.
- Proteksi common web vulnerabilities.
- Pemisahan development, staging, dan production.
- Secret/credential management.

AI coding agent tidak boleh memiliki akses bebas terhadap production credentials atau database produksi.

---

# 20. Database

Database utama yang direkomendasikan:

**PostgreSQL**

Data utama meliputi:

- Users.
- Employees.
- Roles.
- Contracts.
- Employment types.
- Clients.
- Locations.
- Assignments.
- Assignment history.
- Attendance.
- Leave.
- Permission requests.
- Mutation requests.
- Payroll.
- Audit logs.
- System settings.

Object/file storage digunakan untuk file dan gambar.

---

# 21. Tech Stack Awal

## Frontend

- Next.js.
- React.
- TypeScript.
- PWA.

## Backend

- NestJS.
- Node.js.
- TypeScript.

## Database

- PostgreSQL.
- Prisma ORM.

## File Storage

- Supabase Storage atau Amazon S3.

## AI

AI bukan bagian wajib MVP.

AI dapat ditambahkan kemudian untuk:

- Ringkasan absensi.
- Analisis pola absensi.
- Assistant internal.
- Pembuatan laporan/ringkasan.
- Fitur produktivitas HR lainnya.

---

# 22. Development Strategy

Pengembangan dilakukan bertahap.

## Phase 0 — Planning

- Finalisasi PRD.
- Business process.
- Database design.
- UI/UX.
- Security design.

## Phase 1 — Foundation

- Project setup.
- Authentication.
- RBAC.
- Company settings.
- User management.

## Phase 2 — Employee & Placement

- Data karyawan.
- Jenis tenaga kerja.
- Kontrak.
- Client.
- Location.
- Placement.
- Placement history.
- Mutation workflow.

## Phase 3 — Attendance

- Check-in.
- Check-out.
- GPS.
- Radius.
- Selfie.
- Face verification.
- Anti-fake GPS mitigation.
- Attendance history.

## Phase 4 — Leave & Permission

- Cuti.
- Sakit.
- Izin pulang awal.
- Izin mendesak.
- Resign.
- Approval workflow.

## Phase 5 — Monitoring

- HR dashboard.
- Coordinator dashboard.
- Attendance monitoring.
- Reporting.
- Export.

## Phase 6 — Payroll

- Payroll calculation.
- Payroll review.
- Approval.
- Export.
- Slip gaji.

## Phase 7 — AI & Advanced Features

- AI assistant.
- Analytics.
- Automation.
- Additional features.

---

# 23. Development & Testing Data

Pengembangan awal wajib menggunakan **dummy data**.

Contoh:

- Karyawan dummy.
- Lokasi dummy.
- Penempatan dummy.
- Absensi dummy.
- Payroll dummy.

Data produksi tidak digunakan selama tahap awal development/testing.

Setelah sistem stabil:

1. UAT.
2. Security review.
3. Pilot terbatas.
4. Migrasi data nyata.
5. Production deployment.

---

# 24. Auditability

Sistem harus mampu menjawab:

- Siapa yang melakukan perubahan?
- Kapan perubahan dilakukan?
- Apa yang berubah?
- Nilai sebelumnya apa?
- Nilai baru apa?
- Apa alasan perubahan?

Data operasional penting tidak boleh hilang tanpa jejak.

---

# 25. Open Questions / Belum Diputuskan

Bagian berikut masih membutuhkan keputusan bisnis:

- Nama perusahaan final.
- Logo final.
- Detail struktur organisasi final.
- Hak akses Komisaris.
- Hak akses teknis System Admin.
- Detail approval cuti.
- Detail approval izin.
- Detail workflow resign.
- Urutan final approval mutasi Arsiparis.
- Aturan jam kerja tiap lokasi.
- Aturan shift.
- Aturan tanggal merah/cuti bersama dan pengecualian.
- Formula keterlambatan.
- Formula lembur.
- Formula potongan.
- Formula payroll.
- Hak akses final Keuangan pada tahap payroll.
- Durasi penyimpanan selfie.
- Kebijakan penyimpanan dokumen.
- Provider hosting.
- Provider storage final.
- Provider face verification.
- Detail fake-GPS detection.
- Detail notifikasi.
- Aturan ketika GPS/internet/kamera gagal.
- Aturan lupa check-out.
- Aturan koreksi absensi.

---

# 26. MVP Priority

## P0

**Penempatan + Absensi**

## P1

**Data Karyawan + Cuti/Izin + Monitoring**

## P2

**Payroll + Reporting**

## P3

**AI + Advanced Automation**

---

# 27. Success Criteria

MVP dianggap berhasil apabila:

- Karyawan dapat melakukan absensi melalui HP.
- Sistem dapat memvalidasi lokasi sesuai penempatan.
- Sistem dapat melakukan selfie/face verification sesuai rancangan.
- HR dapat melihat dan memonitor absensi.
- HR dapat melihat siapa yang terlambat/tidak hadir.
- HR dapat mengubah penempatan melalui dashboard tanpa coding.
- Koordinator dapat mengajukan perubahan penempatan.
- Penempatan baru tenaga borongan membutuhkan approval HR.
- Sistem menyimpan histori penempatan.
- Sistem dapat menangani perbedaan jadwal berdasarkan lokasi.
- Perubahan penting dapat dilacak melalui audit log.
- Data dapat direkap dan diekspor.
- Sistem memiliki fondasi yang dapat dikembangkan ke payroll.

---

# 28. Catatan Pengembangan

Dokumen ini adalah **PRD Draft v0.2** dan belum merupakan spesifikasi teknis final.

Setiap keputusan bisnis baru harus:

1. Dibahas.
2. Disepakati.
3. Ditambahkan ke PRD.
4. Jika memengaruhi database, update database design.
5. Jika memengaruhi permission, update RBAC.
6. Jika memengaruhi workflow, update business rules.
7. Baru kemudian diterjemahkan menjadi task coding.

## Prinsip Utama

> **Jangan coding berdasarkan asumsi.**  
> Jika aturan bisnis belum jelas, tandai sebagai **Open Question** terlebih dahulu.
