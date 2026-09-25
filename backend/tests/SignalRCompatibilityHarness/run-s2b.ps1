$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$clientDirectory = Join-Path $repoRoot 'robot\tools\signalr-compat'
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "signalr-s2b-$PID"
$controlDirectory = Join-Path $tempDirectory 'control'
$certDirectory = Join-Path $tempDirectory 'certs'
$certPasswordText = 's2b-local-harness-only'
$certPassword = ConvertTo-SecureString $certPasswordText -AsPlainText -Force
$rosImage = 'ros@sha256:1813d3c85d7f96ff7d3012d865204583255740182db5d0065f8f8cd029a83138'
$serverImage = "signalr-compat-s2b:$PID"
$network = "signalr-s2b-$PID"
$serverName = "signalr-s2b-server-$PID"
$certificate = $null

function Wait-File([string]$Path, [int]$Seconds = 180) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path -LiteralPath $Path) { return }
        Start-Sleep -Milliseconds 200
    }
    throw "Timed out waiting for $Path"
}

function Complete-Request([string]$Action, [hashtable]$Result) {
    $path = Join-Path $controlDirectory "done-$Action.json"
    $Result | ConvertTo-Json -Compress | Set-Content -LiteralPath $path -Encoding utf8
}

function Start-TestServer {
    Remove-Item (Join-Path $controlDirectory 'server-ready.json') -Force -ErrorAction SilentlyContinue
    docker start $serverName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not start Linux .NET test Hub.' }
    Wait-File (Join-Path $controlDirectory 'server-ready.json') 90
}

