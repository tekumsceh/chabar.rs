# Creates ioorganize-deploy.zip for SFTP upload to Hostinger VPS.
# Run from project root in PowerShell:
#   .\scripts\make-deploy-zip.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$zipPath = Join-Path $root "ioorganize-deploy.zip"

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

$excludeDirs = @(
  "node_modules",
  ".git",
  "dist",
  "agent-tools",
  "agent-transcripts"
)
$excludeFiles = @(
  ".env",
  ".env.deploy",
  "ioorganize-deploy.zip"
)

$temp = Join-Path $env:TEMP ("ioorganize-deploy-" + [guid]::NewGuid().ToString("N"))
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
