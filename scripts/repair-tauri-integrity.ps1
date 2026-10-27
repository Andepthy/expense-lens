[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('debug', 'release')]
    [string] $Profile,

    [switch] $Elevated
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$targetDirectory = Join-Path $repositoryRoot "src-tauri\target\$Profile"
$icaclsPath = Join-Path $env:SystemRoot 'System32\icacls.exe'

New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null

$directoryAcl = (& $icaclsPath $targetDirectory 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect integrity level on '$targetDirectory'."
}

if ($directoryAcl -match 'Mandatory Label\\Medium Mandatory Level') {
    exit 0
}

if (-not $Elevated) {
    $powershellPath = Join-Path $PSHOME 'powershell.exe'
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Profile $Profile -Elevated"
    $process = Start-Process -FilePath $powershellPath -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Administrator repair failed for '$targetDirectory' (exit code $($process.ExitCode))."
    }
    exit 0
}

$repairOutput = (& $icaclsPath $targetDirectory /setintegritylevel '(OI)(CI)M' /T /C /Q 2>&1) -join "`n"
$failedItems = [regex]::Match($repairOutput, 'Failed processing (\d+) files')
if ($LASTEXITCODE -ne 0 -or ($failedItems.Success -and [int]$failedItems.Groups[1].Value -gt 0)) {
    throw "Failed to restore Medium integrity on '$targetDirectory'. icacls exit code: $LASTEXITCODE. $repairOutput"
}