try {
    New-Item -ItemType Directory -Path $controlDirectory, $certDirectory -Force | Out-Null
    $certificate = New-SelfSignedCertificate -DnsName 'compat-server' `
        -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 `
        -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddHours(12)
    Export-PfxCertificate -Cert $certificate -FilePath (Join-Path $certDirectory 'server.pfx') -Password $certPassword | Out-Null
    $cerPath = Join-Path $certDirectory 'server.cer'
    Export-Certificate -Cert $certificate -FilePath $cerPath -Type CERT | Out-Null
    & certutil.exe -encode $cerPath (Join-Path $certDirectory 'server.pem') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not export the ephemeral certificate as PEM.' }

    docker image inspect $rosImage --format '{{.Id}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { docker pull $rosImage; if ($LASTEXITCODE -ne 0) { throw 'Could not pull the pinned ROS Humble image.' } }
    docker build -f (Join-Path $PSScriptRoot 'Dockerfile') -t $serverImage $PSScriptRoot
    if ($LASTEXITCODE -ne 0) { throw 'Could not build Linux .NET test Hub image.' }
    docker network create $network | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated test network.' }

    $rosMetadata = docker image inspect $rosImage --format '{{index .RepoDigests 0}} {{.Id}}'
    $dotnetMetadata = docker image inspect mcr.microsoft.com/dotnet/aspnet:10.0 --format '{{index .RepoDigests 0}} {{.Id}}'
    Write-Host "ROS image: $rosMetadata"
    Write-Host ".NET ASP.NET image: $dotnetMetadata"

    docker run -d --name $serverName --network $network --network-alias compat-server `
        --mount "type=bind,source=$(Join-Path $certDirectory 'server.pfx'),target=/certs/server.pfx,readonly" `
        --mount "type=bind,source=$controlDirectory,target=/s2-control" `
        -e S2_CONTROL_DIR=/s2-control -e S1_EXPECTED_TOKEN=s2b-valid `
        -e S1_CERTIFICATE_PASSWORD=$certPasswordText $serverImage | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not start Linux .NET test Hub.' }
    Wait-File (Join-Path $controlDirectory 'server-ready.json') 90

    $clientName = "signalr-s2b-client-$PID"
    docker run -d --name $clientName --network $network `
        --mount "type=bind,source=$clientDirectory,target=/s2b,readonly" `
        --mount "type=bind,source=$(Join-Path $certDirectory 'server.pem'),target=/certs/server.pem,readonly" `
        --mount "type=bind,source=$controlDirectory,target=/s2b-control" `
        -e S2B_CONTROL_DIR=/s2b-control -e S2B_URL=https://compat-server:5443/hubs/compatibility `
        -e S2B_CA=/certs/server.pem $rosImage bash -lc 'apt-get update -qq && apt-get install -y -qq python3-pip ca-certificates >/dev/null && python3 -m pip install --quiet --no-cache-dir -r /s2b/requirements-pysignalr.txt && python3 /s2b/s2b_client.py'
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the pysignalr client container.' }

    $evidencePath = Join-Path $controlDirectory 's2b-pysignalr-last-run.json'
    $clientStartedPath = Join-Path $controlDirectory 'client-started.json'
    $reliabilityServerStarted = $false
    $deadline = (Get-Date).AddMinutes(50)
    while ((Get-Date) -lt $deadline) {
        $clientState = docker inspect $clientName --format '{{.State.Status}}' 2>$null
        if ($LASTEXITCODE -ne 0 -or $clientState.Trim() -in @('exited', 'dead')) {
            if (-not (Test-Path -LiteralPath $evidencePath)) {
                docker logs $clientName
                throw "pysignalr client exited with state $clientState without evidence"
            }
            break
        }

        if (-not $reliabilityServerStarted -and (Test-Path -LiteralPath $clientStartedPath)) {
            Start-Sleep -Seconds 8
            New-Item -ItemType File -Path (Join-Path $controlDirectory 'server-was-absent-8s') -Force | Out-Null
            Start-TestServer
            $reliabilityServerStarted = $true
        }

        foreach ($action in @('stop', 'restart', 'killrestart', 'pause')) {
            $requestPath = Join-Path $controlDirectory "request-$action.json"
            if (-not (Test-Path -LiteralPath $requestPath)) { continue }
            $payload = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
            Remove-Item -LiteralPath $requestPath -Force
            try {
                switch ($action) {
                    'stop' {
                        docker stop $serverName | Out-Null
                        if ($LASTEXITCODE -ne 0) { throw 'docker stop failed' }
                        Remove-Item (Join-Path $controlDirectory 'server-ready.json') -Force -ErrorAction SilentlyContinue
                        Complete-Request $action @{ completed = $true; stoppedAt = (Get-Date).ToUniversalTime().ToString('o') }
                    }
                    'restart' {
                        Start-TestServer
                        Complete-Request $action @{ completed = $true; startedAt = (Get-Date).ToUniversalTime().ToString('o'); reason = $payload.reason }
                    }
                    'killrestart' {
                        Remove-Item (Join-Path $controlDirectory 'server-ready.json') -Force -ErrorAction SilentlyContinue
                        docker kill $serverName | Out-Null
                        if ($LASTEXITCODE -ne 0) { throw 'docker kill failed' }
                        Start-TestServer
                        Complete-Request $action @{ completed = $true; startedAt = (Get-Date).ToUniversalTime().ToString('o') }
                    }
                    'pause' {
                        docker pause $serverName | Out-Null
                        if ($LASTEXITCODE -ne 0) { throw 'docker pause failed' }
                        $duration = [Math]::Max(35, [int]$payload.durationSeconds)
                        Start-Sleep -Seconds $duration
                        docker unpause $serverName | Out-Null
                        if ($LASTEXITCODE -ne 0) { throw 'docker unpause failed' }
                        Complete-Request $action @{ completed = $true; frozenSeconds = $duration }
                    }
                }
            } catch {
                Complete-Request $action @{ error = $_.Exception.Message }
            }
        }
        Start-Sleep -Milliseconds 250
    }
    if ((Get-Date) -ge $deadline -and (docker inspect $clientName --format '{{.State.Status}}').Trim() -notin @('exited', 'dead')) {
        docker logs $clientName
        throw 'S2B did not finish before the 50-minute runner deadline.'
    }

    docker logs $clientName
    $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
    $evidence | Add-Member -NotePropertyName 'humbleImage' -NotePropertyValue $rosMetadata.Split(' ')[0] -Force
    $evidence | Add-Member -NotePropertyName 'dotnetImage' -NotePropertyValue $dotnetMetadata.Split(' ')[0] -Force
    $evidence | Add-Member -NotePropertyName 'dotnetRuntime' -NotePropertyValue (docker run --rm --entrypoint dotnet $serverImage --list-runtimes | Out-String).Trim() -Force
    $evidence | Add-Member -NotePropertyName 'hubOs' -NotePropertyValue ((docker run --rm --entrypoint sh $serverImage -lc 'grep PRETTY_NAME /etc/os-release') -replace '^PRETTY_NAME=', '').Trim('"') -Force
    $evidence | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $repoRoot 'backend/tests/SignalRCompatibilityHarness/s2b-pysignalr-last-run.json') -Encoding utf8
    Get-Content -LiteralPath (Join-Path $repoRoot 'backend/tests/SignalRCompatibilityHarness/s2b-pysignalr-last-run.json') -Raw | Write-Host
} finally {
    docker rm -f "signalr-s2b-client-$PID" 2>$null | Out-Null
    docker rm -f $serverName 2>$null | Out-Null
    docker network rm $network 2>$null | Out-Null
    docker image rm $serverImage 2>$null | Out-Null
    if ($certificate) { Remove-Item "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
