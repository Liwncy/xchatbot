param(
    [Parameter(Mandatory = $true)]
    [string]$BannerKey,

    [Parameter(Mandatory = $true)]
    [string]$Title,

    [Parameter(Mandatory = $true)]
    [long]$StartAtMs,

    [Parameter(Mandatory = $true)]
    [long]$EndAtMs,

    [Parameter(Mandatory = $true)]
    [string]$UpPetName,

    [string]$Database = "xbotdata",
    [ValidateSet("local", "remote")]
    [string]$Target = "local",
    [int]$DrawCost = 120,
    [int]$HardPityUr = 90,
    [int]$HardPityUp = 180,
    [string]$UpPetType = "limited",
    [ValidateSet("r", "sr", "ur")]
    [string]$UpPetRarity = "ur",
    [string]$EntriesJsonPath,
    [switch]$CloseOtherActive,
    [string]$ExclusiveTrait,
    [string]$SkillName,
    [string]$SkillDesc,
    [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Escape-SqlString {
    param([string]$Value)
    if ($null -eq $Value) { return "" }
    return $Value.Replace("'", "''")
}

function Invoke-D1 {
    param([string]$Sql)

    $scopeArg = if ($Target -eq "remote") { "--remote" } else { "--local" }
    if ($WhatIf) {
        Write-Host "[WhatIf] wrangler d1 execute $Database $scopeArg --command <SQL>" -ForegroundColor Yellow
        Write-Host $Sql -ForegroundColor DarkGray
        return
    }
    & wrangler d1 execute $Database $scopeArg --command $Sql
}

if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
    throw "wrangler command is not available."
}

if ($StartAtMs -ge $EndAtMs) {
    throw "StartAtMs must be less than EndAtMs."
}

$escapedBannerKey = Escape-SqlString $BannerKey
$escapedTitle = Escape-SqlString $Title
$escapedUpPetName = Escape-SqlString $UpPetName
$escapedUpPetType = Escape-SqlString $UpPetType

$entries = @()
if ($EntriesJsonPath) {
    if (-not (Test-Path $EntriesJsonPath)) {
        throw "EntriesJsonPath does not exist: $EntriesJsonPath"
    }
    $entries = Get-Content -Raw -Path $EntriesJsonPath | ConvertFrom-Json
} else {
    # Minimal default pool template.
    $entries = @(
        [pscustomobject]@{ pet_name = $UpPetName; pet_type = $UpPetType; rarity = $UpPetRarity; weight = 50; is_up = 1 },
        [pscustomobject]@{ pet_name = "DefaultUrB"; pet_type = "limited"; rarity = "ur"; weight = 50; is_up = 0 },
        [pscustomobject]@{ pet_name = "DefaultSrA"; pet_type = "rare"; rarity = "sr"; weight = 280; is_up = 0 },
        [pscustomobject]@{ pet_name = "DefaultSrB"; pet_type = "rare"; rarity = "sr"; weight = 280; is_up = 0 },
        [pscustomobject]@{ pet_name = "DefaultR"; pet_type = "beast"; rarity = "r"; weight = 620; is_up = 0 }
    )
}

$entries = @($entries)
if ($entries.Count -eq 0) {
    throw "No banner entries found."
}

$upCount = @($entries | Where-Object { [int]($_.is_up) -eq 1 }).Count
if ($upCount -lt 1) {
    throw "At least one entry must have is_up=1."
}

$nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

$upsertBannerSql = @"
INSERT INTO xiuxian_pet_banners (
  banner_key, title, status, start_at, end_at, draw_cost, hard_pity_ur, hard_pity_up, up_pet_name, created_at, updated_at
) VALUES (
  '$escapedBannerKey', '$escapedTitle', 'active', $StartAtMs, $EndAtMs, $DrawCost, $HardPityUr, $HardPityUp, '$escapedUpPetName', $nowMs, $nowMs
)
ON CONFLICT(banner_key) DO UPDATE SET
  title=excluded.title,
  status=excluded.status,
  start_at=excluded.start_at,
  end_at=excluded.end_at,
  draw_cost=excluded.draw_cost,
  hard_pity_ur=excluded.hard_pity_ur,
  hard_pity_up=excluded.hard_pity_up,
  up_pet_name=excluded.up_pet_name,
  updated_at=excluded.updated_at;
"@
Invoke-D1 $upsertBannerSql

if ($CloseOtherActive) {
    $closeOthersSql = @"
UPDATE xiuxian_pet_banners
SET status='closed', updated_at=$nowMs
WHERE banner_key <> '$escapedBannerKey' AND status='active';
"@
    Invoke-D1 $closeOthersSql
}

$deleteEntriesSql = @"
DELETE FROM xiuxian_pet_banner_entries
WHERE banner_id = (SELECT id FROM xiuxian_pet_banners WHERE banner_key='$escapedBannerKey' LIMIT 1);
"@
Invoke-D1 $deleteEntriesSql

foreach ($entry in $entries) {
    $petName = Escape-SqlString ([string]$entry.pet_name)
    $petType = Escape-SqlString ([string]$entry.pet_type)
    $rarity = Escape-SqlString ([string]$entry.rarity)
    $weight = [Math]::Max(1, [int]$entry.weight)
    $isUp = if ([int]$entry.is_up -eq 1) { 1 } else { 0 }

    $insertEntrySql = @"
INSERT INTO xiuxian_pet_banner_entries (banner_id, pet_name, pet_type, rarity, weight, is_up)
SELECT id, '$petName', '$petType', '$rarity', $weight, $isUp
FROM xiuxian_pet_banners
WHERE banner_key='$escapedBannerKey';
"@
    Invoke-D1 $insertEntrySql
}

if ($ExclusiveTrait -or $SkillName -or $SkillDesc) {
    if (-not ($ExclusiveTrait -and $SkillName -and $SkillDesc)) {
        throw "Provide ExclusiveTrait, SkillName and SkillDesc together."
    }

    $escapedTrait = Escape-SqlString $ExclusiveTrait
    $escapedSkillName = Escape-SqlString $SkillName
    $escapedSkillDesc = Escape-SqlString $SkillDesc

    $upsertProfileSql = @"
INSERT INTO xiuxian_pet_exclusive_profiles (
  pet_name, exclusive_trait, skill_name, skill_desc, updated_at
) VALUES (
  '$escapedUpPetName', '$escapedTrait', '$escapedSkillName', '$escapedSkillDesc', $nowMs
)
ON CONFLICT(pet_name) DO UPDATE SET
  exclusive_trait=excluded.exclusive_trait,
  skill_name=excluded.skill_name,
  skill_desc=excluded.skill_desc,
  updated_at=excluded.updated_at;
"@
    Invoke-D1 $upsertProfileSql
}

$checkBannerSql = "SELECT banner_key, title, status, up_pet_name, start_at, end_at FROM xiuxian_pet_banners WHERE banner_key='$escapedBannerKey';"
$checkEntriesSql = "SELECT pet_name, rarity, weight, is_up FROM xiuxian_pet_banner_entries WHERE banner_id=(SELECT id FROM xiuxian_pet_banners WHERE banner_key='$escapedBannerKey') ORDER BY rarity DESC, is_up DESC, weight DESC;"

Invoke-D1 $checkBannerSql
Invoke-D1 $checkEntriesSql

Write-Host "Done: banner '$BannerKey' updated." -ForegroundColor Green




