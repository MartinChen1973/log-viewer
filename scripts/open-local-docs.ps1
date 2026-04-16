# Open local Swagger / app URLs (Edge/Chrome if found; else default browser per URL).
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Urls
)

$ErrorActionPreference = "Continue"

if (-not $Urls -or $Urls.Count -eq 0) {
    Write-Host "open-local-docs.ps1: pass at least one URL after the script path." -ForegroundColor Yellow
    exit 1
}

function Get-BrowserExe {
    if ($env:DEEPAGENTS_BROWSER -and (Test-Path -LiteralPath $env:DEEPAGENTS_BROWSER)) {
        return $env:DEEPAGENTS_BROWSER
    }

    $candidates = @(
        "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }

    $appPathKeys = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
    )
    foreach ($k in $appPathKeys) {
        if (-not (Test-Path -LiteralPath $k)) { continue }
        try {
            $p = (Get-ItemProperty -LiteralPath $k -ErrorAction Stop)."(default)"
            if ($p -and (Test-Path -LiteralPath $p)) { return $p }
        } catch {
        }
    }

    return $null
}

function Open-UrlDefaultBrowser {
    param([string] $Url)
    try {
        Start-Process -FilePath $Url -ErrorAction Stop
        return $true
    } catch {
    }
    try {
        $psi = [System.Diagnostics.ProcessStartInfo]::new()
        $psi.FileName = $Url
        $psi.UseShellExecute = $true
        [void][System.Diagnostics.Process]::Start($psi)
        return $true
    } catch {
    }
    try {
        cmd.exe /c "start `"`" `"$Url`""
        return $true
    } catch {
    }
    return $false
}

$browser = Get-BrowserExe

if ($browser) {
    Write-Host "Opening $($Urls.Count) tab(s) via: $browser"
    try {
        # First URL in a new window; remaining URLs open as new tabs in the same browser.
        $first = $Urls[0]
        [void](Start-Process -FilePath $browser -ArgumentList @("--new-window", $first) -PassThru -ErrorAction Stop)
        Start-Sleep -Milliseconds 600
        for ($i = 1; $i -lt $Urls.Count; $i++) {
            Start-Process -FilePath $browser -ArgumentList @($Urls[$i]) -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 250
        }
        exit 0
    } catch {
        Write-Host "Chromium Start-Process failed ($browser): $_ — falling back to default browser per URL." -ForegroundColor Yellow
    }
}

Write-Host "Opening each URL with the system default browser handler."
$ok = 0
foreach ($u in $Urls) {
    if (Open-UrlDefaultBrowser -Url $u) { $ok++ }
    else { Write-Host "Could not open: $u" -ForegroundColor Yellow }
    Start-Sleep -Milliseconds 350
}

if ($ok -gt 0) {
    Write-Host "Opened $ok / $($Urls.Count) URL(s)."
    exit 0
}

exit 1
