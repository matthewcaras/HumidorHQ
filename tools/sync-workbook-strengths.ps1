# Filename: sync-workbook-strengths.ps1
# Revision : 1.2.0
# Description : Syncs cigar strength values into the selected runtime catalog JSON.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-16
# Modified Date : 2026-07-19
# Changelog :
# 1.2.0 default to repository data while retaining DataRoot and environment overrides
# 1.1.0 require an external DataRoot or HUMIDORHQ_DATA_ROOT instead of repository data
# 1.0.0 initial release

param(
    [string]$WorkbookPath = 'C:\Users\mcaras\OneDrive\Documents\HumidorHQ_Rich_Import_Workbook.xlsx',
    [string]$DataRoot
)

$ErrorActionPreference = 'Stop'

function Convert-ToTrimmedString {
    param([object]$Value)
    return ([string]$Value).Trim()
}

function Open-ZipEntryXml {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$EntryPath
    )

    $entry = $Archive.Entries | Where-Object { $_.FullName -eq $EntryPath } | Select-Object -First 1
    if (-not $entry) {
        throw "Workbook entry not found: $EntryPath"
    }

    $stream = $entry.Open()
    try {
        $reader = New-Object System.IO.StreamReader($stream)
        try {
            return [xml]$reader.ReadToEnd()
        } finally {
            $reader.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

function Get-CellValue {
    param(
        [System.Xml.XmlElement]$Cell,
        [string[]]$SharedStrings
    )

    if (-not $Cell) {
        return ''
    }

    $type = $Cell.GetAttribute('t')
    if ($type -eq 'inlineStr') {
        return Convert-ToTrimmedString ($Cell.is.t.'#text')
    }

    $rawValue = Convert-ToTrimmedString $Cell.v
    if ($rawValue -eq '') {
        return ''
    }

    if ($type -eq 's') {
        $sharedIndex = [int]$rawValue
        if ($sharedIndex -ge 0 -and $sharedIndex -lt $SharedStrings.Count) {
            return Convert-ToTrimmedString $SharedStrings[$sharedIndex]
        }
    }

    return $rawValue
}

function Get-SharedStrings {
    param([System.IO.Compression.ZipArchive]$Archive)

    $entry = $Archive.Entries | Where-Object { $_.FullName -eq 'xl/sharedStrings.xml' } | Select-Object -First 1
    if (-not $entry) {
        return @()
    }

    $xml = Open-ZipEntryXml -Archive $Archive -EntryPath 'xl/sharedStrings.xml'
    $strings = @()
    foreach ($node in $xml.sst.si) {
        if ($node.t) {
            $strings += [string]$node.t
            continue
        }
        $runs = @($node.r | ForEach-Object { [string]$_.t })
        $strings += ($runs -join '')
    }
    return $strings
}

function Get-CatalogWorksheetPath {
    param([System.IO.Compression.ZipArchive]$Archive)

    $workbookXml = Open-ZipEntryXml -Archive $Archive -EntryPath 'xl/workbook.xml'
    $relationshipsXml = Open-ZipEntryXml -Archive $Archive -EntryPath 'xl/_rels/workbook.xml.rels'
    $catalogSheet = $workbookXml.workbook.sheets.sheet | Where-Object { $_.name -eq 'Catalog' } | Select-Object -First 1
    if (-not $catalogSheet) {
        throw 'Catalog sheet was not found in the workbook.'
    }

    $relationshipId = $catalogSheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $relationship = $relationshipsXml.Relationships.Relationship | Where-Object { $_.Id -eq $relationshipId } | Select-Object -First 1
    if (-not $relationship) {
        throw "Workbook relationship was not found for sheet id $relationshipId."
    }

    return 'xl/' + $relationship.Target
}

function Read-CatalogStrengthRows {
    param([string]$WorkbookPath)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $fileStream = [System.IO.File]::Open($WorkbookPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Read, $false)
        try {
            $sharedStrings = Get-SharedStrings -Archive $archive
            $sheetPath = Get-CatalogWorksheetPath -Archive $archive
            $sheetXml = Open-ZipEntryXml -Archive $archive -EntryPath $sheetPath
            $rows = @($sheetXml.worksheet.sheetData.row)
            if ($rows.Count -lt 4) {
                return @()
            }

            $headerCells = @($rows | Where-Object { [int]$_.r -eq 3 } | Select-Object -First 1).c
            $headers = @{}
            foreach ($cell in $headerCells) {
                $reference = [string]$cell.r
                $column = ($reference -replace '\d', '')
                $headers[$column] = Get-CellValue -Cell $cell -SharedStrings $sharedStrings
            }

            $records = @()
            foreach ($row in ($rows | Where-Object { [int]$_.r -gt 3 })) {
                $record = [ordered]@{}
                $hasData = $false
                foreach ($cell in @($row.c)) {
                    $reference = [string]$cell.r
                    $column = ($reference -replace '\d', '')
                    $header = Convert-ToTrimmedString $headers[$column]
                    if ($header -eq '') {
                        continue
                    }
                    $value = Get-CellValue -Cell $cell -SharedStrings $sharedStrings
                    if ($value -ne '') {
                        $hasData = $true
                    }
                    $record[$header] = $value
                }
                if ($hasData) {
                    $records += [pscustomobject]$record
                }
            }
            return $records
        } finally {
            $archive.Dispose()
        }
    } finally {
        $fileStream.Dispose()
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$configuredDataRoot = if (-not [string]::IsNullOrWhiteSpace($DataRoot)) {
    $DataRoot
} elseif (-not [string]::IsNullOrWhiteSpace($env:HUMIDORHQ_DATA_ROOT)) {
    $env:HUMIDORHQ_DATA_ROOT
} else {
    Join-Path $repoRoot 'data'
}
$resolvedDataRoot = [System.IO.Path]::GetFullPath($configuredDataRoot)
$catalogPath = Join-Path $resolvedDataRoot 'catalog-cigars.json'
if (-not (Test-Path -LiteralPath $WorkbookPath)) {
    throw "Workbook not found: $WorkbookPath"
}
if (-not (Test-Path -LiteralPath $catalogPath)) {
    throw "Catalog JSON not found: $catalogPath"
}

$catalogRows = Read-CatalogStrengthRows -WorkbookPath $WorkbookPath
$strengthByKey = @{}
foreach ($row in $catalogRows) {
    $manufacturer = Convert-ToTrimmedString $row.Manufacturer
    $series = Convert-ToTrimmedString $row.Series
    $vitola = Convert-ToTrimmedString $row.Vitola
    if ($manufacturer -eq '' -and $series -eq '' -and $vitola -eq '') {
        continue
    }

    $strength = Convert-ToTrimmedString $(if ($row.PSObject.Properties.Name -contains 'Stength') { $row.Stength } else { $row.Strength })
    if ($strength -eq '') {
        $strength = 'Medium'
    }
    $key = (@($manufacturer, $series, $vitola) -join '|').ToLowerInvariant()
    $strengthByKey[$key] = $strength
}

$catalog = Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json
$updated = 0
foreach ($cigar in $catalog) {
    $key = @(
        (Convert-ToTrimmedString $cigar.manufacturer),
        (Convert-ToTrimmedString $cigar.series),
        (Convert-ToTrimmedString $cigar.vitola)
    ) -join '|'
    $lookupKey = $key.ToLowerInvariant()
    if ($strengthByKey.ContainsKey($lookupKey)) {
        $cigar.strength = $strengthByKey[$lookupKey]
        $updated++
    } elseif (-not $cigar.strength) {
        $cigar.strength = 'Medium'
    }
}

$json = $catalog | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($catalogPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Write-Host "Updated $updated catalog cigars with workbook strength values." -ForegroundColor Green
