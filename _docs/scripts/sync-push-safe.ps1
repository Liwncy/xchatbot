param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$runTag = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not $Force) {
    Write-Host "You are about to sync LOCAL -> REMOTE for D1 and KV." -ForegroundColor Yellow
    Write-Host "Remote backup will be created first." -ForegroundColor Yellow
    $confirm = Read-Host "Type PUSH to continue"
    if ($confirm -ne "PUSH") {
        throw "Cancelled: confirmation text did not match PUSH."
    }
}

Write-Host "[SAFE PUSH] Run tag: $runTag" -ForegroundColor Cyan

& powershell -NoProfile -ExecutionPolicy Bypass -File "./_docs/scripts/sync-d1-local-to-remote.ps1" -RunTag $runTag
if ($LASTEXITCODE -ne 0) {
    throw "D1 push failed."
}

& powershell -NoProfile -ExecutionPolicy Bypass -File "./_docs/scripts/sync-kv-local-to-remote.ps1" -RunTag $runTag
if ($LASTEXITCODE -ne 0) {
    throw "KV push failed."
}

Write-Host "Done: safe push completed." -ForegroundColor Green
Write-Host "Backups: .tmp/sync-backups" -ForegroundColor DarkGray
Write-Host "Logs: .tmp/sync-logs" -ForegroundColor DarkGray

