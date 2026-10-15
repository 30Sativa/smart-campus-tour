param([switch]$NewFixture)
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $backendRoot -Parent
$ticketPath = Join-Path $backendRoot 'student-ai-local.env'
$project = Join-Path $backendRoot 'src/SmartCampus.Api/SmartCampus.Api.csproj'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:DOTNET_ENVIRONMENT = 'Development'
$artifacts = Join-Path $backendRoot '.artifacts/student-ai-local'
$arguments = @('run', '--project', $project, '--artifacts-path', $artifacts, '--no-launch-profile', '--', '--urls', 'https://localhost:7093')
if ($NewFixture -or -not (Test-Path -LiteralPath $ticketPath)) {
    $assistantEnv = Join-Path $repoRoot 'ai-assistant/.env'
    if (-not (Test-Path -LiteralPath $assistantEnv)) { throw 'Configure ai-assistant/.env first.' }
    foreach ($line in Get-Content -LiteralPath $assistantEnv) {
        if ($line -match '^\s*AI_SERVICE_KEY\s*=(.*)$') {
            $env:AiAssistant__ServiceKey = $matches[1].Trim().Trim('"').Trim("'")
        }
    }
    $env:AiAssistant__BaseUrl = 'http://127.0.0.1:8091'
    $arguments += '--student-ai-local'
} else {
    foreach ($line in Get-Content -LiteralPath $ticketPath) {
        if ($line -match '^([^=]+)=(.*)$' -and -not $matches[1].StartsWith('STUDENT_')) {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
        }
    }
    Write-Host 'Reusing the local fixture in backend/student-ai-local.env.'
}
& dotnet @arguments
exit $LASTEXITCODE
