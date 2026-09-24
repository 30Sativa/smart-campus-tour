$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$project = Join-Path $PSScriptRoot 'SignalRCompatibilityHarness.csproj'
$clientDirectory = Join-Path $repoRoot 'robot\tools\signalr-compat'
$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "signalr-s1-$PID"
$certificatePasswordText = 's1-local-harness-only'
$certificatePassword = ConvertTo-SecureString $certificatePasswordText -AsPlainText -Force
$portListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$serverProcess = $null
$certificate = $null

try {
    $portListener.Start()
    $port = ([System.Net.IPEndPoint]$portListener.LocalEndpoint).Port
    $portListener.Stop()

    New-Item -ItemType Directory -Path $tempDirectory | Out-Null
    $pfxPath = Join-Path $tempDirectory 'server.pfx'
    $cerPath = Join-Path $tempDirectory 'server.cer'
    $pemPath = Join-Path $tempDirectory 'server.pem'
    $stdoutPath = Join-Path $tempDirectory 'server.stdout.log'
    $stderrPath = Join-Path $tempDirectory 'server.stderr.log'

    $certificate = New-SelfSignedCertificate `
        -DnsName 'host.docker.internal', 'localhost' `
        -CertStoreLocation 'Cert:\CurrentUser\My' `
        -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
        -KeyExportPolicy Exportable -NotAfter (Get-Date).AddHours(2)
    Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $certificatePassword | Out-Null
    Export-Certificate -Cert $certificate -FilePath $cerPath -Type CERT | Out-Null
    & certutil.exe -encode $cerPath $pemPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not export the ephemeral certificate as PEM.' }

    $env:S1_PORT = "$port"
    $env:S1_CERTIFICATE = $pfxPath
    $env:S1_CERTIFICATE_PASSWORD = $certificatePasswordText
    $serverProcess = Start-Process -FilePath 'dotnet' `
        -ArgumentList @('run', '--project', $project, '--configuration', 'Release', '--no-launch-profile') `
        -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

    $ready = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        if ($serverProcess.HasExited) {
            throw "Test Hub exited during startup. See $stdoutPath and $stderrPath"
        }
        $probe = [System.Net.Sockets.TcpClient]::new()
        try {
            $probe.Connect('127.0.0.1', $port)
            $ready = $true
            break
        } catch {
            Start-Sleep -Milliseconds 500
        } finally {
            $probe.Dispose()
        }
    }
    if (-not $ready) { throw "Test Hub did not listen on port $port within 45 seconds." }

    $rosImage = 'ros@sha256:1813d3c85d7f96ff7d3012d865204583255740182db5d0065f8f8cd029a83138'
    docker image inspect $rosImage --format '{{.Id}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { docker pull $rosImage; if ($LASTEXITCODE -ne 0) { throw 'Could not pull the pinned ROS Humble base image.' } }
    $imageMetadata = docker image inspect $rosImage --format '{{index .RepoDigests 0}} {{.Id}}'
    Write-Host "ROS image: $imageMetadata"
    Write-Host "Test Hub runtime: $(& dotnet --list-runtimes | Where-Object { $_ -match '^Microsoft\.AspNetCore\.App 10\.' })"

    docker run --rm --add-host 'host.docker.internal:host-gateway' `
        --mount "type=bind,source=$clientDirectory,target=/s1,readonly" `
        --mount "type=bind,source=$pemPath,target=/certs/server.pem,readonly" `
        $rosImage bash -lc "apt-get update -qq && apt-get install -y -qq python3-pip ca-certificates >/dev/null && python3 -m pip install --quiet --no-cache-dir -r /s1/requirements.txt && python3 /s1/client.py --url https://host.docker.internal:$port/hubs/compatibility --ca /certs/server.pem"
    if ($LASTEXITCODE -ne 0) { throw "Humble-container compatibility client failed with exit code $LASTEXITCODE." }
} finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force
    }
    Remove-Item Env:S1_PORT, Env:S1_CERTIFICATE, Env:S1_CERTIFICATE_PASSWORD -ErrorAction SilentlyContinue
    if ($certificate) {
        Remove-Item "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -ErrorAction SilentlyContinue
    }
    Remove-Item $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
