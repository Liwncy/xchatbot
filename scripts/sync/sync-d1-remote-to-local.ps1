param(
    [string]$Database = "xbotdata",
    [string]$OutputDir = ".tmp",
    [string]$OutputFile = "d1-remote.sql",
    [switch]$SkipResetTarget
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Invoke-D1Json {
    param(
        [string]$DatabaseName,
        [string]$Scope,
        [string]$Sql
    )

    $raw = & npx wrangler d1 execute $DatabaseName $Scope --command $Sql --json
    if ($LASTEXITCODE -ne 0) {
        throw "D1 command failed: $Sql"
    }
    return ($raw | ConvertFrom-Json)
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "npx command is not available."
}

Ensure-Directory (Join-Path (Get-Location) $OutputDir)
$outputPath = Join-Path (Join-Path (Get-Location) $OutputDir) $OutputFile

Write-Host "[D1] Exporting remote database '$Database' to $outputPath ..." -ForegroundColor Cyan
& npx wrangler d1 export $Database --remote --output $outputPath
if ($LASTEXITCODE -ne 0) {
    throw "Remote D1 export failed."
}

if (-not $SkipResetTarget) {
    Write-Host "[D1] Resetting local target tables before import ..." -ForegroundColor Yellow
    $tableQuery = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;"
    $rows = Invoke-D1Json -DatabaseName $Database -Scope "--local" -Sql $tableQuery
    $tables = @($rows[0].results | ForEach-Object { [string]$_.name } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    if ($tables.Count -gt 0) {
        foreach ($table in $tables) {
            $dropSql = "DROP TABLE IF EXISTS [" + $table.Replace("]", "]]" ) + "]"
            & npx wrangler d1 execute $Database --local --command $dropSql | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to drop local table: $table"
            }
        }
    }
}

Write-Host "[D1] Importing into local database '$Database' from $outputPath ..." -ForegroundColor Cyan
& npx wrangler d1 execute $Database --local --file $outputPath
if ($LASTEXITCODE -ne 0) {
    throw "Local D1 import failed."
}

Write-Host "Done: remote D1 synced to local." -ForegroundColor Green

