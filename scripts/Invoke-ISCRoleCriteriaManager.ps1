#Requires -Version 4.0
<#
.SYNOPSIS
    ISC Role Criteria Manager — full-featured PowerShell companion.

.DESCRIPTION
    Four-step interactive workflow (Target → Operation → Preview → Apply) with
    feature parity to the ISC Role Criteria Manager Electron app.

    TARGET MODES
      Single      — exact role name match
      Bulk        — role name contains substring
      Criteria    — roles whose membership criteria match an attribute/op/value
      Access      — roles that contain a specific access profile or entitlement

    OPERATIONS
      Update      — replace an old value with new value(s) on a matching leaf
      Add Values  — append values to the first matching leaf (converts stringValue → values[])
      Add Block   — insert a new criteria leaf, joining with AND or OR
      Remove      — remove a specific value or entire attribute from criteria
      Consolidate — merge sibling OR leaves for the same attribute (same op type only)
      Restore     — revert role(s) to a saved snapshot

    AUTHENTICATION (in priority order)
      1. OAuth2 client credentials (env: ISC_CLIENT_ID + ISC_CLIENT_SECRET)
      2. Bearer token (env: ISC_BEARER_TOKEN or -BearerToken param)
      3. Interactive paste at runtime

.EXAMPLE
    $env:ISC_TENANT_URL    = 'https://acme.api.identitynow.com'
    $env:ISC_CLIENT_ID     = 'your-client-id'
    $env:ISC_CLIENT_SECRET = 'your-client-secret'
    ./Invoke-ISCRoleCriteriaManager.ps1

.EXAMPLE
    # Dry run — previews all changes, makes no API writes
    ./Invoke-ISCRoleCriteriaManager.ps1 -WhatIf
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$TenantUrl    = $env:ISC_TENANT_URL,
    [string]$ClientId     = $env:ISC_CLIENT_ID,
    [string]$ClientSecret = $env:ISC_CLIENT_SECRET,
    [string]$BearerToken  = $env:ISC_BEARER_TOKEN
)

$ErrorActionPreference = 'Stop'

# TLS 1.2 — required for SailPoint ISC; default on PS4/Win8.1 is TLS 1.0/1.1
try {
    $tls12 = [Net.SecurityProtocolType]::Tls12
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor $tls12
} catch { }

# ============================================================================
# CONSTANTS
# ============================================================================
$PAGE_SIZE              = 250
$LARGE_RESULT_THRESHOLD = 1000

# ============================================================================
# SECTION 1 — CONNECTION
# ============================================================================

if ([string]::IsNullOrWhiteSpace($TenantUrl)) {
    Write-Host ''
    Write-Host 'Enter your ISC tenant URL (either form is accepted):' -ForegroundColor Cyan
    Write-Host '  https://acme.identitynow.com' -ForegroundColor Green
    Write-Host '  https://acme.api.identitynow.com' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Tenant URL: ' -ForegroundColor Cyan -NoNewline
    $TenantUrl = ([Console]::ReadLine()).Trim()
}

# Normalize: add https:// if missing, insert .api. if absent, strip trailing slash
$TenantUrl = $TenantUrl.TrimEnd('/')
if ($TenantUrl -notmatch '^https?://') { $TenantUrl = "https://$TenantUrl" }
if ($TenantUrl -match '^(https://[^.]+)\.(identitynow(?:-demo)?\.com)') {
    $TenantUrl = "$($Matches[1]).api.$($Matches[2])"
    Write-Host "  URL normalized to API format: $TenantUrl" -ForegroundColor Yellow
}
$baseUrl = $TenantUrl.TrimEnd('/')

