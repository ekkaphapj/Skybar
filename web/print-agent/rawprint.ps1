# ส่งข้อมูลดิบ (RAW) ตรงเข้าเครื่องพิมพ์ผ่าน Windows print spooler
# ใช้ร่วมกับ agent.js — พารามิเตอร์: -PrinterName <ชื่อเครื่องพิมพ์> -FilePath <ไฟล์ .bin>
param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$src = @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOA {
    public string pDocName;
    public string pOutputFile;
    public string pDataType;
  }
  public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    DOCINFOA di = new DOCINFOA();
    di.pDocName = "POS Receipt";
    di.pDataType = "RAW";
    IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, pBytes, bytes.Length);
    bool ok = false;
    try {
      if (OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
        if (StartDocPrinter(hPrinter, 1, di)) {
          if (StartPagePrinter(hPrinter)) {
            int written;
            ok = WritePrinter(hPrinter, pBytes, bytes.Length, out written) && written == bytes.Length;
            EndPagePrinter(hPrinter);
          }
          EndDocPrinter(hPrinter);
        }
        ClosePrinter(hPrinter);
      }
    } finally { Marshal.FreeCoTaskMem(pBytes); }
    return ok;
  }
}
"@

try { Add-Type -TypeDefinition $src -ErrorAction Stop } catch { }
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
if ([RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)) {
  Write-Output "OK"
  exit 0
} else {
  Write-Output "FAILED: ส่งงานเข้าเครื่องพิมพ์ '$PrinterName' ไม่สำเร็จ (ตรวจสอบว่าชื่อเครื่องพิมพ์ถูกต้องและเครื่องพร้อมใช้งาน)"
  exit 1
}
