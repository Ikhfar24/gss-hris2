#Requires -Version 5.1
<#
.SYNOPSIS
  Membuat dump database GSS HRIS dari PC kantor (Docker atau PostgreSQL lokal).

.DESCRIPTION
  Jalankan skrip ini di PC kantor tempat data asli berada.
  Hasilnya berupa file .dump (format custom pg_dump) dan salinan backend/.env
  yang dibutuhkan agar data terenkripsi bisa dibaca di laptop lain.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dump-database.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dump-database.ps1 -Container gss-hris-postgres-1
#>
[CmdletBinding()]
param(
  [string]$OutputDir,
  [string]$Database = 'papaiz_hris',
  [string]$DbUser = 'postgres',
  [string]$Container,
  [switch]$SkipEnv
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDir) { $OutputDir = Join-Path $repoRoot 'db-dump' }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dumpPath = Join-Path $OutputDir "papaiz_hris-$stamp.dump"

function Find-PgTool([string]$Name) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "GSS-HRIS\postgresql-16\pgsql\bin\$Name.exe"),
    (Join-Path $env:ProgramFiles "PostgreSQL\16\bin\$Name.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

function Get-DatabaseUrlParts {
  $envPath = Join-Path $repoRoot 'backend\.env'
  if (-not (Test-Path $envPath)) { return $null }
  $line = Get-Content $envPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if (-not $line) { return $null }
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

$docker = Get-Command docker -ErrorAction SilentlyContinue
$containerId = $null

if ($docker) {
  if ($Container) {
    $running = & docker ps --format '{{.ID}}|{{.Names}}' 2>$null | Where-Object { $_ -match "\|$([regex]::Escape($Container))$" }
    if (-not $running) { throw "Container '$Container' tidak ditemukan atau tidak berjalan. Cek dengan: docker ps" }
    $containerId = ($running -split '\|')[0]
  } else {
    $candidates = & docker ps --format '{{.ID}}|{{.Image}}|{{.Names}}' 2>$null |
      Where-Object { ($_ -split '\|')[1] -match 'postgres' }
    if ($candidates) {
      $first = @($candidates)[0]
      $containerId = ($first -split '\|')[0]
      $containerName = ($first -split '\|')[2]
      Write-Host "Menemukan container PostgreSQL: $containerName" -ForegroundColor Cyan
    }
  }
}

if ($containerId) {
  Write-Host "Membuat dump dari container $containerId ..." -ForegroundColor Cyan
  $remotePath = "/tmp/papaiz_hris-$stamp.dump"
  & docker exec $containerId pg_dump -U $DbUser -d $Database -Fc -f $remotePath
  if ($LASTEXITCODE -ne 0) { throw "pg_dump di dalam container gagal (exit $LASTEXITCODE)." }
  & docker cp "${containerId}:$remotePath" $dumpPath
  if ($LASTEXITCODE -ne 0) { throw "Gagal menyalin dump dari container ke $dumpPath." }
  & docker exec $containerId rm -f $remotePath | Out-Null
} else {
  $pgDump = Find-PgTool 'pg_dump'
  if (-not $pgDump) {
    throw "pg_dump tidak ditemukan. Jalankan lewat Docker (docker compose up -d) atau install PostgreSQL 16 lengkap."
  }

  $parts = Get-DatabaseUrlParts
  if (-not $parts) {
    throw "DATABASE_URL tidak ditemukan di backend\.env dan tidak ada container Docker. Tidak tahu cara konek ke database."
  }
  if ($parts.Database) { $Database = $parts.Database }
  if ($parts.User) { $DbUser = $parts.User }

  Write-Host "Membuat dump dari PostgreSQL lokal $($parts.Host):$($parts.Port) ..." -ForegroundColor Cyan
  $previousPassword = $env:PGPASSWORD
  $env:PGPASSWORD = $parts.Password
  try {
    & $pgDump -h $parts.Host -p $parts.Port -U $DbUser -d $Database -Fc -f $dumpPath
    if ($LASTEXITCODE -ne 0) { throw "pg_dump gagal (exit $LASTEXITCODE)." }
  } finally {
    $env:PGPASSWORD = $previousPassword
  }
}

if (-not (Test-Path $dumpPath)) { throw "Dump tidak terbentuk: $dumpPath" }
$dumpInfo = Get-Item $dumpPath
Write-Host ""
Write-Host "Dump berhasil dibuat:" -ForegroundColor Green
Write-Host "  $($dumpInfo.FullName)"
Write-Host "  Ukuran: $([math]::Round($dumpInfo.Length / 1MB, 2)) MB"

if (-not $SkipEnv) {
  $envPath = Join-Path $repoRoot 'backend\.env'
  if (Test-Path $envPath) {
    $envCopy = Join-Path $OutputDir "backend-$stamp.env"
    Copy-Item $envPath $envCopy
    Write-Host ""
    Write-Host "Salinan konfigurasi dibuat:" -ForegroundColor Green
    Write-Host "  $envCopy"
    Write-Host "  PENTING: file ini berisi password database dan kunci enkripsi." -ForegroundColor Yellow
    Write-Host "  Jangan di-commit ke Git. Kirim lewat media yang aman." -ForegroundColor Yellow
  } else {
    Write-Warning "backend\.env tidak ditemukan; salinan konfigurasi dilewati."
  }
}

Write-Host ""
Write-Host "Langkah berikutnya:" -ForegroundColor Cyan
Write-Host "  1. Salin folder db-dump ke laptop (flashdisk/cloud pribadi, jangan ke repo publik)."
Write-Host "  2. Di laptop jalankan: powershell -ExecutionPolicy Bypass -File scripts\restore-local-database.ps1 -DumpPath db-dump\<file>.dump -OfficeEnvPath db-dump\backend-<waktu>.env"
