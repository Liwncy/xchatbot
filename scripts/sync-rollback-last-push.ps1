param(
    [string]$Database = "xbotdata",
    [string]$Binding = "XBOT_KV",
    [string]$BackupDir = ".tmp/sync-backups",
    [string]$LogDir = ".tmp/sync-logs",
    [string]$RunTag = "",
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "npx command is not available."
}

$backupRootPath = Join-Path (Get-Location) $BackupDir
Ensure-Directory $backupRootPath
Ensure-Directory (Join-Path (Get-Location) $LogDir)

$targetTag = $RunTag
if ([string]::IsNullOrWhiteSpace($targetTag)) {
    $latestD1Backup = Get-ChildItem -Path $backupRootPath -Filter "d1-remote-backup-*.sql" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($null -eq $latestD1Backup) {
        throw "No D1 backup file found in $backupRootPath"
    }

    $targetTag = [System.IO.Path]::GetFileNameWithoutExtension($latestD1Backup.Name) -replace '^d1-remote-backup-', ''
}

$d1BackupPath = Join-Path $backupRootPath ("d1-remote-backup-$targetTag.sql")
$kvBackupPath = Join-Path $backupRootPath ("kv-remote-backup-$targetTag")
$kvManifestPath = Join-Path $kvBackupPath "manifest.json"

if (-not (Test-Path $d1BackupPath)) {
    throw "D1 backup file not found for run tag '$targetTag': $d1BackupPath"
}
if (-not (Test-Path $kvBackupPath)) {
    throw "KV backup directory not found for run tag '$targetTag': $kvBackupPath"
}
if (-not (Test-Path $kvManifestPath)) {
    throw "KV manifest not found for run tag '$targetTag': $kvManifestPath"
}

if (-not $Force) {
    Write-Host "You are about to ROLLBACK REMOTE data using backup tag: $targetTag" -ForegroundColor Yellow
    $confirm = Read-Host "Type ROLLBACK to continue"
    if ($confirm -ne "ROLLBACK") {
        throw "Cancelled: confirmation text did not match ROLLBACK."
    }
}

$logPath = Join-Path (Join-Path (Get-Location) $LogDir) ("sync-rollback-last-push-$targetTag.log")
Start-Transcript -Path $logPath -Append | Out-Null
try {
    Write-Host "[ROLLBACK] Restoring remote D1 from $d1BackupPath ..." -ForegroundColor Cyan
    & npx wrangler d1 execute $Database --remote --file $d1BackupPath
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to restore remote D1."
    }

    Write-Host "[ROLLBACK] Restoring remote KV from $kvManifestPath ..." -ForegroundColor Cyan
    $manifest = Get-Content -Raw -Path $kvManifestPath | ConvertFrom-Json
    $manifestArray = @($manifest)
    $total = $manifestArray.Count
    $index = 0

    foreach ($item in $manifestArray) {
        $index++
        $key = [string]$item.key
        $file = [string]$item.file
        if ([string]::IsNullOrWhiteSpace($key) -or [string]::IsNullOrWhiteSpace($file)) {
            continue
        }

        $valueFile = Join-Path $kvBackupPath $file
        if (-not (Test-Path $valueFile)) {
            throw "Missing KV backup value file: $valueFile"
        }

        & npx wrangler kv key put --binding $Binding $key --path $valueFile --remote | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to restore remote KV key: $key"
        }

        Write-Host "[$index/$total] restored: $key" -ForegroundColor DarkGray
    }

    Write-Host "Done: rollback completed for run tag $targetTag." -ForegroundColor Green
    Write-Host "Log: $logPath" -ForegroundColor DarkGray
}
finally {
    Stop-Transcript | Out-Null
}

