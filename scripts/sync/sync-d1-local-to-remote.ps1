param(
    [string]$Database = "xbotdata",
    [string]$OutputDir = ".tmp",
    [string]$OutputFile = "d1-local.sql",
    [string]$BackupDir = ".tmp/sync-backups",
    [string]$LogDir = ".tmp/sync-logs",
    [string]$RunTag = "",
    [switch]$SkipBackup,
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

$runTagValue = if ([string]::IsNullOrWhiteSpace($RunTag)) { Get-Date -Format "yyyyMMdd-HHmmss" } else { $RunTag }

Ensure-Directory (Join-Path (Get-Location) $OutputDir)
Ensure-Directory (Join-Path (Get-Location) $BackupDir)
Ensure-Directory (Join-Path (Get-Location) $LogDir)

$outputPath = Join-Path (Join-Path (Get-Location) $OutputDir) $OutputFile
$logPath = Join-Path (Join-Path (Get-Location) $LogDir) ("sync-d1-local-to-remote-$runTagValue.log")

Start-Transcript -Path $logPath -Append | Out-Null
try {
    if (-not $SkipBackup) {
        $backupPath = Join-Path (Join-Path (Get-Location) $BackupDir) ("d1-remote-backup-$runTagValue.sql")
        Write-Host "[D1] Backing up remote database '$Database' to $backupPath ..." -ForegroundColor Yellow
        & npx wrangler d1 export $Database --remote --output $backupPath
        if ($LASTEXITCODE -ne 0) {
            throw "Remote D1 backup failed."
        }
    }

    Write-Host "[D1] Exporting local database '$Database' to $outputPath ..." -ForegroundColor Cyan
    & npx wrangler d1 export $Database --local --output $outputPath
    if ($LASTEXITCODE -ne 0) {
        throw "Local D1 export failed."
    }

    if (-not $SkipResetTarget) {
        Write-Host "[D1] Resetting remote target tables before import ..." -ForegroundColor Yellow
        $tableQuery = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;"
        $rows = Invoke-D1Json -DatabaseName $Database -Scope "--remote" -Sql $tableQuery
        $tables = @($rows[0].results | ForEach-Object { [string]$_.name } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

        if ($tables.Count -gt 0) {
            foreach ($table in $tables) {
                $dropSql = "DROP TABLE IF EXISTS [" + $table.Replace("]", "]]" ) + "]"
                & npx wrangler d1 execute $Database --remote --command $dropSql | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    throw "Failed to drop remote table: $table"
                }
            }
        }
    }

    Write-Host "[D1] Importing into remote database '$Database' from $outputPath ..." -ForegroundColor Cyan
    & npx wrangler d1 execute $Database --remote --file $outputPath
    if ($LASTEXITCODE -ne 0) {
        throw "Remote D1 import failed."
    }

    Write-Host "Done: local D1 synced to remote." -ForegroundColor Green
    Write-Host "Log: $logPath" -ForegroundColor DarkGray
}
finally {
    Stop-Transcript | Out-Null
}
