<#
  Horizon TV debloat — removes preinstalled bloat from an Android TV / Google TV over your Wi-Fi.

  SAFE BY DESIGN
  - Uses "pm uninstall --user 0": the app is removed for the TV user only, never from the system image.
    Nothing is permanently deleted; a factory reset or this script's Restore option brings any app back.
  - Every removal is logged to removed-<tv>.txt next to this script so Restore knows what to bring back.
  - Core system parts (settings, setup, Play Services, input, Bluetooth, system update) are never touched.
  - The stock home screen is only offered once Horizon is installed, so you can never end up without a home.

  BEFORE YOU RUN
  1. On the TV: Settings > Device Preferences > About > click "Build" 7 times (Developer options appear).
  2. Settings > Device Preferences > Developer options > turn on "USB debugging" / "Network debugging".
  3. Note the TV's IP address (Settings > Network > your Wi-Fi).
  4. On this PC, right-click this file > "Run with PowerShell", or run:  powershell -ExecutionPolicy Bypass -File debloat.ps1
  5. Accept the "Allow USB debugging?" prompt that appears on the TV.
#>

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---------- known bloat, grouped so you choose per group ----------
$GROUPS = [ordered]@{
  'Google extras' = @(
    @('com.google.android.youtube.tvmusic',        'YouTube Music'),
    @('com.google.android.videos',                 'Google TV / Play Movies'),
    @('com.google.android.music',                  'Play Music (old)'),
    @('com.google.android.play.games',             'Play Games'),
    @('com.google.android.feedback',               'Google feedback'),
    @('com.google.android.tvrecommendations',      'Home screen recommendations'),
    @('com.google.android.leanbacklauncher.recommendations', 'Launcher recommendations'),
    @('com.google.android.apps.tv.dreamx',         'Google TV ambient screensaver'),
    @('com.google.android.backdrop',               'Backdrop screensaver'),
    @('com.google.android.apps.tv.launcherx.coreservices', 'Google TV suggestions service')
  )
  'Xiaomi / Mi TV' = @(
    @('com.mitv.videoplayer',                      'Mi video player'),
    @('com.mitv.gallery',                          'Mi gallery'),
    @('com.xiaomi.mitv.appstore',                  'Mi app store'),
    @('com.xiaomi.mitv.tvmanager',                 'Mi TV manager / cleaner'),
    @('com.miui.tv.analytics',                     'Xiaomi analytics'),
    @('com.mitv.screensaver',                      'Mi screensaver'),
    @('com.xiaomi.mitv.calendar',                  'Mi calendar'),
    @('com.xiaomi.mitv.shop',                      'Mi shop')
  )
  'TCL' = @(
    @('com.tcl.appmarket',                         'TCL app market'),
    @('com.tcl.tvweishi',                          'TCL TV guard'),
    @('com.tcl.gallery',                           'TCL gallery'),
    @('com.tcl.waterfall.overseas',                'TCL channel home'),
    @('com.tcl.partnercustomizer',                 'TCL partner promos')
  )
  'Sony' = @(
    @('com.sony.dtv.sonyselect',                   'Sony Select'),
    @('com.sony.dtv.sonyshelf',                    'Sony shelf / promos'),
    @('com.sony.dtv.promos',                       'Sony promotions')
  )
  'Hisense / Philips / others' = @(
    @('com.hisense.store',                         'Hisense store'),
    @('com.tpvision.philipstvapp',                 'Philips TV app promos'),
    @('com.amlogic.tvmanager',                     'Box TV manager'),
    @('com.android.dreams.basic',                  'Basic screensaver'),
    @('com.android.gallery3d',                     'Gallery'),
    @('com.android.printspooler',                  'Print service')
  )
}
# stock launchers: only offered when Horizon is installed
$LAUNCHERS = @(
  @('com.google.android.apps.tv.launcherx', 'Google TV home'),
  @('com.google.android.leanbacklauncher',  'Android TV home'),
  @('com.mitv.tvhome',                      'Xiaomi PatchWall'),
  @('com.tcl.cyberui',                      'TCL home'),
  @('com.sony.dtv.tvx',                     'Sony home')
)
$HORIZON = 'com.horizon.launcher'
# never touched, even if you pick them by hand
$PROTECTED = @('com.android.settings','com.android.tv.settings','com.google.android.gms','com.google.android.gsf','com.android.vending',
  'com.google.android.tungsten.setupwraith','com.android.providers.','com.android.systemui','com.android.bluetooth','com.google.android.katniss',
  'com.google.android.apps.mediashell','com.android.inputmethod','com.google.android.inputmethod','com.android.packageinstaller',
  'com.google.android.tv.remote.service','android','com.android.shell','com.google.android.webview','com.android.webview')

