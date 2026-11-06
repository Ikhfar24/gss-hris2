#Requires -Version 5.1
<#
.SYNOPSIS
  Mengembalikan dump database GSS HRIS dari PC kantor ke PostgreSQL lokal.

.DESCRIPTION
  Skrip ini:
  1. menghentikan backend GSS HRIS yang sedang berjalan,
  2. mengosongkan lalu membuat ulang database lokal,
  3. memulihkan dump dengan pg_restore,
  4. menyalin kunci enkripsi PII dari backend/.env PC kantor (opsional tapi penting),
  5. menjalankan prisma migrate deploy dan menampilkan jumlah data.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\restore-local-database.ps1 -DumpPath db-dump\papaiz_hris-20261025-020000.dump -OfficeEnvPath db-dump\backend-20261025-020000.env

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\restore-local-database.ps1 -DumpPath db-dump\papaiz_hris-20261025-020000.dump -SkipMigrations
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DumpPath,

  [string]$OfficeEnvPath,
  [string]$Database,
  [string]$PgBin,
  [switch]$SkipMigrations,
  [switch]$KeepBackend
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot 'backend\.env'
if (-not (Test-Path $envPath)) { throw "backend\.env tidak ditemukan di $envPath" }
if (-not (Test-Path $DumpPath)) { throw "File dump tidak ditemukan: $DumpPath" }
$DumpPath = (Resolve-Path $DumpPath).Path

function Find-PgBin {
  if ($PgBin) {
    if (-not (Test-Path (Join-Path $PgBin 'pg_restore.exe'))) { throw "PgBin tidak berisi pg_restore.exe: $PgBin" }
    return $PgBin
  }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'GSS-HRIS\postgresql-16\pgsql\bin'),
    (Join-Path $env:ProgramFiles 'PostgreSQL\16\bin'),
    (Join-Path $env:ProgramFiles 'PostgreSQL\17\bin')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path (Join-Path $candidate 'pg_restore.exe')) { return $candidate }
  }
  $command = Get-Command pg_restore -ErrorAction SilentlyContinue
  if ($command) { return (Split-Path -Parent $command.Source) }
  throw "pg_restore tidak ditemukan. Install PostgreSQL 16 lengkap atau isi parameter -PgBin."
}

function Get-DatabaseUrlParts {
  $line = Get-Content $envPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if (-not $line) { throw "DATABASE_URL tidak ditemukan di backend\.env" }
  $value = $line.Substring('DATABASE_URL='.Length).Trim().Trim('"')
  $uri = [Uri]$value
  return @{
    Host = $uri.Host
    Port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    User = [Uri]::UnescapeDataString($uri.UserInfo.Split(':')[0])
    Password = [Uri]::UnescapeDataString($uri.UserInfo.Split(':')[1])
    Database = $uri.AbsolutePath.TrimStart('/')
  }
}

function Read-EnvFile([string]$Path) {
  $values = @{}
  foreach ($line in Get-Content $Path) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $values[$Matches[1]] = $Matches[2].Trim().Trim('"')
    }
  }
  return $values
}

function Stop-GssBackend {
  $processes = @(
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like "*gss-hris\backend*" }
  )
  $listeners = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process -and $process.Name -eq 'node.exe') { $processes += $process }
  }
  $processes = $processes | Sort-Object ProcessId -Unique
  if (-not $processes) { return }
  Write-Host "Menghentikan backend GSS HRIS (PID: $($processes.ProcessId -join ', ')) ..." -ForegroundColor Yellow
  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (-not (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue)) { return }
  }
  throw "Port 4000 masih dipakai. Hentikan backend secara manual lalu jalankan ulang skrip."
}

$bin = Find-PgBin
$url = Get-DatabaseUrlParts
if (-not $Database) { $Database = $url.Database }
$isMainDatabase = ($Database -eq $url.Database)

if (-not $KeepBackend) {
  Stop-GssBackend
} elseif (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue) {
  throw "Backend masih berjalan di port 4000. Hentikan dulu atau jalankan tanpa -KeepBackend."
}

if ($OfficeEnvPath) {
  if (-not (Test-Path $OfficeEnvPath)) { throw "File .env kantor tidak ditemukan: $OfficeEnvPath" }
  $officeEnv = Read-EnvFile (Resolve-Path $OfficeEnvPath).Path
  $required = @('PII_ENCRYPTION_KEY', 'PII_KEY_VERSION')
  $missing = $required | Where-Object { -not $officeEnv.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($officeEnv[$_]) }
  if ($missing) { throw "File .env kantor tidak memuat nilai untuk: $($missing -join ', ')" }
} else {
  Write-Warning "OfficeEnvPath tidak diberikan. Data karyawan yang terenkripsi mungkin tidak bisa dibaca."
  Write-Warning "Minta backend\.env dari PC kantor agar PII_ENCRYPTION_KEY dan PII_KEY_VERSION cocok."
}