# --- Token acquisition ---
if (-not [string]::IsNullOrWhiteSpace($ClientId) -and -not [string]::IsNullOrWhiteSpace($ClientSecret)) {
    Write-Host 'Acquiring token via OAuth2 client credentials...' -ForegroundColor Cyan
    try {
        $body     = "grant_type=client_credentials&client_id=$([uri]::EscapeDataString($ClientId))&client_secret=$([uri]::EscapeDataString($ClientSecret))"
        $tokenResp = Invoke-RestMethod -Uri "$baseUrl/oauth/token" -Method POST `
                         -ContentType 'application/x-www-form-urlencoded' -Body $body
        $tokenPlain = $tokenResp.access_token
        Write-Host "Token acquired (expires in $($tokenResp.expires_in)s)." -ForegroundColor Green
    } catch {
        Write-Host "OAuth2 token request failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} elseif (-not [string]::IsNullOrWhiteSpace($BearerToken)) {
    $tokenPlain = $BearerToken
    Write-Host 'Using bearer token from parameter/environment.' -ForegroundColor Cyan
} else {
    Write-Host 'No credentials found. Paste your Bearer token and press Enter:' -ForegroundColor Cyan
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $tokenPlain = ([Console]::ReadLine()).Trim()
}

if ([string]::IsNullOrWhiteSpace($tokenPlain)) {
    Write-Host 'No token available. Exiting.' -ForegroundColor Red
    exit 1
}

# --- JWT org guard ---
try {
    $jwtPayload = $tokenPlain.Split('.')[1]
    $pad = 4 - ($jwtPayload.Length % 4); if ($pad -ne 4) { $jwtPayload += '=' * $pad }
    $jwtPayload = $jwtPayload.Replace('-', '+').Replace('_', '/')
    $claims = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($jwtPayload)) |
              ConvertFrom-Json
    $jwtOrg = $claims.org
    $urlOrg = ([uri]$baseUrl).Host.Split('.')[0]
    if ($jwtOrg -and $jwtOrg -ne $urlOrg) {
        Write-Host ''
        Write-Host '  *** TOKEN/TENANT MISMATCH ***' -ForegroundColor Red
        Write-Host "  Token org : $jwtOrg" -ForegroundColor Red
        Write-Host "  URL org   : $urlOrg ($baseUrl)" -ForegroundColor Red
        Write-Host "  You need a token for '$urlOrg', not '$jwtOrg'." -ForegroundColor Yellow
        Write-Host ''
        exit 1
    }
    Write-Host "Token org verified: $jwtOrg" -ForegroundColor Green
} catch {
    Write-Host '  (Could not decode JWT — proceeding)' -ForegroundColor DarkGray
}

# --- Headers ---
$getHeaders   = @{ Authorization = "Bearer $tokenPlain"; Accept = 'application/json' }
$patchHeaders = @{
    Authorization  = "Bearer $tokenPlain"
    'Content-Type' = 'application/json-patch+json'
    Accept         = 'application/json'
}

# ============================================================================
# SECTION 2 — API HELPERS
# ============================================================================

function Invoke-ISCGet([string]$Uri) {
    Invoke-RestMethod -Uri $Uri -Headers $getHeaders -Method GET
}

function Invoke-ISCPatch([string]$Uri, [string]$Body) {
    Invoke-RestMethod -Uri $Uri -Headers $patchHeaders -Method Patch -Body $Body
}

# ============================================================================
# SECTION 3 — CRITERIA MODEL
# Deep-clone via JSON round-trip; in-place mutations via PSObject.Properties.
# Mirrors criteria.model.ts invariants exactly.
# ============================================================================

function Copy-Deep($obj) {
    $obj | ConvertTo-Json -Depth 20 | ConvertFrom-Json
}

# Strips a leading 'attribute.' prefix (case-insensitive) from an IDENTITY
# key property for display and prefix-agnostic comparison.
function Get-NormalizedAttr([string]$attr) {
    return $attr -ireplace '^attribute\.', ''
}

# Returns $true when $stored and $queried refer to the same IDENTITY attribute,
# treating 'cloudLifecycleState' and 'attribute.cloudLifecycleState' as equal.
# For non-IDENTITY keys ($isIdentity=$false), performs a plain -eq comparison.
function Compare-IdentityAttr([string]$stored, [string]$queried, [bool]$isIdentity = $true) {
    if (-not $isIdentity) { return $stored -eq $queried }
    return (Get-NormalizedAttr $stored) -eq (Get-NormalizedAttr $queried)
}

# Returns all leaf values as a flat array (empty when unset).
function Get-LeafValues($node) {
    if ($node.PSObject.Properties['values'] -and $null -ne $node.values -and $node.values.Count -gt 0) {
        return , @($node.values)   # force array
    }
    if ($node.PSObject.Properties['stringValue'] -and -not [string]::IsNullOrEmpty($node.stringValue)) {
        return , @($node.stringValue)
    }
    return , @()
}

# Enforces the leaf value invariant IN PLACE on $node.
# 1 value  → stringValue, values removed.
# 2+ values → values[], stringValue removed.
function Set-ValueInvariant($node, [string[]]$values) {
    if ($values.Count -eq 1) {
        $node | Add-Member -Force -NotePropertyName 'stringValue' -NotePropertyValue $values[0]
        $node.PSObject.Properties.Remove('values')
    } else {
        $node | Add-Member -Force -NotePropertyName 'values' -NotePropertyValue ([object[]]$values)
        $node.PSObject.Properties.Remove('stringValue')
    }
}

function New-LeafNode([string]$property, [string]$operation, [string[]]$values,
                      [string]$keyType = 'IDENTITY', [string]$sourceId = '') {
    $key = [pscustomobject]@{ type = $keyType; property = $property }
    if ($keyType -ne 'IDENTITY' -and -not [string]::IsNullOrWhiteSpace($sourceId)) {
        $key | Add-Member -NotePropertyName 'sourceId' -NotePropertyValue $sourceId
    }
    $leaf = [pscustomobject]@{ operation = $operation; key = $key }
    Set-ValueInvariant $leaf $values
    return $leaf
}

# Pretty-print a criteria tree to the console (depth-first, indented).
function Write-CriteriaTree($node, [int]$depth = 0) {
    if ($null -eq $node) {
        Write-Host ('  ' * $depth + '(no criteria)') -ForegroundColor DarkGray
        return
    }
    $pad = '  ' * $depth
    if ($node.PSObject.Properties['children'] -and $null -ne $node.children) {
        Write-Host "${pad}[$($node.operation)]" -ForegroundColor Cyan
        foreach ($child in $node.children) { Write-CriteriaTree $child ($depth + 1) }
    } else {
        $vals   = Get-LeafValues $node
        $valStr = if ($vals.Count -eq 0) { '(no value)' }
                  elseif ($vals.Count -eq 1) { $vals[0] }
                  else { '[' + ($vals -join ', ') + ']' }
        $rawProp = if ($node.PSObject.Properties['key'] -and $node.key) { $node.key.property } else { '(no key)' }
        $prop = if ($node.PSObject.Properties['key'] -and $node.key -and $node.key.type -eq 'IDENTITY') {
                    Get-NormalizedAttr $rawProp
                } else { $rawProp }
        Write-Host "${pad}$prop" -ForegroundColor Yellow -NoNewline
        Write-Host " $($node.operation) " -ForegroundColor DarkGray -NoNewline
        Write-Host $valStr -ForegroundColor White
    }
}

# Print all distinct leaf attribute names (used to help users on a missed match).
function Write-LeafAttributes($node) {
    if ($node.PSObject.Properties['key'] -and $node.key) {
        $vals = Get-LeafValues $node
        $valStr = if ($vals.Count -eq 1) { $vals[0] } else { $vals -join ', ' }
        $dispProp = if ($node.key.type -eq 'IDENTITY') { Get-NormalizedAttr $node.key.property } else { $node.key.property }
        Write-Host "      $dispProp  ($valStr)" -ForegroundColor Yellow
    }
    if ($node.PSObject.Properties['children'] -and $node.children) {
        foreach ($c in $node.children) { Write-LeafAttributes $c }
    }
}

# Returns $true when any leaf in the tree matches all non-empty filter fields.
# attribute: case-insensitive substring of key.property
# operation: exact match of leaf operation (optional)
# value:     case-insensitive substring of any leaf value (optional)
function Test-NodeMatchesFilter($node, [string]$attribute, [string]$operation, [string]$value) {
    if ($node.PSObject.Properties['children'] -and $node.children) {
        foreach ($child in $node.children) {
            if (Test-NodeMatchesFilter $child $attribute $operation $value) { return $true }
        }
        return $false
    }
    # leaf — normalize IDENTITY key property and filter attribute before substring match
    $prop = if ($node.PSObject.Properties['key'] -and $node.key) { $node.key.property } else { '' }
    $isIdentity = $node.PSObject.Properties['key'] -and $node.key -and $node.key.type -eq 'IDENTITY'
    $propNorm   = if ($isIdentity) { Get-NormalizedAttr $prop }      else { $prop }
    $attrNorm   = if ($isIdentity) { Get-NormalizedAttr $attribute }  else { $attribute }
    if ($propNorm -notlike "*$attrNorm*") { return $false }
    if (-not [string]::IsNullOrEmpty($operation) -and $node.operation -ne $operation) { return $false }
    if (-not [string]::IsNullOrEmpty($value)) {
        $vals = Get-LeafValues $node
        if (-not ($vals | Where-Object { $_ -like "*$value*" })) { return $false }
    }
    return $true
}

function Test-RoleMatchesCriteriaFilter($role, [string]$attribute, [string]$operation, [string]$value) {
    $m = $role.membership
    if ($null -eq $m -or $null -eq $m.criteria) { return $false }
    return Test-NodeMatchesFilter $m.criteria $attribute $operation $value
}

# ============================================================================
# SECTION 4 — OPERATION FUNCTIONS
# Each returns [pscustomobject]@{ status; reason; tree; patch }
# status = 'ready' | 'skipped'
# patch  = array of RFC-6902 op objects (empty when skipped)
# ============================================================================

function New-SkippedResult([string]$reason) {
    [pscustomobject]@{ status = 'skipped'; reason = $reason; tree = $null; patch = @() }
}

function Build-MembershipPatch($newTree, $membership, [bool]$hadCriteria) {
    if ($null -eq $newTree) {
        return @(@{ op = 'remove'; path = '/membership' })
    }
    $newMembership = @{
        type       = if ($membership -and $membership.type) { $membership.type } else { 'STANDARD' }
        criteria   = $newTree
        identities = if ($membership) { $membership.identities } else { $null }
    }
    $op = if ($hadCriteria) { 'replace' } else { 'add' }
    return @(@{ op = $op; path = '/membership'; value = $newMembership })
}

# --- Update ---
# Walk all leaves; replace values on every leaf where key.property == attribute
# AND current value set contains oldValue.
function Walk-UpdateValue($node, [string]$attribute, [string]$oldValue, [string[]]$newValues, [ref]$matched) {
    $isIdentity = $node.PSObject.Properties['key'] -and $node.key -and $node.key.type -eq 'IDENTITY'
    if ($node.PSObject.Properties['key'] -and $node.key -and (Compare-IdentityAttr $node.key.property $attribute $isIdentity)) {
        $vals = Get-LeafValues $node
        if ($node.stringValue -eq $oldValue -or $vals -contains $oldValue) {
            $matched.Value = $true
            Set-ValueInvariant $node $newValues
        }
    }
    if ($node.PSObject.Properties['children'] -and $node.children) {
        foreach ($child in $node.children) {
            Walk-UpdateValue $child $attribute $oldValue $newValues $matched
        }
    }
}

function Invoke-UpdateValue($membership, [string]$attribute, [string]$oldValue, [string[]]$newValues) {
    if ($null -eq $membership -or $null -eq $membership.criteria) { return New-SkippedResult 'no criteria' }
    $tree    = Copy-Deep $membership.criteria
    $matched = [ref]$false
    Walk-UpdateValue $tree $attribute $oldValue $newValues $matched
    if (-not $matched.Value) { return New-SkippedResult 'value not found' }
    [pscustomobject]@{
        status = 'ready'
        reason = $null
        tree   = $tree
        patch  = Build-MembershipPatch $tree $membership $true
    }
}

# --- Add Values ---
# Depth-first; stop at the FIRST matching leaf and append de-duplicated values.
function Walk-AddValues($node, [string]$attribute, [string[]]$newValues, [ref]$matched, [ref]$changed) {
    if ($matched.Value) { return }   # already found first leaf — stop
    $isIdentity = $node.PSObject.Properties['key'] -and $node.key -and $node.key.type -eq 'IDENTITY'
    if ($node.PSObject.Properties['key'] -and $node.key -and (Compare-IdentityAttr $node.key.property $attribute $isIdentity)) {
        $matched.Value = $true
        $current = Get-LeafValues $node
        $toAdd   = @($newValues | Where-Object { $current -notcontains $_ })
        if ($toAdd.Count -gt 0) {
            Set-ValueInvariant $node (@($current) + $toAdd)
            $changed.Value = $true
        }
        return
    }
    if ($node.PSObject.Properties['children'] -and $node.children) {
        foreach ($child in $node.children) {
            Walk-AddValues $child $attribute $newValues $matched $changed
            if ($matched.Value) { return }
        }
    }
}

function Invoke-AddValues($membership, [string]$attribute, [string[]]$addValues) {
    if ($null -eq $membership -or $null -eq $membership.criteria) { return New-SkippedResult 'no criteria' }
    $tree    = Copy-Deep $membership.criteria
    $matched = [ref]$false
    $changed = [ref]$false
    Walk-AddValues $tree $attribute $addValues $matched $changed
    if (-not $matched.Value) { return New-SkippedResult 'attribute not found' }
    if (-not $changed.Value) { return New-SkippedResult 'all values already present' }
    [pscustomobject]@{
        status = 'ready'
        reason = $null
        tree   = $tree
        patch  = Build-MembershipPatch $tree $membership $true
    }
}

# --- Add Block ---
function Invoke-AddBlock($membership, [string]$attribute, [string]$leafOp, [string[]]$values,
                         [string]$join, [string]$keyType = 'IDENTITY', [string]$sourceId = '') {
    $newLeaf    = New-LeafNode $attribute $leafOp $values $keyType $sourceId
    $hadCriteria = $null -ne $membership -and $null -ne $membership.criteria
    if (-not $hadCriteria) {
        return [pscustomobject]@{
            status = 'ready'; reason = $null; tree = $newLeaf
            patch  = Build-MembershipPatch $newLeaf $membership $false
        }
    }
    $root = Copy-Deep $membership.criteria
    if ($root.PSObject.Properties['children'] -and $root.children -and $root.operation -eq $join) {
        $root.children = @($root.children) + $newLeaf
        $tree = $root
    } else {
        $tree = [pscustomobject]@{ operation = $join; children = @($root, $newLeaf) }
    }
    [pscustomobject]@{
        status = 'ready'; reason = $null; tree = $tree
        patch  = Build-MembershipPatch $tree $membership $true
    }
}

# --- Remove ---
# Returns rebuilt node (or $null when removed entirely).
function Rebuild-Remove($node, [string]$attribute, [string]$mode, [string]$value, [ref]$changed) {
    # Target leaf
    $isIdentity = $node.PSObject.Properties['key'] -and $node.key -and $node.key.type -eq 'IDENTITY'
    if ($node.PSObject.Properties['key'] -and $node.key -and (Compare-IdentityAttr $node.key.property $attribute $isIdentity) `
        -and -not ($node.PSObject.Properties['children'] -and $node.children)) {
        if ($mode -eq 'attribute') {
            $changed.Value = $true
            return $null
        }
        # mode = 'value'
        if ($node.stringValue -eq $value) { $changed.Value = $true; return $null }
        $vals = Get-LeafValues $node
        if ($vals -contains $value) {
            $remaining = @($vals | Where-Object { $_ -ne $value })
            $changed.Value = $true
            if ($remaining.Count -eq 0) { return $null }
            Set-ValueInvariant $node $remaining
            return $node
        }
        return $node   # attribute matches but value absent — unchanged
    }
    # Composite
    if ($node.PSObject.Properties['children'] -and $node.children) {
        $kept = New-Object 'System.Collections.Generic.List[object]'
        foreach ($child in $node.children) {
            $result = Rebuild-Remove $child $attribute $mode $value $changed
            if ($null -ne $result) { $kept.Add($result) }
        }
        if ($kept.Count -eq 0) { return $null }
        if ($kept.Count -eq 1) { return $kept[0] }   # collapse single-child composite
        $node.children = $kept.ToArray()
        return $node
    }
    return $node   # unrelated leaf
}