function Say($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Ask($q) { (Read-Host $q).Trim() }
function IsProtected($p) { foreach ($x in $PROTECTED) { if ($p -eq $x -or ($x.EndsWith('.') -and $p.StartsWith($x))) { return $true } }; return $false }

# ---------- adb ----------
function Find-Adb {
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $local = Join-Path $here 'platform-tools\adb.exe'
  if (Test-Path $local) { return $local }
  Say "`nadb (Google's Android platform-tools) is not installed." Yellow
  Say "It is the official tool from Google: https://developer.android.com/tools/releases/platform-tools"
  if ((Ask "Download it now from dl.google.com into this folder? (y/n)") -ne 'y') { throw 'adb is required.' }
  $zip = Join-Path $here 'platform-tools.zip'
  Invoke-WebRequest 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $zip
  Expand-Archive $zip -DestinationPath $here -Force; Remove-Item $zip
  return $local
}
$adb = Find-Adb
function A { & $adb @args 2>&1 }

# ---------- connect ----------
Say "`n=== Horizon TV debloat ===" Cyan
$ip = Ask "TV IP address (e.g. 192.168.1.40)"
if ($ip -notmatch ':') { $ip = "${ip}:5555" }
Say (A connect $ip | Out-String)
Say "If the TV shows 'Allow USB debugging?', choose Always allow, then press Enter here." Yellow
[void](Read-Host)
$state = (A -s $ip get-state | Out-String).Trim()
if ($state -ne 'device') { throw "TV not connected ($state). Check network debugging is on and the IP is right." }
$model = (A -s $ip shell getprop ro.product.model | Out-String).Trim()
Say "Connected to $model" Green
$log = Join-Path $here ("removed-" + ($model -replace '[^\w-]', '_') + ".txt")

$installed = (A -s $ip shell pm list packages | Out-String) -split "`r?`n" | Where-Object { $_ -like 'package:*' } | ForEach-Object { $_.Substring(8).Trim() }

function Remove-Pkg($pkg, $label) {
  if (IsProtected $pkg) { Say "  skip $label (protected)" DarkYellow; return }
  $r = (A -s $ip shell pm uninstall -k --user 0 $pkg | Out-String).Trim()
  if ($r -match 'Success') { Say "  removed  $label  ($pkg)" Green; Add-Content $log $pkg }
  else { Say "  could not remove ${label}: $r" Red }
}

function Restore-All {
  if (-not (Test-Path $log)) { Say "Nothing to restore for $model." Yellow; return }
  foreach ($p in Get-Content $log | Select-Object -Unique) {
    [void](A -s $ip shell pm enable --user 0 $p)
    $r = (A -s $ip shell cmd package install-existing $p | Out-String).Trim()
    Say "  $p  ->  $r"
  }
  Remove-Item $log; Say "Restored." Green
}

# ---------- menu ----------
Say "`n1) Remove bloat (guided)`n2) Restore everything I removed`n3) Quit"
switch (Ask "Choose") {
  '2' { Restore-All; return }
  '3' { return }
}

foreach ($g in $GROUPS.Keys) {
  $found = @($GROUPS[$g] | Where-Object { $installed -contains $_[0] })
  if (-not $found.Count) { continue }
  Say "`n--- $g ---" Cyan
  $i = 0; foreach ($f in $found) { $i++; Say ("  {0,2}) {1}" -f $i, $f[1]) }
  $ans = Ask "Remove: a = all, numbers like 1,3, Enter = skip"
  if (-not $ans) { continue }
  $pick = if ($ans -eq 'a') { $found } else { $ans -split '[ ,]+' | ForEach-Object { $found[[int]$_ - 1] } }
  foreach ($p in $pick) { if ($p) { Remove-Pkg $p[0] $p[1] } }
}

# other preinstalled apps the lists don't know: let the user decide one by one
$known = @($GROUPS.Values | ForEach-Object { $_ } | ForEach-Object { $_[0] }) + @($LAUNCHERS | ForEach-Object { $_[0] })
$extra = (A -s $ip shell pm list packages -s | Out-String) -split "`r?`n" | Where-Object { $_ -like 'package:*' } | ForEach-Object { $_.Substring(8).Trim() } |
  Where-Object { $known -notcontains $_ -and -not (IsProtected $_) -and $_ -notmatch '^(android|com\.android\.|com\.google\.android\.(gms|gsf|ext|overlay|partnersetup|configupdater))' }
if ($extra.Count -and (Ask "`nShow $($extra.Count) other preinstalled apps to review? (y/n)") -eq 'y') {
  Say "Only remove names you recognise as promos or apps you never use." Yellow
  $i = 0; foreach ($e in $extra) { $i++; Say ("  {0,3}) {1}" -f $i, $e) }
  $ans = Ask "Numbers to remove (e.g. 2,7), Enter = none"
  if ($ans) { $ans -split '[ ,]+' | ForEach-Object { $p = $extra[[int]$_ - 1]; if ($p) { Remove-Pkg $p $p } } }
}

# stock home screen: only with Horizon in place
if ($installed -contains $HORIZON) {
  $stock = @($LAUNCHERS | Where-Object { $installed -contains $_[0] })
  foreach ($s in $stock) {
    if ((Ask "`nHorizon is installed. Disable the stock '$($s[1])' so Horizon is the only home? (y/n)") -eq 'y') {
      $r = (A -s $ip shell pm disable-user --user 0 $s[0] | Out-String).Trim(); Say "  $r"; Add-Content $log $s[0]
    }
  }
} else {
  Say "`nThe stock home screen was kept: install Horizon first, then run this again to replace it." DarkYellow
}

Say "`nDone. Removed apps are listed in $log" Green
Say "Run this script again and choose 2 to bring everything back."
