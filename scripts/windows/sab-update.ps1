<#
  SAB – auto-updater for Windows.

  Install (once) – paste this into PowerShell and press Enter:
      irm https://github.com/ZSWolt/SAB/releases/download/latest/sab-update.ps1 | iex

  It downloads the latest build from GitHub Releases into %LOCALAPPDATA%\SAB\extension (the folder you
  load in chrome://extensions) and registers a scheduled task that runs this script again at logon and
  every 3 hours. When the files change, the extension notices and reloads itself. No admin rights.

  Pasted commands are not blocked by Smart App Control (it blocks downloaded .bat files), and the script
  only uses what PowerShell's Constrained Language Mode allows, so it also works when Smart App Control
  is on.

  Uninstall the automatic updates:
      Unregister-ScheduledTask -TaskName 'SAB Extension Updater' -Confirm:$false
#>

$ErrorActionPreference = 'Stop'
$Repo     = 'ZSWolt/SAB'
$Release  = "https://github.com/$Repo/releases/download/latest"
$Base     = Join-Path $env:LOCALAPPDATA 'SAB'
$Ext      = Join-Path $Base 'extension'
$Self     = Join-Path $Base 'sab-update.ps1'
$Log      = Join-Path $Base 'update.log'
$TaskName = 'SAB Extension Updater'

# Run from the installed copy (scheduled task) = just update. Pasted / anything else = install.
$Install = -not ($PSCommandPath -and ($PSCommandPath -eq $Self))

New-Item -ItemType Directory -Force -Path $Base | Out-Null

function Write-Log([string]$msg) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $msg
  Add-Content -Path $Log -Value $line -Encoding UTF8
  Write-Host $msg
  $lines = @(Get-Content $Log -ErrorAction SilentlyContinue)
  if ($lines.Count -gt 300) { $lines | Select-Object -Last 200 | Set-Content $Log -Encoding UTF8 }
}

function Update-Extension([bool]$force) {
  $remote = Invoke-RestMethod -Uri "$Release/build.json" -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-cache' }
  $localFile = Join-Path $Ext 'build.json'
  $local = ''
  if (Test-Path $localFile) { $local = (Get-Content $localFile -Raw | ConvertFrom-Json).version }
  if ((-not $force) -and ($local -eq $remote.version)) { Write-Log "Up to date (version $local)"; return }

  $tmp   = Join-Path $env:TEMP ('sab-' + (Get-Random) + '.zip')
  $stage = Join-Path $Base 'staging'
  Invoke-WebRequest -Uri "$Release/sab-extension.zip" -OutFile $tmp -UseBasicParsing
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  Expand-Archive -Path $tmp -DestinationPath $stage -Force
  if (-not (Test-Path (Join-Path $stage 'manifest.json'))) { throw 'The downloaded file is not a valid extension' }

  # Replace the contents but keep the folder itself: Chrome remembers this path.
  New-Item -ItemType Directory -Force -Path $Ext | Out-Null
  Get-ChildItem $Ext -Force | Remove-Item -Recurse -Force
  Copy-Item (Join-Path $stage '*') $Ext -Recurse -Force
  Remove-Item $stage -Recurse -Force
  Remove-Item $tmp -Force
  Write-Log "Updated: '$local' -> '$($remote.version)'"
}

try {
  Update-Extension $Install
} catch {
  Write-Log ('Update failed: ' + $_.Exception.Message)
  if ($Install) { Write-Host 'Check your internet connection and try again.' -ForegroundColor Red }
  return
}

if ($Install) {
  # A copy of this script for the scheduled task.
  Invoke-WebRequest -Uri "$Release/sab-update.ps1" -OutFile $Self -UseBasicParsing

  $arg      = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $Self + '"'
  $action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  $every3h  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10) -RepetitionInterval (New-TimeSpan -Hours 3) -RepetitionDuration (New-TimeSpan -Days 3650)
  try {
    $logon = New-ScheduledTaskTrigger -AtLogOn -User ($env:USERDOMAIN + '\' + $env:USERNAME)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($logon, $every3h) -Settings $settings -Force | Out-Null
  } catch {
    # Logon triggers can need admin rights on some PCs; every 3 hours is enough.
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $every3h -Settings $settings -Force | Out-Null
  }

  try { Set-Clipboard -Value $Ext } catch {}
  Write-Host ''
  Write-Host '================ Done! ================' -ForegroundColor Green
  Write-Host 'The extension was downloaded to:'
  Write-Host "   $Ext" -ForegroundColor Yellow
  Write-Host '(the path is copied - paste it with Ctrl+V)'
  Write-Host ''
  Write-Host 'One time only, in Chrome:'
  Write-Host '  1. Go to chrome://extensions and turn on "Developer mode"'
  Write-Host '  2. If you have an older SAB loaded - click Remove on it'
  Write-Host '  3. Click "Load unpacked" and choose the folder above'
  Write-Host ''
  Write-Host 'From now on it updates by itself (at logon and every 3 hours).'
}