function Invoke-RemoveCriteria($membership, [string]$attribute, [string]$mode, [string]$value = '') {
    if ($null -eq $membership -or $null -eq $membership.criteria) { return New-SkippedResult 'no criteria' }
    $tree    = Copy-Deep $membership.criteria
    $changed = [ref]$false
    $newTree = Rebuild-Remove $tree $attribute $mode $value $changed
    if (-not $changed.Value) {
        $reason = if ($mode -eq 'value') { 'value not found' } else { 'attribute not found' }
        return New-SkippedResult $reason
    }
    [pscustomobject]@{
        status = 'ready'; reason = $null; tree = $newTree
        patch  = Build-MembershipPatch $newTree $membership $true
    }
}

# --- Consolidate ---
# Only merges sibling OR leaves that share both attribute AND comparison operation.
# Mixed operators (e.g. EQUALS vs CONTAINS) are left untouched to preserve semantics.
function Rebuild-Consolidate($node, [string]$attribute, [ref]$matched) {
    # Leaf — nothing to consolidate here
    if (-not ($node.PSObject.Properties['children'] -and $node.children)) { return $node }

    # Recurse first (bottom-up)
    $processed = @()
    foreach ($child in $node.children) {
        $processed += Rebuild-Consolidate $child $attribute $matched
    }
    $node.children = $processed

    # Only collapse at OR level
    if ($node.operation -ne 'OR') { return $node }

    # Group matching leaves by their comparison operation (prefix-agnostic for IDENTITY)
    $matchingLeaves = @($node.children | Where-Object {
        $isId = $_.PSObject.Properties['key'] -and $_.key -and $_.key.type -eq 'IDENTITY'
        $_.PSObject.Properties['key'] -and $_.key -and (Compare-IdentityAttr $_.key.property $attribute $isId) `
        -and -not ($_.PSObject.Properties['children'] -and $_.children)
    })
    if ($matchingLeaves.Count -lt 2) { return $node }

    # Build per-operation groups; only merge groups with 2+ members
    $byOp = @{}
    foreach ($leaf in $matchingLeaves) {
        if (-not $byOp.ContainsKey($leaf.operation)) { $byOp[$leaf.operation] = @() }
        $byOp[$leaf.operation] = @($byOp[$leaf.operation]) + $leaf
    }
    $opsToMerge = @($byOp.Keys | Where-Object { $byOp[$_].Count -ge 2 })
    if ($opsToMerge.Count -eq 0) { return $node }

    $matched.Value = $true

    # Rebuild children: emit consolidated leaf at position of first member, drop the rest
    $emitted     = @{}
    $newChildren = @()
    foreach ($child in $node.children) {
        $isId     = $child.PSObject.Properties['key'] -and $child.key -and $child.key.type -eq 'IDENTITY'
        $isTarget = $child.PSObject.Properties['key'] -and $child.key `
                    -and (Compare-IdentityAttr $child.key.property $attribute $isId) `
                    -and -not ($child.PSObject.Properties['children'] -and $child.children) `
                    -and $opsToMerge -contains $child.operation
        if ($isTarget) {
            if (-not $emitted.ContainsKey($child.operation)) {
                $emitted[$child.operation] = $true
                # Merge all values from this op-group, deduplicating in first-seen order
                $allVals = @()
                foreach ($sibling in $byOp[$child.operation]) {
                    foreach ($v in (Get-LeafValues $sibling)) {
                        if ($allVals -notcontains $v) { $allVals += $v }
                    }
                }
                $newChildren += New-LeafNode $attribute $child.operation $allVals
            }
            # else: absorbed — skip
        } else {
            $newChildren += $child
        }
    }

    if ($newChildren.Count -eq 1) { return $newChildren[0] }   # collapse OR with single child
    $node.children = $newChildren
    return $node
}

function Invoke-Consolidate($membership, [string]$attribute) {
    if ($null -eq $membership -or $null -eq $membership.criteria) { return New-SkippedResult 'no criteria' }
    $tree    = Copy-Deep $membership.criteria
    $matched = [ref]$false
    $newTree = Rebuild-Consolidate $tree $attribute $matched
    if (-not $matched.Value) { return New-SkippedResult 'nothing to consolidate' }
    [pscustomobject]@{
        status = 'ready'; reason = $null; tree = $newTree
        patch  = Build-MembershipPatch $newTree $membership $true
    }
}

# --- Restore from snapshot ---
function Invoke-RestoreFromSnapshot($snapshotEntry, $currentMembership) {
    if ($null -eq $snapshotEntry.membership) { return New-SkippedResult 'no membership in snapshot' }
    $snapJson = $snapshotEntry.membership | ConvertTo-Json -Depth 20 -Compress
    $currJson = $currentMembership       | ConvertTo-Json -Depth 20 -Compress
    if ($snapJson -eq $currJson) { return New-SkippedResult 'already matches snapshot' }
    $hadCriteria = $null -ne $currentMembership -and $null -ne $currentMembership.criteria
    $snapMem     = $snapshotEntry.membership
    $newTree     = if ($snapMem.criteria) { Copy-Deep $snapMem.criteria } else { $null }
    [pscustomobject]@{
        status = 'ready'; reason = $null; tree = $newTree
        patch  = Build-MembershipPatch $newTree $snapMem $hadCriteria
    }
}

# ============================================================================
# SECTION 5 — ROLE FETCH
# ============================================================================

# Page through /v3/roles, accumulating up to LARGE_RESULT_THRESHOLD before
# prompting for confirmation.  Returns all matching RoleV2025 objects.
function Get-AllRolesPaged([string]$filterParam = '') {
    $all    = New-Object 'System.Collections.Generic.List[object]'
    $offset = 0
    $warnedLarge = $false

    Write-Host 'Fetching roles...' -ForegroundColor Cyan

    for ($guard = 0; $guard -lt 2000; $guard++) {
        $uri  = "$baseUrl/v3/roles?limit=$PAGE_SIZE&offset=$offset"
        if (-not [string]::IsNullOrEmpty($filterParam)) { $uri += "&filters=$filterParam" }
        $page = Invoke-ISCGet $uri
        if ($null -eq $page -or $page.Count -eq 0) { break }
        $all.AddRange([object[]]@($page))
        if (-not $warnedLarge -and $all.Count -gt $LARGE_RESULT_THRESHOLD) {
            $warnedLarge = $true
            Write-Host ''
            Write-Host "  WARNING: Over $LARGE_RESULT_THRESHOLD roles matched so far." -ForegroundColor Yellow
            Write-Host '  Continue fetching? (Y/N): ' -ForegroundColor Yellow -NoNewline
            $cont = ([Console]::ReadLine()).Trim().ToUpper()
            if ($cont -ne 'Y') {
                Write-Host '  Stopping fetch at current count.' -ForegroundColor Yellow
                break
            }
        }
        $offset += $PAGE_SIZE
        if ($page.Count -lt $PAGE_SIZE) { break }
    }

    Write-Host "Found $($all.Count) role(s)." -ForegroundColor Cyan
    return $all.ToArray()
}

# ============================================================================
# SECTION 6 — MAIN WORKFLOW
# ============================================================================

Write-Host ''
Write-Host '=================================================' -ForegroundColor Cyan
Write-Host '   ISC Role Criteria Manager' -ForegroundColor Cyan
Write-Host '=================================================' -ForegroundColor Cyan

# ──────────────────────────────────────────────────────────────────────────────
# STEP 1: TARGET
# ──────────────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host 'STEP 1 — Target' -ForegroundColor Cyan
Write-Host '  [S] Single role (exact name)'
Write-Host '  [B] Bulk (role name contains)'
Write-Host '  [C] Find by criteria  (attribute/operation/value filter across all roles)'
Write-Host '  [A] Find by access profile or entitlement'
Write-Host ''
Write-Host 'Select target mode: ' -ForegroundColor Cyan -NoNewline
$targetMode = ([Console]::ReadLine()).Trim().ToUpper()

$targetRoles = @()

switch ($targetMode) {
    'S' {
        $roleName   = Read-Host 'Exact role name'
        $escaped    = $roleName.Replace('"', '\"')
        $filterStr  = [uri]::EscapeDataString("name eq `"$escaped`"")
        $targetRoles = Get-AllRolesPaged $filterStr
        if ($targetRoles.Count -gt 1) {
            Write-Host "  SAFETY: $($targetRoles.Count) roles returned for exact match — using only the first." -ForegroundColor Yellow
            $targetRoles = @($targetRoles[0])
        }
    }
    'B' {
        $partial    = Read-Host 'Name contains'
        $escaped    = $partial.Replace('"', '\"')
        $filterStr  = [uri]::EscapeDataString("name co `"$escaped`"")
        $targetRoles = Get-AllRolesPaged $filterStr
    }
    'C' {
        $attrInput = Read-Host 'Attribute to filter by (e.g. attribute.cloudLifecycleState)'
        Write-Host 'Operation filter (EQUALS/NOT_EQUALS/CONTAINS/STARTS_WITH/ENDS_WITH) — leave blank for Any: ' -NoNewline
        $opInput   = ([Console]::ReadLine()).Trim().ToUpper()
        if ($opInput -notin @('EQUALS','NOT_EQUALS','CONTAINS','STARTS_WITH','ENDS_WITH')) { $opInput = '' }
        $valInput  = Read-Host 'Value filter (substring match) — leave blank for Any'
        $allRoles  = Get-AllRolesPaged
        $targetRoles = @($allRoles | Where-Object { Test-RoleMatchesCriteriaFilter $_ $attrInput $opInput $valInput })
        Write-Host "$($targetRoles.Count) role(s) matched the criteria filter." -ForegroundColor Cyan
    }
    'A' {
        Write-Host '  [1] Access Profile'
        Write-Host '  [2] Entitlement'
        Write-Host 'Type: ' -NoNewline
        $accessType = ([Console]::ReadLine()).Trim()
        $nameInput  = Read-Host 'Name contains'
        $nameLower  = $nameInput.ToLower()
        $allRoles   = Get-AllRolesPaged
        if ($accessType -eq '2') {
            $targetRoles = @($allRoles | Where-Object {
                $_.PSObject.Properties['entitlements'] -and $_.entitlements |
                    Where-Object { ([string]$_.name).ToLower() -like "*$nameLower*" }
            })
            Write-Host "$($targetRoles.Count) role(s) contain a matching entitlement." -ForegroundColor Cyan
        } else {
            $targetRoles = @($allRoles | Where-Object {
                $_.PSObject.Properties['accessProfiles'] -and $_.accessProfiles |
                    Where-Object { ([string]$_.name).ToLower() -like "*$nameLower*" }
            })
            Write-Host "$($targetRoles.Count) role(s) contain a matching access profile." -ForegroundColor Cyan
        }
    }
    default {
        Write-Host 'Invalid target mode. Exiting.' -ForegroundColor Red
        exit 1
    }
}

if ($targetRoles.Count -eq 0) {
    Write-Host 'No roles found. Exiting.' -ForegroundColor Yellow
    exit 0
}

Write-Host ''
Write-Host "Roles selected ($($targetRoles.Count)):" -ForegroundColor Cyan
$targetRoles | ForEach-Object { Write-Host "  $($_.name)  [$($_.id)]" -ForegroundColor White }

# ──────────────────────────────────────────────────────────────────────────────
# STEP 2: OPERATION
# ──────────────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host 'STEP 2 — Operation' -ForegroundColor Cyan
Write-Host '  [U] Update    — replace old value with new value(s)'
Write-Host '  [V] Add Values— append value(s) to first matching leaf'
Write-Host '  [A] Add Block — insert a new criteria leaf (AND/OR join)'
Write-Host '  [R] Remove    — remove a value or entire attribute'
Write-Host '  [C] Consolidate — merge sibling OR leaves (same attribute + operator)'
Write-Host '  [X] Restore   — revert to a saved snapshot'
Write-Host ''
Write-Host 'Select operation: ' -ForegroundColor Cyan -NoNewline
$opChoice = ([Console]::ReadLine()).Trim().ToUpper()

# Operation-specific parameter collection
switch ($opChoice) {
    'U' {
        $rawAttr  = Read-Host 'Attribute (e.g. cloudLifecycleState → will be prefixed with attribute.)'
        $attribute = if ($rawAttr -like 'attribute.*') { $rawAttr } else { "attribute.$rawAttr" }
        Write-Host '  Enter ONE value to match (to add values use [V]; to drop a value use [R]).' -ForegroundColor Yellow
        $oldValue  = Read-Host 'Old value to match'
        $newRaw    = Read-Host 'New value(s), comma-separated'
        $newValues = @($newRaw -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }
    'V' {
        $rawAttr  = Read-Host 'Attribute (e.g. cloudLifecycleState)'
        $attribute = if ($rawAttr -like 'attribute.*') { $rawAttr } else { "attribute.$rawAttr" }
        $addRaw    = Read-Host 'Values to add, comma-separated'
        $addValues = @($addRaw -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }
    'A' {
        Write-Host 'Key type: [1] IDENTITY (default)  [2] ACCOUNT  [3] ENTITLEMENT'
        Write-Host 'Choice: ' -NoNewline
        $keyTypeNum = ([Console]::ReadLine()).Trim()
        $keyTypeMap = @{ '1'='IDENTITY'; '2'='ACCOUNT'; '3'='ENTITLEMENT' }
        $keyType    = if ($keyTypeMap.ContainsKey($keyTypeNum)) { $keyTypeMap[$keyTypeNum] } else { 'IDENTITY' }
        $sourceId   = ''
        if ($keyType -ne 'IDENTITY') {
            $sourceId = Read-Host "Source ID (required for $keyType — find it in ISC under Connections → Sources)"
            if ([string]::IsNullOrWhiteSpace($sourceId)) {
                Write-Host "Source ID is required for key type $keyType. Exiting." -ForegroundColor Red; exit 1
            }
        }
        $rawAttr  = Read-Host 'Attribute for new leaf (e.g. cloudLifecycleState)'
        $attribute = if ($rawAttr -like 'attribute.*') { $rawAttr } else { "attribute.$rawAttr" }
        Write-Host 'Leaf operation:'
        Write-Host '  [1] EQUALS  [2] NOT_EQUALS  [3] CONTAINS  [4] STARTS_WITH  [5] ENDS_WITH'
        Write-Host 'Choice: ' -NoNewline
        $leafOpNum = ([Console]::ReadLine()).Trim()
        $leafOpMap = @{ '1'='EQUALS'; '2'='NOT_EQUALS'; '3'='CONTAINS'; '4'='STARTS_WITH'; '5'='ENDS_WITH' }
        if (-not $leafOpMap.ContainsKey($leafOpNum)) { Write-Host 'Invalid. Exiting.' -ForegroundColor Red; exit 1 }
        $leafOp    = $leafOpMap[$leafOpNum]
        $valsRaw   = Read-Host 'Value(s), comma-separated'
        $newValues = @($valsRaw -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        Write-Host 'Join with existing criteria: [1] AND  [2] OR'
        Write-Host 'Choice: ' -NoNewline
        $joinNum   = ([Console]::ReadLine()).Trim()
        $joinOp    = if ($joinNum -eq '2') { 'OR' } else { 'AND' }
    }
    'R' {
        $rawAttr  = Read-Host 'Attribute'
        $attribute = if ($rawAttr -like 'attribute.*') { $rawAttr } else { "attribute.$rawAttr" }
        Write-Host '  [1] Remove a specific value   [2] Remove entire attribute'
        Write-Host 'Choice: ' -NoNewline
        $removeChoice = ([Console]::ReadLine()).Trim()
        if ($removeChoice -notin @('1','2')) { Write-Host 'Invalid. Exiting.' -ForegroundColor Red; exit 1 }
        $removeMode  = if ($removeChoice -eq '2') { 'attribute' } else { 'value' }
        $removeValue = ''
        if ($removeChoice -eq '1') { $removeValue = Read-Host 'Value to remove' }
    }
    'C' {
        $rawAttr  = Read-Host 'Attribute to consolidate'
        $attribute = if ($rawAttr -like 'attribute.*') { $rawAttr } else { "attribute.$rawAttr" }
        Write-Host "  Sibling OR leaves for '$attribute' sharing the same comparison operator will be merged." -ForegroundColor Yellow
        Write-Host '  Leaves with different operators are left untouched.' -ForegroundColor Yellow
    }
    'X' {
        Write-Host 'Path to snapshot JSON file: ' -NoNewline
        $snapPath = ([Console]::ReadLine()).Trim()
        if (-not (Test-Path $snapPath)) {
            Write-Host "Snapshot file not found: $snapPath" -ForegroundColor Red; exit 1
        }
        $snapshotData = Get-Content $snapPath -Raw | ConvertFrom-Json
        Write-Host "Loaded snapshot with $($snapshotData.Count) role(s)." -ForegroundColor Cyan
    }
    default {
        Write-Host 'Invalid operation. Exiting.' -ForegroundColor Red
        exit 1
    }
}

# ──────────────────────────────────────────────────────────────────────────────
# STEP 3: PREVIEW
# Compute the result for every selected role and display before/after.
# No API writes happen here.
# ──────────────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host 'STEP 3 — Preview' -ForegroundColor Cyan
Write-Host 'Computing changes...' -ForegroundColor DarkGray

# Fetch full role details for each selected role (criteria may not be in list payload)
$roleDetails = @{}
foreach ($role in $targetRoles) {
    try {
        $rd = Invoke-ISCGet "$baseUrl/v3/roles/$($role.id)"
        $roleDetails[$role.id] = $rd
    } catch {
        Write-Host "  Warning: could not fetch details for '$($role.name)': $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Apply operation in-memory and collect previews
$previews = New-Object 'System.Collections.Generic.List[object]'

foreach ($role in $targetRoles) {
    $rd = $roleDetails[$role.id]
    if ($null -eq $rd) {
        $previews.Add([pscustomobject]@{ role = $role; result = New-SkippedResult 'could not fetch role details' })
        continue
    }
    $mem = $rd.membership

    $result = switch ($opChoice) {
        'U' { Invoke-UpdateValue     $mem $attribute $oldValue $newValues }
        'V' { Invoke-AddValues       $mem $attribute $addValues }
        'A' { Invoke-AddBlock        $mem $attribute $leafOp $newValues $joinOp $keyType $sourceId }
        'R' { Invoke-RemoveCriteria  $mem $attribute $removeMode $removeValue }
        'C' { Invoke-Consolidate     $mem $attribute }
        'X' {
            $snap = $snapshotData | Where-Object { $_.id -eq $role.id } | Select-Object -First 1
            if ($null -eq $snap) { New-SkippedResult 'role not in snapshot' }
            else { Invoke-RestoreFromSnapshot $snap $mem }
        }
    }
    $previews.Add([pscustomobject]@{ role = $rd; result = $result })
}

# Display before/after for each role
$readyCount   = 0
$skippedCount = 0

foreach ($preview in $previews) {
    $role   = $preview.role
    $result = $preview.result

    Write-Host ''
    Write-Host "  Role: $($role.name)" -ForegroundColor White
    if ($result.status -eq 'skipped') {
        $skippedCount++
        Write-Host "    Status : SKIP — $($result.reason)" -ForegroundColor DarkYellow
    } else {
        $readyCount++
        Write-Host '    Status : WILL CHANGE' -ForegroundColor Green
        Write-Host '    Before:' -ForegroundColor DarkGray
        $beforeCriteria = if ($role.membership) { $role.membership.criteria } else { $null }
        Write-CriteriaTree $beforeCriteria 3
        Write-Host '    After:' -ForegroundColor DarkGray
        Write-CriteriaTree $result.tree 3
    }
}

Write-Host ''
Write-Host "Preview summary: $readyCount role(s) will change, $skippedCount will be skipped." -ForegroundColor Cyan

if ($readyCount -eq 0) {
    Write-Host 'Nothing to apply. Exiting.' -ForegroundColor Yellow
    exit 0
}

# ──────────────────────────────────────────────────────────────────────────────
# STEP 4: SNAPSHOT + APPLY
# ──────────────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host 'STEP 4 — Apply' -ForegroundColor Cyan

if (-not $PSCmdlet.ShouldProcess("$readyCount role(s)", "PATCH membership criteria")) {
    Write-Host '[WhatIf] No changes written.' -ForegroundColor DarkCyan
    foreach ($preview in $previews | Where-Object { $_.result.status -eq 'ready' }) {
        $patchBody = ConvertTo-Json -InputObject $preview.result.patch -Depth 20 -Compress
        Write-Host "  [WhatIf] $($preview.role.name) — patch: $patchBody" -ForegroundColor DarkCyan
    }
    exit 0
}

Write-Host 'Proceed with applying changes? (Y/N): ' -ForegroundColor Yellow -NoNewline
$confirm = ([Console]::ReadLine()).Trim().ToUpper()
if ($confirm -ne 'Y') {
    Write-Host 'Cancelled.' -ForegroundColor Yellow
    exit 0
}

# Save pre-run snapshot
$snapshotFile = "role-criteria-snapshot-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
Write-Host "Saving pre-run snapshot → $snapshotFile" -ForegroundColor Cyan
$snapshotOut = @($targetRoles | ForEach-Object {
    $rd = $roleDetails[$_.id]
    [pscustomobject]@{
        id         = $_.id
        name       = $_.name
        membership = if ($rd) { $rd.membership } else { $null }
    }
})
$snapshotOut | ConvertTo-Json -Depth 20 | Out-File -FilePath $snapshotFile -Encoding UTF8
Write-Host "Snapshot saved: $snapshotFile" -ForegroundColor Green

# Apply patches
$results = New-Object 'System.Collections.Generic.List[object]'

foreach ($preview in $previews) {
    $role   = $preview.role
    $result = $preview.result

    if ($result.status -eq 'skipped') {
        Write-Host "  SKIP  $($role.name) — $($result.reason)" -ForegroundColor DarkYellow
        $results.Add([pscustomobject]@{ Role = $role.name; Status = "Skipped ($($result.reason))" })
        continue
    }

    $patchBody = '[' + (($result.patch | ForEach-Object {
        $_ | ConvertTo-Json -Depth 20 -Compress
    }) -join ',') + ']'

    try {
        Invoke-ISCPatch "$baseUrl/v3/roles/$($role.id)" $patchBody | Out-Null
        Write-Host "  OK    $($role.name)" -ForegroundColor Green
        $results.Add([pscustomobject]@{ Role = $role.name; Status = 'Updated' })
    } catch {
        $errMsg = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            try {
                $ed     = $_.ErrorDetails.Message | ConvertFrom-Json
                $errMsg = if ($ed.messages -and $ed.messages.Count -gt 0) { $ed.messages[0].text } else { $_.ErrorDetails.Message }
            } catch { }
        }
        Write-Host "  ERR   $($role.name) — $errMsg" -ForegroundColor Red
        $results.Add([pscustomobject]@{ Role = $role.name; Status = "Error: $errMsg" })
    }
}

# ──────────────────────────────────────────────────────────────────────────────
# STEP 5: RESULTS SUMMARY
# ──────────────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '=================================================' -ForegroundColor Cyan
Write-Host 'Results' -ForegroundColor Cyan
$results | Format-Table -AutoSize
Write-Host "Pre-run snapshot: $snapshotFile" -ForegroundColor DarkGray
Write-Host '=================================================' -ForegroundColor Cyan
