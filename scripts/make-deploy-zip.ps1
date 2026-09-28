# Creates chabar-deploy.zip for SFTP upload to Hostinger VPS.
# Run from project root in PowerShell:
#   .\scripts\make-deploy-zip.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$zipPath = Join-Path $root "chabar-deploy.zip"

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

$excludeDirs = @(
  "node_modules",
  ".git",
  "dist",
  "dev-dist",
  "docs",
  "logs",
  "alt",
  "agent-tools",
  "agent-transcripts",
  ".cursor"
)
$excludeFiles = @(
  ".env",
  ".env.deploy",
  ".env.example",
  "chabar-deploy.zip",
  "ioorganize-deploy.zip",
  "UI_TEXTS.md",
  "AUTH-SETUP.txt",
  "HOSTINGER-DEPLOY.txt"
)

$temp = Join-Path $env:TEMP ("chabar-deploy-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temp | Out-Null

try {
  Get-ChildItem -Path $root -Force | ForEach-Object {
    $name = $_.Name
    if ($excludeDirs -contains $name) { return }
    if ($excludeFiles -contains $name) { return }
    Copy-Item -Path $_.FullName -Destination (Join-Path $temp $name) -Recurse -Force
  }

  # Local-only UI lab — never ship to VPS
  $studioPath = Join-Path $temp "src\studio"
  if (Test-Path $studioPath) {
    Remove-Item $studioPath -Recurse -Force
  }

  # Dev/copy tooling — not needed on the VPS runtime
  $uiTextsIndex = Join-Path $temp "scripts\_ui-texts-index.json"
  if (Test-Path $uiTextsIndex) { Remove-Item $uiTextsIndex -Force }
  $buildUiTexts = Join-Path $temp "scripts\build-ui-texts.js"
  if (Test-Path $buildUiTexts) { Remove-Item $buildUiTexts -Force }

  # Local-only: ledger dumps, spent mutations, one-shot debug/compare/fix scripts
  $scriptsTemp = Join-Path $temp "scripts"
  if (Test-Path $scriptsTemp) {
    $onceDir = Join-Path $scriptsTemp "once"
    if (Test-Path $onceDir) { Remove-Item $onceDir -Recurse -Force }
    Get-ChildItem -Path $scriptsTemp -File -Filter "*.csv" -ErrorAction SilentlyContinue |
      Remove-Item -Force
    $spentNames = @(
      "reattach-personal-to-saint-louis.js",
      "fix-dobrakovo-expense.js",
      "convert-isplata-to-expenses.js",
      "convert-prevoz-to-expenses.js"
    )
    foreach ($n in $spentNames) {
      $p = Join-Path $scriptsTemp $n
      if (Test-Path $p) { Remove-Item $p -Force }
    }
    Get-ChildItem -Path $scriptsTemp -File -ErrorAction SilentlyContinue | Where-Object {
      $_.Name -match '^(fix-|debug-|compare-|patch-|inspect-|held-diff-|simulate-|query-audit-|audit-claim-|audit-spreadsheet-)'
    } | Remove-Item -Force
  }

  Compress-Archive -Path (Join-Path $temp "*") -DestinationPath $zipPath -Force

  # Bash scripts must be LF on Linux (Windows CRLF breaks `set -eu`)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::Open($zipPath, "Update")
  try {
    $entries = @($zip.Entries | Where-Object { $_.FullName -like "*.sh" })
    foreach ($entry in $entries) {
      $reader = New-Object System.IO.StreamReader($entry.Open())
      $text = $reader.ReadToEnd()
      $reader.Close()
      $entry.Delete()
      $newEntry = $zip.CreateEntry($entry.FullName)
      $bytes = [System.Text.Encoding]::UTF8.GetBytes(($text -replace "`r`n", "`n" -replace "`r", "`n"))
      $stream = $newEntry.Open()
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Close()
    }
  }
  finally {
    $zip.Dispose()
  }

  Write-Host "Created: $zipPath"
  Write-Host "Upload this zip to the VPS, then unzip into /var/www/ioorganize"
}
finally {
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
