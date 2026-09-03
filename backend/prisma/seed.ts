import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Default company settings
  const existingSettings = await prisma.companySettings.findFirst();
  if (!existingSettings) {
    await prisma.companySettings.create({
      data: {
        companyName: 'Papaiz.corp',
        appName: 'Papaiz HR',
        email: 'hr@papaiz.corp',
        primaryColor: '#0F172A',
      },
    });
    console.log('Created default company settings');
  }

  // Default System Admin user (change password on first login in real deployment)
  const adminEmail = 'admin@papaiz.corp';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('ChangeMe123!', 10);
    await prisma.user.create({
      data: {
        name: 'System Administrator',
        email: adminEmail,
        passwordHash,
        role: Role.SYSTEM_ADMIN,
      },
    });
    console.log(`Created default admin user: ${adminEmail} / ChangeMe123! (CHANGE THIS)`);
  }

  // Test accounts for each reviewer role, so the placement approval chain
  // (Koordinator -> HR -> Direktur) can actually be exercised end-to-end.
  const testAccounts = [
    { email: 'hr@papaiz.corp', name: 'Admin HR', role: Role.ADMIN_HR, password: 'HR12345678!' },
    { email: 'koordinator@papaiz.corp', name: 'Koordinator Lapangan', role: Role.KOORDINATOR, password: 'Koor12345678!' },
    { email: 'direktur@papaiz.corp', name: 'Direktur Utama', role: Role.DIREKTUR, password: 'Direktur12345678!' },
    { email: 'keuangan@papaiz.corp', name: 'Staf Keuangan', role: Role.KEUANGAN, password: 'Keuangan12345!' },
  ];
  for (const acc of testAccounts) {
    const existing = await prisma.user.findUnique({ where: { email: acc.email } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(acc.password, 10);
      await prisma.user.create({
        data: { name: acc.name, email: acc.email, passwordHash, role: acc.role },
      });
      console.log(`Created test account: ${acc.email} / ${acc.password}`);
    }
  }

  // --- Phase 2 dummy data (PRD §23: development wajib pakai dummy data) ---
  let client = await prisma.client.findFirst({ where: { name: 'PT Contoh Klien' } });
  if (!client) {
    client = await prisma.client.create({
      data: { name: 'PT Contoh Klien', address: 'Jl. Contoh No. 1, Jawa Tengah' },
    });
    console.log('Created dummy client: PT Contoh Klien');
  }

  const locationDefs = [
    { name: 'Muntilan', address: 'Muntilan, Magelang', latitude: -7.6069, longitude: 110.2237 },
    { name: 'Purwokerto', address: 'Purwokerto, Banyumas', latitude: -7.4231, longitude: 109.2340 },
  ];
  const locations: Record<string, string> = {};
  for (const def of locationDefs) {
    let loc = await prisma.location.findFirst({ where: { name: def.name } });
    if (!loc) {
      loc = await prisma.location.create({
        data: {
          name: def.name,
          address: def.address,
          latitude: def.latitude,
          longitude: def.longitude,
          clientId: client.id,
        },
      });
      console.log(`Created dummy location: ${def.name}`);
    }
    locations[def.name] = loc.id;
  }

  // Dummy Tenaga Borongan (flexible placement, §8.1 — mirrors the "Arif" example)
  let borongan = await prisma.employee.findFirst({ where: { name: 'Arif (Contoh Borongan)' } });
  if (!borongan) {
    borongan = await prisma.employee.create({
      data: {
        name: 'Arif (Contoh Borongan)',
        employmentType: 'TENAGA_BORONGAN',
        status: 'ACTIVE',
        joinDate: new Date('2026-08-01'),
        dailyRate: 95000, // contoh tarif Harian Lepas (§15, Rp90.000-97.000)
        placements: { create: { locationId: locations['Muntilan'], startDate: new Date('2026-08-16'), status: 'ACTIVE' } },
      },
    });
    console.log('Created dummy employee: Arif (Tenaga Borongan)');
  }

  // Karyawan login linked to Arif, so the self-service check-in/out flow
  // (Phase 3) can actually be tried end-to-end, not just admin-side.
  const karyawanEmail = 'arif@papaiz.corp';
  const existingKaryawan = await prisma.user.findUnique({ where: { email: karyawanEmail } });
  if (!existingKaryawan) {
    const passwordHash = await bcrypt.hash('Karyawan12345!', 10);
    await prisma.user.create({
      data: {
        name: 'Arif (Contoh Borongan)',
        email: karyawanEmail,
        passwordHash,
        role: Role.KARYAWAN,
        employeeId: borongan.id,
      },
    });
    console.log(`Created test account: ${karyawanEmail} / Karyawan12345!`);
  }

  // Dummy Tenaga Arsiparis (fixed placement + PKWT contract, §8.2)
  const arsiparis = await prisma.employee.findFirst({ where: { name: 'Budi (Contoh Arsiparis)' } });
  if (!arsiparis) {
    await prisma.employee.create({
      data: {
        name: 'Budi (Contoh Arsiparis)',
        employmentType: 'TENAGA_ARSIPARIS',
        status: 'ACTIVE',
        joinDate: new Date('2026-01-01'),
        placements: { create: { locationId: locations['Purwokerto'], startDate: new Date('2026-01-01'), status: 'ACTIVE' } },
        contracts: {
          create: {
            type: 'PKWT',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
            status: 'ACTIVE',
            baseSalary: 3500000, // contoh gaji pokok bulanan (§15)
          },
        },
      },
    });
    console.log('Created dummy employee: Budi (Tenaga Arsiparis)');
  }

  // --- Phase 3 dummy data: example national holiday (§12) ----------------
  const holidayDate = new Date('2026-08-17'); // contoh: HUT RI
  const existingHoliday = await prisma.holiday.findFirst({
    where: { date: holidayDate, locationId: null },
  });
  if (!existingHoliday) {
    await prisma.holiday.create({
      data: { date: holidayDate, name: 'HUT Kemerdekaan RI (contoh)', type: 'NATIONAL' },
    });
    console.log('Created dummy holiday: 17 Agustus');
  }

  // --- Phase 4 dummy data: example pending leave request (§13) -----------
  const existingLeave = await prisma.leaveRequest.findFirst({ where: { employeeId: borongan.id } });
  if (!existingLeave) {
    const arifUser = await prisma.user.findUnique({ where: { email: karyawanEmail } });
    await prisma.leaveRequest.create({
      data: {
        employeeId: borongan.id,
        type: 'CUTI',
        startDate: new Date('2026-09-10'),
        endDate: new Date('2026-09-12'),
        reason: 'Acara keluarga (contoh pengajuan)',
        requestedById: arifUser!.id,
        status: 'PENDING',
      },
    });
    console.log('Created dummy leave request: Arif - Cuti (PENDING)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
