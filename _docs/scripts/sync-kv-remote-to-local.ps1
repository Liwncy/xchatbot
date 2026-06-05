param(
    [string]$Binding = "XBOT_KV"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "npx command is not available."
}

Write-Host "[KV] Listing remote keys for binding '$Binding' ..." -ForegroundColor Cyan
$rawList = & npx wrangler kv key list --binding $Binding --remote
$keys = $rawList | ConvertFrom-Json

if ($null -eq $keys -or @($keys).Count -eq 0) {
    Write-Host "Done: no remote KV keys found." -ForegroundColor Yellow
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

    & node ./_docs/scripts/kv-utf8-copy.cjs copy --binding $Binding --key $key --from remote --to local | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to sync remote KV key to local: $key"
    }

    Write-Host "[$index/$total] synced: $key" -ForegroundColor DarkGray
}

Write-Host "Done: remote KV synced to local. total=$total" -ForegroundColor Green

