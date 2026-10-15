$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path $csc)) { throw 'Windows .NET Framework 4.x C# compiler is missing' }
$refs = @(
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.Web.Extensions.dll',
    ('/reference:"'+(Join-Path $root 'Microsoft.Web.WebView2.Core.dll')+'"'),
    ('/reference:"'+(Join-Path $root 'Microsoft.Web.WebView2.WinForms.dll')+'"')
)
& $csc /nologo /target:winexe /platform:x64 /optimize+ ('/out:"'+(Join-Path $root 'Aexus.exe')+'"') ('/win32icon:"'+(Join-Path $root 'Aexus.ico')+'"') $refs (Join-Path $root 'Windows\CloudHostsApp.cs') (Join-Path $root 'Windows\NativeRdp.cs') (Join-Path $root 'Windows\NativeRdpBridge.cs')
if ($LASTEXITCODE -ne 0) { throw 'CloudHosts Windows GUI compilation failed' }
& $csc /nologo /target:winexe /platform:x64 /optimize+ ('/out:"'+(Join-Path $root 'backend\Windows\ConPtyTerminal.exe')+'"') /reference:System.dll /reference:System.Core.dll /reference:System.Web.Extensions.dll (Join-Path $root 'backend\Windows\ConPtyTerminal.cs')
if ($LASTEXITCODE -ne 0) { throw 'CloudHosts Windows ConPTY compilation failed' }
& $csc /nologo /target:exe /platform:x64 /optimize+ ('/out:"'+(Join-Path $root 'backend\Windows\RdpCredentials.exe')+'"') /reference:System.dll /reference:System.Web.Extensions.dll (Join-Path $root 'backend\Windows\RdpCredentials.cs')
if ($LASTEXITCODE -ne 0) { throw 'CloudHosts Windows Credential Manager helper compilation failed' }
& $csc /nologo /target:winexe /platform:x64 /optimize+ ('/out:"'+(Join-Path $root 'CloudHostsSilentService.exe')+'"') /reference:System.dll (Join-Path $root 'Windows\CloudHostsSilentService.cs')
if ($LASTEXITCODE -ne 0) { throw 'Silent CloudHosts logon service compilation failed' }
Write-Output 'CLOUDHOSTS_WINDOWS_BUILD=PASS'
