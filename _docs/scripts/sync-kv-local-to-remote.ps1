param(
    [string]$Binding = "XBOT_KV",
    [string]$BackupDir = ".tmp/sync-backups",
    [string]$LogDir = ".tmp/sync-logs",
    [string]$RunTag = "",
    [switch]$SkipBackup
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

$runTagValue = if ([string]::IsNullOrWhiteSpace($RunTag)) { Get-Date -Format "yyyyMMdd-HHmmss" } else { $RunTag }
Ensure-Directory (Join-Path (Get-Location) $BackupDir)
Ensure-Directory (Join-Path (Get-Location) $LogDir)

$logPath = Join-Path (Join-Path (Get-Location) $LogDir) ("sync-kv-local-to-remote-$runTagValue.log")
$backupRoot = Join-Path (Join-Path (Get-Location) $BackupDir) ("kv-remote-backup-$runTagValue")

Start-Transcript -Path $logPath -Append | Out-Null
try {
    if (-not $SkipBackup) {
        Ensure-Directory $backupRoot

        Write-Host "[KV] Backing up remote keys for binding '$Binding' ..." -ForegroundColor Yellow
        $rawRemoteList = & npx wrangler kv key list --binding $Binding --remote
        $remoteKeys = $rawRemoteList | ConvertFrom-Json
        $manifest = @()

        if ($null -ne $remoteKeys -and @($remoteKeys).Count -gt 0) {
            $backupIndex = 0
            foreach ($remoteItem in $remoteKeys) {
                $backupIndex++
                $remoteKey = [string]$remoteItem.name
                if ([string]::IsNullOrWhiteSpace($remoteKey)) {
                    continue
                }

                $safeFileName = ("item-{0:D5}.txt" -f $backupIndex)
                $remoteFilePath = Join-Path $backupRoot $safeFileName
                & node ./_docs/scripts/kv-utf8-copy.cjs export --binding $Binding --key $remoteKey --from remote --out $remoteFilePath | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    throw "Failed to back up remote KV key: $remoteKey"
                }

                $manifest += [pscustomobject]@{
                    key = $remoteKey
                    file = $safeFileName
                }
            }
        }

        Set-Content -Path (Join-Path $backupRoot "keys.json") -Value $rawRemoteList -Encoding UTF8
        $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $backupRoot "manifest.json") -Encoding UTF8
        Write-Host "[KV] Remote backup done at $backupRoot" -ForegroundColor DarkGray
    }

    Write-Host "[KV] Listing local keys for binding '$Binding' ..." -ForegroundColor Cyan
    $rawList = & npx wrangler kv key list --binding $Binding --local
    $keys = $rawList | ConvertFrom-Json

    if ($null -eq $keys -or @($keys).Count -eq 0) {
        Write-Host "Done: no local KV keys found." -ForegroundColor Yellow
        exit 0
    }

    $total = @($keys).Count
    $index = 0

    foreach ($item in $keys) {
        $index++
        $key = [string]$item.name
        if ([string]::IsNullOrWhiteSpace($key)) {
            continue
        }

        & node ./_docs/scripts/kv-utf8-copy.cjs copy --binding $Binding --key $key --from local --to remote | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to sync local KV key to remote: $key"
        }

        Write-Host "[$index/$total] synced: $key" -ForegroundColor DarkGray
    }

    Write-Host "Done: local KV synced to remote. total=$total" -ForegroundColor Green
    Write-Host "Log: $logPath" -ForegroundColor DarkGray
}
finally {
    Stop-Transcript | Out-Null
}
