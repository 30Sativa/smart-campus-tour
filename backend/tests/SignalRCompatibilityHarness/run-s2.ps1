$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$clientDirectory = Join-Path $repoRoot 'robot\tools\signalr-compat'
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "signalr-s2-$PID"
$controlDirectory = Join-Path $tempDirectory 'control'
$certDirectory = Join-Path $tempDirectory 'certs'
$certPasswordText = 's2-local-harness-only'
$certPassword = ConvertTo-SecureString $certPasswordText -AsPlainText -Force
$rosImage = 'ros@sha256:1813d3c85d7f96ff7d3012d865204583255740182db5d0065f8f8cd029a83138'
$serverImage = "signalr-compat-s2:$PID"
$network = "signalr-s2-$PID"
$serverName = "signalr-s2-server-$PID"
$clientName = "signalr-s2-client-$PID"
$certificate = $null

function Wait-File([string]$Path, [int]$Seconds = 180) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path -LiteralPath $Path) { return }
        Start-Sleep -Milliseconds 200
    }
    throw "Timed out waiting for $Path"
}

function Start-TestServer {
    Remove-Item (Join-Path $controlDirectory 'server-ready.json') -Force -ErrorAction SilentlyContinue
    docker run -d --name $serverName --network $network --network-alias compat-server `
        --mount "type=bind,source=$(Join-Path $certDirectory 'server.pfx'),target=/certs/server.pfx,readonly" `
        --mount "type=bind,source=$controlDirectory,target=/s2-control" `
        -e S2_CONTROL_DIR=/s2-control -e S1_EXPECTED_TOKEN=s2-valid `
        -e S1_CERTIFICATE_PASSWORD=$certPasswordText $serverImage | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the Linux .NET test Hub.' }
    Wait-File (Join-Path $controlDirectory 'server-ready.json') 90
}

function Complete-Request([string]$Action, [hashtable]$Result) {
    $path = Join-Path $controlDirectory "done-$Action.json"
    $Result | ConvertTo-Json -Compress | Set-Content -LiteralPath $path -Encoding utf8
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
    if ($LASTEXITCODE -ne 0) { docker pull $rosImage; if ($LASTEXITCODE -ne 0) { throw 'Could not pull pinned ROS Humble image.' } }
    docker build -f (Join-Path $PSScriptRoot 'Dockerfile') -t $serverImage $PSScriptRoot
    if ($LASTEXITCODE -ne 0) { throw 'Could not build Linux .NET test Hub image.' }
    docker network create $network | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated test network.' }

    $rosMetadata = docker image inspect $rosImage --format '{{index .RepoDigests 0}} {{.Id}}'
    $dotnetMetadata = docker image inspect mcr.microsoft.com/dotnet/aspnet:10.0 --format '{{index .RepoDigests 0}} {{.Id}}'
    Write-Host "ROS image: $rosMetadata"
    Write-Host ".NET ASP.NET image: $dotnetMetadata"

    docker run -d --name $clientName --network $network `
        --mount "type=bind,source=$clientDirectory,target=/s1,readonly" `
        --mount "type=bind,source=$(Join-Path $certDirectory 'server.pem'),target=/certs/server.pem,readonly" `
        --mount "type=bind,source=$controlDirectory,target=/s2-control" `
        -e S2_CONTROL_DIR=/s2-control -e S2_URL=https://compat-server:5443/hubs/compatibility `
        -e S2_CA=/certs/server.pem -e S2_SOAK_MINUTES=30 -e S2_STATE_RATE_HZ=1 `
        $rosImage bash -lc 'apt-get update -qq && apt-get install -y -qq python3-pip ca-certificates >/dev/null && python3 -m pip install --quiet --no-cache-dir -r /s1/requirements.txt && python3 /s1/s2_client.py' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the ROS Humble client container.' }

    $startedAbsent = $false
    $serverStarted = $false
    $deadline = (Get-Date).AddMinutes(50)
    while ((Get-Date) -lt $deadline) {
        $clientState = docker inspect $clientName --format '{{.State.Status}}' 2>$null
        if ($LASTEXITCODE -ne 0 -or $clientState.Trim() -in @('exited', 'dead')) {
            if (-not (Test-Path -LiteralPath (Join-Path $controlDirectory 's2-evidence.json'))) {
                docker logs $clientName
                throw "S2 client exited with state $clientState without evidence"
            }
            break
        }
        if (-not $startedAbsent -and (Test-Path (Join-Path $controlDirectory 'client-started.json'))) {
            Start-Sleep -Seconds 8
            if (-not $serverStarted) {
                New-Item -ItemType File -Path (Join-Path $controlDirectory 'server-was-absent-8s') -Force | Out-Null
                Start-TestServer
                $serverStarted = $true
            }
            $startedAbsent = $true
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
                        Complete-Request $action @{ completed = $true; stoppedAt = (Get-Date).ToUniversalTime().ToString('o') }
                    }
                    'restart' {
                        Remove-Item (Join-Path $controlDirectory 'server-ready.json') -Force -ErrorAction SilentlyContinue
                        docker restart $serverName | Out-Null
                        if ($LASTEXITCODE -ne 0) { throw 'docker restart failed' }
                        Wait-File (Join-Path $controlDirectory 'server-ready.json') 90
                        Complete-Request $action @{ completed = $true; startedAt = (Get-Date).ToUniversalTime().ToString('o'); reason = $payload.reason }
                    }
                    'killrestart' {
                        Remove-Item (Join-Path $controlDirectory 'server-ready.json') -Force -ErrorAction SilentlyContinue
                        docker kill $serverName | Out-Null
                        if ($LASTEXITCODE -ne 0) { throw 'docker kill failed' }
                        docker start $serverName | Out-Null
                        if ($LASTEXITCODE -ne 0) { throw 'docker start after kill failed' }
                        Wait-File (Join-Path $controlDirectory 'server-ready.json') 90
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

        if (Test-Path -LiteralPath (Join-Path $controlDirectory 's2-evidence.json')) { break }
        Start-Sleep -Milliseconds 250
    }
    if (-not (Test-Path -LiteralPath (Join-Path $controlDirectory 's2-evidence.json'))) {
        docker logs $clientName
        throw 'S2 did not produce evidence before the 50-minute runner deadline.'
    }
    $evidence = Get-Content -LiteralPath (Join-Path $controlDirectory 's2-evidence.json') -Raw
    $evidence | Set-Content -LiteralPath (Join-Path $repoRoot 'backend/tests/SignalRCompatibilityHarness/s2-last-run.json') -Encoding utf8
    Write-Host $evidence
    Write-Host "Linux Hub OS: $(docker exec $serverName cat /etc/os-release | Select-String '^PRETTY_NAME=')"
    Write-Host "Linux Hub runtime: $(docker exec $serverName dotnet --list-runtimes)"
    Write-Host "Humble client identity: $(docker exec $clientName bash -lc 'cat /etc/os-release | grep PRETTY_NAME; python3 --version; python3 -m pip show signalrcore | grep Version')"
} finally {
    docker rm -f $clientName 2>$null | Out-Null
    docker rm -f $serverName 2>$null | Out-Null
    docker network rm $network 2>$null | Out-Null
    docker image rm $serverImage 2>$null | Out-Null
    if ($certificate) { Remove-Item "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
