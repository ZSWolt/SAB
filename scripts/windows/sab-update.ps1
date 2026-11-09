<#
  SAB – auto-updater for Windows.

  Install (once):   powershell -ExecutionPolicy Bypass -File sab-update.ps1 -Install
  Update now:       powershell -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\SAB\sab-update.ps1"
  Uninstall:        powershell -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\SAB\sab-update.ps1" -Uninstall

  Downloads the latest build from GitHub Releases into %LOCALAPPDATA%\SAB\extension (the folder you
  load in chrome://extensions). A scheduled task runs it at logon and every 3 hours. When the files
  change, the extension notices and reloads itself. No admin rights needed.
#>
param([switch]$Install, [switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$Repo     = 'ZSWolt/SAB'
$Release  = "https://github.com/$Repo/releases/download/latest"
$Base     = Join-Path $env:LOCALAPPDATA 'SAB'
$Ext      = Join-Path $Base 'extension'
$Self     = Join-Path $Base 'sab-update.ps1'
$Log      = Join-Path $Base 'update.log'
$TaskName = 'SAB Extension Updater'

New-Item -ItemType Directory -Force -Path $Base | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Log([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Add-Content -Path $Log -Value $line -Encoding UTF8
  Write-Host $msg
  # keep the log short
  $lines = Get-Content $Log -ErrorAction SilentlyContinue
  if ($lines.Count -gt 300) { $lines | Select-Object -Last 200 | Set-Content $Log -Encoding UTF8 }
}

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "The automatic updates were removed. To remove the extension itself: chrome://extensions -> Remove."
  Write-Host "Folder: $Base (you can delete it after removing the extension)."
  exit 0
}

function Update-Extension([bool]$force) {
  $remote = Invoke-RestMethod -Uri "$Release/build.json" -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-cache' }
  $localFile = Join-Path $Ext 'build.json'
  $local = ''
  if (Test-Path $localFile) { $local = (Get-Content $localFile -Raw | ConvertFrom-Json).version }
  if (-not $force -and $local -eq $remote.version) { Log "Up to date (version $local)"; return }

  $tmp   = Join-Path $env:TEMP "sab-$([guid]::NewGuid()).zip"
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
  Log "Updated: '$local' -> '$($remote.version)'"
}

try {
  Update-Extension $Install.IsPresent
} catch {
  Log "Update failed: $($_.Exception.Message)"
  if ($Install) { Write-Host "Check your internet connection and try again."; exit 1 }
  exit 0
}

if ($Install) {
  # Keep a fresh copy of this script next to the extension, for the scheduled task.
  try { Invoke-WebRequest -Uri "$Release/sab-update.ps1" -OutFile $Self -UseBasicParsing }
  catch { if ($PSCommandPath -and $PSCommandPath -ne $Self) { Copy-Item $PSCommandPath $Self -Force } }

  $action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Self`""
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  $every3h  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10) -RepetitionInterval (New-TimeSpan -Hours 3) -RepetitionDuration (New-TimeSpan -Days 3650)
  try {
    $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
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
  Write-Host '(the path is copied - you can paste it with Ctrl+V)'
  Write-Host ''
  Write-Host 'One time only, in Chrome:'
  Write-Host '  1. Go to chrome://extensions and turn on "Developer mode"'
  Write-Host '  2. If you have an older SAB loaded - click Remove on it'
  Write-Host '  3. Click "Load unpacked" and choose the folder above'
  Write-Host ''
  Write-Host 'From now on it updates by itself (at logon and every 3 hours).'
}
