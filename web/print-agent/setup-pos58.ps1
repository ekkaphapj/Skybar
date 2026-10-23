# Configure an attached POS-58 using Microsoft's inbox RAW/text driver.
$ErrorActionPreference = 'Stop'
try {
  $devices = @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Enum\USBPRINT\PRINTERPOS-58' -ErrorAction SilentlyContinue)
  $ports = @($devices | ForEach-Object { (Get-ItemProperty -LiteralPath ($_.PSPath + '\Device Parameters') -ErrorAction SilentlyContinue).PortName } | Where-Object { $_ -match '^USB\d+$' } | Select-Object -Unique)
  if ($ports.Count -ne 1) { throw 'Connect and switch on one POS-58 printer first. If several printers are connected, configure the correct USB port in Windows manually.' }
  if (-not (Get-PrinterDriver -Name 'Generic / Text Only' -ErrorAction SilentlyContinue)) {
    $package = Get-ChildItem "$env:windir\System32\DriverStore\FileRepository" -Directory -Filter 'prnge001.inf_*' | Select-Object -First 1
    if (-not $package) { throw 'Microsoft Generic / Text Only driver is unavailable. Add the printer in Windows Settings first.' }
    Add-PrinterDriver -Name 'Generic / Text Only' -InfPath (Join-Path $package.FullName 'prnge001.inf')
  }
  $printer = Get-Printer -Name 'Cottage POS-58' -ErrorAction SilentlyContinue
  if ($printer -and $printer.PortName -ne $ports[0]) { throw 'Cottage POS-58 already uses a different port. Check Windows Printer Properties before changing it.' }
  if (-not $printer) { Add-Printer -Name 'Cottage POS-58' -DriverName 'Generic / Text Only' -PortName $ports[0] }
  Write-Output ('READY: Cottage POS-58 on ' + $ports[0])
} catch { Write-Error $_.Exception.Message; exit 1 }
