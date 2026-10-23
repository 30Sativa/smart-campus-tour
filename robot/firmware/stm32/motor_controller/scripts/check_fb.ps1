# Doc khung FB tu STM32 qua cong COM (USB CDC), dem so truong, giai ma.
# Chi DOC, khong gui lenh nao xuong STM32.
param([string]$Port = "", [int]$Seconds = 3)
$ErrorActionPreference = "Stop"
$expected = 24
$names = @('FB','seq','left_count','right_count','dt_ms','status','yaw_cdeg','yaw_valid',
  's1_mm','s1_valid','s2_mm','s2_valid','s3_mm','s3_valid','s4_mm','s4_valid',
  'yaw_acc','imu_rearm','imu_reset_seen','head_seq','pan_cdeg','tilt_cdeg','head_state','contactor')
$headStates = @{ '0'='OFF'; '1'='IDLE'; '2'='MOVING'; '3'='HOMING'; '4'='NO_REF' }

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

# ---- Tim cong COM cua STM32 (USB VID 0483 = STMicroelectronics) ----
if (-not $Port) {
  $stm = @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
    Where-Object { $_.PNPDeviceID -like 'USB\VID_0483*' -and $_.Name -match '\((COM\d+)\)' } |
    ForEach-Object { if ($_.Name -match '\((COM\d+)\)') { [pscustomobject]@{ Port = $Matches[1]; Name = $_.Name } } })
  # bo qua cong VCP cua ST-Link (ten co "STLink"/"ST-Link")
  $cdc = @($stm | Where-Object { $_.Name -notmatch 'ST-?Link' })
  if ($cdc.Count -ge 1) { $Port = $cdc[0].Port; Say "Tim thay: $($cdc[0].Name)" 'Cyan' }
  else {
    $all = [System.IO.Ports.SerialPort]::GetPortNames()
    Say "Khong thay thiet bi USB cua STM32 (VID 0483)." 'Yellow'
    Say "Cac cong COM dang co: $($all -join ', ')" 'Yellow'
    Say "Kiem tra: cap USB cua STM32 (khong phai ST-Link), firmware da nap va dang chay." 'Yellow'
    exit 2
  }
}

# ---- Mo cong va doc ----
$sp = New-Object System.IO.Ports.SerialPort $Port, 115200, 'None', 8, 'One'
$sp.DtrEnable = $true
$sp.RtsEnable = $true
$sp.ReadTimeout = 300
$sp.NewLine = "`n"
try { $sp.Open() }
catch {
  Say "[LOI] Khong mo duoc $Port : $($_.Exception.Message)" 'Red'
  Say "Cong dang bi chuong trinh khac giu (CubeIDE, terminal, PuTTY...)? Dong lai roi chay lai." 'Red'
  exit 3
}
Say "Dang doc $Port trong $Seconds giay..." 'Cyan'
$lines = New-Object System.Collections.Generic.List[string]
$other = New-Object System.Collections.Generic.List[string]
$sw = [Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $Seconds) {
  try { $l = $sp.ReadLine().Trim() } catch [TimeoutException] { continue }
  if ($l.StartsWith('FB,')) { $lines.Add($l) } elseif ($l) { $other.Add($l) }
}
$sp.Close()

if ($lines.Count -eq 0) {
  Say "[LOI] Khong nhan duoc khung FB nao tu $Port." 'Red'
  if ($other.Count) { Say "Dong khac nhan duoc: $($other[0])" 'Yellow' }
  exit 4
}

$hz = [math]::Round($lines.Count / $Seconds, 1)
$counts = $lines | ForEach-Object { $_.Split(',').Count } | Group-Object | Sort-Object Count -Descending
Say ""
Say "Nhan $($lines.Count) khung FB (~$hz khung/giay, mong doi ~50)."
foreach ($g in $counts) { Say ("  {0} truong : {1} khung" -f $g.Name, $g.Count) }

$last = $lines[$lines.Count - 1]
$p = $last.Split(',')
Say ""
Say "Khung cuoi: $last" 'DarkGray'
Say ""
for ($i = 0; $i -lt $p.Count; $i++) {
  $n = if ($i -lt $names.Count) { $names[$i] } else { '(la)' }
  $extra = ''
  if ($n -eq 'head_state' -and $headStates.ContainsKey($p[$i])) { $extra = ' = ' + $headStates[$p[$i]] }
  if ($n -eq 'contactor') { $extra = if ($p[$i] -eq '1') { ' = BAT (PA10 cao)' } else { ' = TAT (PA10 thap)' } }
  if ($n -in 'pan_cdeg','tilt_cdeg' -and $p[$i] -match '^-?\d+$') { $extra = ' = ' + ([int]$p[$i] / 100.0) + ' do' }
  Say ("  [{0,2}] {1,-15} {2}{3}" -f $i, $n, $p[$i], $extra)
}

$main = [int]$counts[0].Name
Say ""
if ($main -eq $expected) {
  Say "=== DAT: khung FB co du $expected truong (firmware moi, co dau quay + contactor). ===" 'Green'
  exit 0
} elseif ($main -lt $expected) {
  Say "=== CHUA DAT: khung FB co $main truong, can $expected. Firmware tren STM32 la ban cu, hay nap lai. ===" 'Red'
  exit 1
} else {
  Say "=== Khung FB co $main truong (> $expected): firmware moi hon, bridge van doc duoc. ===" 'Yellow'
  exit 0
}
