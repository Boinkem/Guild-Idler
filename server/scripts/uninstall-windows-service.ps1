<#
  Stops and removes the Guildbound AH Windows Service installed by
  install-windows-service.ps1. Manual step, run from an elevated
  PowerShell prompt.

  Usage:
    cd server\scripts
    .\uninstall-windows-service.ps1 -NssmPath "C:\tools\nssm\nssm.exe"
#>

param(
    [string]$NssmPath = "nssm.exe",
    [string]$ServiceName = "GuildboundAH"
)

& $NssmPath stop $ServiceName
& $NssmPath remove $ServiceName confirm
