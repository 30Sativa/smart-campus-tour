param([switch]$Web, [switch]$NewFixture)
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $backendRoot -Parent
$ticket = Join-Path $backendRoot 'registration-local.env'
$project = Join-Path $backendRoot 'src/SmartCampus.Api/SmartCampus.Api.csproj'
$artifacts = Join-Path $backendRoot '.artifacts/registration-local'
if ($Web) {
    if (-not (Test-Path $ticket)) { throw 'Start the registration test API first.' }
    New-Item -ItemType Directory -Path $artifacts -Force | Out-Null
    $certificate = Join-Path $artifacts 'localhost.pfx'
    $certificatePassword = [Guid]::NewGuid().ToString('N')
    & dotnet dev-certs https --export-path $certificate --password $certificatePassword | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not export the local HTTPS certificate.' }
    $env:LOCAL_HTTPS_PFX = $certificate
    $env:LOCAL_HTTPS_PASSWORD = $certificatePassword
    $env:VITE_API_BASE_URL = 'https://localhost:7094'
    Push-Location (Join-Path $repoRoot 'web')
    try { & npm run dev -- --host localhost --port 5175 --strictPort }
    finally { Pop-Location }
} else {
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:DOTNET_ENVIRONMENT = 'Development'
    $arguments = @('run', '--project', $project, '--artifacts-path', $artifacts, '--no-launch-profile', '--', '--urls', 'https://localhost:7094')
    if ($NewFixture -or -not (Test-Path $ticket)) {
        $arguments += '--registration-local'
    } else {
        foreach ($line in Get-Content $ticket) {
            if ($line -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') }
        }
    }
    & dotnet @arguments
}
exit $LASTEXITCODE
