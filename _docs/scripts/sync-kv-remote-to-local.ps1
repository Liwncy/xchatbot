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

    # Use --text because current project KV values are text/json configs.
    $value = & npx wrangler kv key get --binding $Binding $key --remote --text
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to read remote KV key: $key"
    }

    $tmpFile = New-TemporaryFile
    try {
        Set-Content -Path $tmpFile -Value $value -Encoding UTF8
        & npx wrangler kv key put --binding $Binding $key --path $tmpFile --local | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to write local KV key: $key"
        }
    }
    finally {
        Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
    }

    Write-Host "[$index/$total] synced: $key" -ForegroundColor DarkGray
}

Write-Host "Done: remote KV synced to local. total=$total" -ForegroundColor Green

