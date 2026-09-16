<#
  Installs the Guildbound AH backend as a Windows Service using NSSM
  (https://nssm.cc/ -- download nssm.exe separately, it's not vendored
  here).

  This is a MANUAL step. Nothing in `npm install`, `npm run build`, or
  anywhere else in this repo calls this script automatically. Run it
  yourself, from an elevated PowerShell prompt, once:

    - Postgres is installed and reachable on this machine
    - the AH subdomain + DDNS + TLS are actually confirmed working
    - server/.env exists (copy server/.env.example) -- AH_ENABLED can
      stay "false" for this step; the service is safe to install and
      even run in its off state, see src/index.ts

  Usage:
    cd server\scripts
    .\install-windows-service.ps1 -NssmPath "C:\tools\nssm\nssm.exe"

  Deliberately does NOT start the service after installing it -- see the
  final Write-Host below. Starting it is a separate, conscious step once
  you're actually ready, same "off until you mean it" spirit as
  AH_ENABLED itself.
#>

param(
    [string]$NssmPath = "nssm.exe",
    [string]$ServiceName = "GuildboundAH",
    [string]$NodePath = (Get-Command node).Source,
    [string]$AppEntry = (Resolve-Path "$PSScriptRoot\..\dist\index.js")
)

$ServerRoot = Resolve-Path "$PSScriptRoot\.."

& $NssmPath install $ServiceName $NodePath $AppEntry
& $NssmPath set $ServiceName AppDirectory $ServerRoot
& $NssmPath set $ServiceName AppStdout (Join-Path $ServerRoot "service.out.log")
& $NssmPath set $ServiceName AppStderr (Join-Path $ServerRoot "service.err.log")
& $NssmPath set $ServiceName Start SERVICE_AUTO_START

Write-Host ""
Write-Host "Service '$ServiceName' installed but NOT started."
Write-Host "Review server\.env (AH_ENABLED should stay 'false' until DNS/Postgres are confirmed end to end), then start with:"
Write-Host "    $NssmPath start $ServiceName"