$psql = Join-Path $bin 'psql.exe'
$dropdb = Join-Path $bin 'dropdb.exe'
$createdb = Join-Path $bin 'createdb.exe'
$pgRestore = Join-Path $bin 'pg_restore.exe'
$pgIsReady = Join-Path $bin 'pg_isready.exe'

$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $url.Password
try {
  & $pgIsReady -h $url.Host -p $url.Port | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL tidak menerima koneksi di $($url.Host):$($url.Port). Jalankan GSS HRIS Database dulu." }

  Write-Host "Memutus koneksi aktif ke database $Database ..." -ForegroundColor Cyan
  $terminate = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$Database' AND pid <> pg_backend_pid();"
  & $psql -h $url.Host -p $url.Port -U $url.User -d postgres -v ON_ERROR_STOP=1 -c $terminate | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Gagal memutus koneksi ke database $Database." }

  Write-Host "Membuat ulang database $Database ..." -ForegroundColor Cyan
  & $dropdb -h $url.Host -p $url.Port -U $url.User --if-exists --force $Database
  if ($LASTEXITCODE -ne 0) { throw "Gagal menghapus database $Database." }
  & $createdb -h $url.Host -p $url.Port -U $url.User -E UTF8 -T template0 $Database
  if ($LASTEXITCODE -ne 0) { throw "Gagal membuat database $Database." }

  Write-Host "Memulihkan dump (bisa memakan waktu beberapa menit) ..." -ForegroundColor Cyan
  & $pgRestore -h $url.Host -p $url.Port -U $url.User -d $Database --no-owner --no-acl --single-transaction --exit-on-error $DumpPath
  if ($LASTEXITCODE -ne 0) { throw "pg_restore gagal (exit $LASTEXITCODE). Database mungkin kosong; jalankan ulang setelah masalah diperbaiki." }
} finally {
  $env:PGPASSWORD = $previousPassword
}

if ($OfficeEnvPath -and $isMainDatabase) {
  Write-Host "Menyalin kunci enkripsi dari .env kantor ..." -ForegroundColor Cyan
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  Copy-Item $envPath "$envPath.backup-$stamp"
  $keys = @(
    'PII_ENCRYPTION_KEY',
    'PII_KEY_VERSION',
    'TEMP_CREDENTIAL_ENCRYPTION_KEY',
    'TEMP_CREDENTIAL_KEY_VERSION',
    'TEMP_CREDENTIAL_TTL_HOURS'
  )
  $lines = Get-Content $envPath
  foreach ($key in $keys) {
    if (-not $officeEnv.ContainsKey($key)) { continue }
    $newLine = "$key=$($officeEnv[$key])"
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^$key=") {
        $lines[$i] = $newLine
        $found = $true
        break
      }
    }
    if (-not $found) { $lines += $newLine }
    Write-Host "  $key diperbarui"
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($envPath, [string[]]$lines, $utf8NoBom)
  Write-Host "  Backup .env lama: $envPath.backup-$stamp" -ForegroundColor DarkGray
} elseif ($OfficeEnvPath) {
  Write-Warning "Database $Database bukan database utama di backend\.env; kunci enkripsi tidak diubah."
}

if (-not $SkipMigrations -and $isMainDatabase) {
  Write-Host "Menjalankan prisma migrate deploy ..." -ForegroundColor Cyan
  Push-Location (Join-Path $repoRoot 'backend')
  try {
    & npx.cmd prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy gagal (exit $LASTEXITCODE)." }
  } finally {
    Pop-Location
  }
} elseif (-not $isMainDatabase) {
  Write-Warning "Database uji $Database bukan database utama; migrasi dilewati."
}

$env:PGPASSWORD = $url.Password
try {
  Write-Host ""
  Write-Host "Jumlah data setelah restore:" -ForegroundColor Green
  $counts = @"
SELECT 'users' AS tabel, count(*) FROM users
UNION ALL SELECT 'employees', count(*) FROM employees
UNION ALL SELECT 'clients', count(*) FROM clients
UNION ALL SELECT 'locations', count(*) FROM locations
UNION ALL SELECT 'leave_requests', count(*) FROM leave_requests
UNION ALL SELECT 'company_settings', count(*) FROM company_settings;
"@
  & $psql -h $url.Host -p $url.Port -U $url.User -d $Database -c $counts

  Write-Host "Akun yang tersedia:" -ForegroundColor Green
  & $psql -h $url.Host -p $url.Port -U $url.User -d $Database -c 'SELECT email, role, \"isActive\" FROM users ORDER BY role, email;'
} finally {
  $env:PGPASSWORD = $previousPassword
}

Write-Host ""
Write-Host "Restore selesai. Nyalakan backend dengan:" -ForegroundColor Cyan
Write-Host "  cd backend"
Write-Host "  npm run start:dev"
Write-Host "Lalu login memakai akun kantor (bukan akun bootstrap lokal)."
