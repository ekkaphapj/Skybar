# Configure only recognized, currently connected USB receipt printers.
param([switch]$ListOnly)
$ErrorActionPreference = 'Stop'
try {
  $devices = @(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^USBPRINT\\(PRINTERPOS-58|AIYIN_AN581)\\' })
  $targets = @($devices | ForEach-Object {
    $port = (Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Enum\' + $_.InstanceId + '\Device Parameters')).PortName
    if ($port -notmatch '^USB\d+$') { throw 'The detected printer has no Windows USB print port. Reconnect it and check Windows Settings.' }
    $name = if ($_.InstanceId -match 'AIYIN_AN581') { 'Cottage AiYin AN581 Thermal' } else { 'Cottage POS-58' }
    [PSCustomObject]@{ Name = $name; Port = $port; Device = $_.FriendlyName }
  })
  if ($ListOnly) { $targets | ConvertTo-Json -Compress; exit 0 }
  if (-not $targets.Count) { throw 'No connected POS-58 or AiYin AN581 was found. Connect USB, switch on the printer, then retry. For other models, install the vendor driver first.' }
  if (-not (Get-PrinterDriver -Name 'Generic / Text Only' -ErrorAction SilentlyContinue)) {
    $package = Get-ChildItem "$env:windir\System32\DriverStore\FileRepository" -Directory -Filter 'prnge001.inf_*' | Select-Object -First 1
    if (-not $package) { throw 'Microsoft Generic / Text Only driver is unavailable. Add the printer in Windows Settings first.' }
    Add-PrinterDriver -Name 'Generic / Text Only' -InfPath (Join-Path $package.FullName 'prnge001.inf')
  }
  foreach ($target in $targets) {
    if (-not (Get-PrinterPort -Name $target.Port -ErrorAction SilentlyContinue)) { throw ('Windows USB port is unavailable: ' + $target.Port) }
    $existing = Get-Printer -Name $target.Name -ErrorAction SilentlyContinue
    if ($existing -and $existing.PortName -ne $target.Port) { throw ($target.Name + ' already uses another port. Check Windows Printer Properties before changing it.') }
    if (-not $existing) { Add-Printer -Name $target.Name -DriverName 'Generic / Text Only' -PortName $target.Port }
    Write-Output ('READY: ' + $target.Name + ' on ' + $target.Port)
  }
  Write-Output 'Next: open start.bat, then select the printer in the POS website.'
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host 'If access was denied, right-click setup-thermal.bat and choose Run as administrator.'
  exit 1
}
