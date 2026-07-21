# One-command deploy to Hostinger VPS.
# Prerequisites (one-time):
#   1. SSH key:  ssh-keygen -t ed25519 -C "chabar-hostinger"
#   2. Add id_ed25519.pub in Hostinger / authorized_keys
#   3. Optional ~/.ssh/config Host alias, e.g.:
#        Host chabar
#          HostName chabar.rs
#          User root
#          IdentityFile ~/.ssh/id_ed25519
#   4. Copy .env.deploy.example -> .env.deploy and set DEPLOY_HOST
#
# Usage (from project root):
#   npm run deploy
#   or:  .\scripts\deploy.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$configPath = Join-Path $root ".env.deploy"
if (-not (Test-Path $configPath)) {
  Write-Error "Missing .env.deploy. Copy .env.deploy.example to .env.deploy and set DEPLOY_HOST."
}

$deployHost = $null
$deployPath = "/var/www/ioorganize"
$deployUser = $null

Get-Content $configPath | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $parts = $line -split "=", 2
  if ($parts.Count -ne 2) { return }
  $key = $parts[0].Trim()
  $value = $parts[1].Trim().Trim('"').Trim("'")
  switch ($key) {
    "DEPLOY_HOST" { $deployHost = $value }
    "DEPLOY_PATH" { $deployPath = $value }
    "DEPLOY_USER" { $deployUser = $value }
  }
}

if (-not $deployHost) {
  Write-Error "DEPLOY_HOST is empty in .env.deploy"
}

$sshTarget = if ($deployUser) { "$deployUser@$deployHost" } else { $deployHost }

Write-Host "==> Building deploy zip..."
& (Join-Path $root "scripts\make-deploy-zip.ps1")
$zipPath = Join-Path $root "chabar-deploy.zip"
if (-not (Test-Path $zipPath)) {
  Write-Error "Zip was not created: $zipPath"
}

Write-Host "==> Uploading to ${sshTarget}:${deployPath}/ ..."
scp $zipPath "${sshTarget}:${deployPath}/chabar-deploy.zip"
if ($LASTEXITCODE -ne 0) {
  Write-Error "scp failed (exit $LASTEXITCODE). Check SSH key / DEPLOY_HOST."
}

Write-Host "==> Unzip + reload on VPS..."
$remote = @"
set -eu
cd '$deployPath'
unzip -o chabar-deploy.zip
bash scripts/vps-reload.sh
"@
$remote = $remote -replace "`r`n", "`n" -replace "`r", "`n"
ssh $sshTarget $remote
if ($LASTEXITCODE -ne 0) {
  Write-Error "Remote reload failed (exit $LASTEXITCODE)."
}

Write-Host ""
Write-Host "Deploy finished. Check https://chabar.rs in an incognito window."
