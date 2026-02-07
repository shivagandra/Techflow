param(
  [string]$Database = "techflow"
)

Write-Host "Checking Postgres connectivity for database '$Database'..." -ForegroundColor Cyan

$envFile = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envFile)) {
  Write-Error ".env not found at $envFile"
  exit 1
}

$envContent = Get-Content $envFile -Raw
$match = [regex]::Match($envContent, 'DATABASE_URL\s*=\s*"?(?<url>[^"\r\n]+)"?')
if (-not $match.Success) {
  Write-Error "DATABASE_URL not found in .env"
  exit 1
}

$dbUrl = $match.Groups["url"].Value
Write-Host "Using DATABASE_URL: $dbUrl" -ForegroundColor DarkGray

$createdb = Get-Command createdb -ErrorAction SilentlyContinue
$psql = Get-Command psql -ErrorAction SilentlyContinue

if (-not $createdb -and -not $psql) {
  $pgBin = Get-ChildItem "C:\\Program Files\\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($pgBin) {
    $psql = $pgBin.FullName
    $createdbCandidate = $pgBin.FullName -replace "psql.exe$","createdb.exe"
    if (Test-Path $createdbCandidate) {
      $createdb = $createdbCandidate
    }
  }
}

Write-Host "Ensuring database exists..." -ForegroundColor Cyan
if ($createdb) {
  & $createdb $Database 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Database created: $Database" -ForegroundColor Green
  } else {
    Write-Host "Database already exists or could not be created (this can be OK)." -ForegroundColor Yellow
  }
} elseif ($psql) {
  if ($dbUrl -match "@") {
    Write-Warning "DATABASE_URL contains '@' in the password. URL-encode it (e.g., @ -> %40) before using psql."
  }

  $adminUrl = $dbUrl -replace "/[^/?]+\\?","/postgres?"
  $createDbSql = "CREATE DATABASE $Database;"
  & $psql "$adminUrl" -c $createDbSql 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Database created: $Database" -ForegroundColor Green
  } else {
    Write-Host "Database already exists or could not be created (this can be OK)." -ForegroundColor Yellow
  }
} else {
  Write-Error "Neither createdb nor psql was found. Install Postgres client tools or add them to PATH."
  exit 1
}

Write-Host "Generating Prisma client..." -ForegroundColor Cyan
& npx.cmd prisma generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Pushing schema to database..." -ForegroundColor Cyan
& npx.cmd prisma db push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Postgres check complete." -ForegroundColor Green
