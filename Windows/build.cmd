@echo off
setlocal enabledelayedexpansion
set "ROOT=%~dp0"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo Windows .NET Framework 4.x C# compiler is missing. 1>&2
  exit /b 1
)
"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /out:"%ROOT%CloudHosts.exe" /win32icon:"%ROOT%CloudHosts.ico" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:"%ROOT%Microsoft.Web.WebView2.Core.dll" /reference:"%ROOT%Microsoft.Web.WebView2.WinForms.dll" "%ROOT%Windows\CloudHostsApp.cs" "%ROOT%Windows\NativeRdp.cs" "%ROOT%Windows\NativeRdpBridge.cs"
if errorlevel 1 exit /b %errorlevel%
"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /out:"%ROOT%backend\Windows\ConPtyTerminal.exe" /reference:System.dll /reference:System.Core.dll /reference:System.Web.Extensions.dll "%ROOT%backend\Windows\ConPtyTerminal.cs"
if errorlevel 1 exit /b %errorlevel%
"%CSC%" /nologo /target:exe /platform:x64 /optimize+ /out:"%ROOT%backend\Windows\RdpCredentials.exe" /reference:System.dll /reference:System.Web.Extensions.dll "%ROOT%backend\Windows\RdpCredentials.cs"
if errorlevel 1 exit /b %errorlevel%
"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /out:"%ROOT%CloudHostsSilentService.exe" /reference:System.dll "%ROOT%Windows\\CloudHostsSilentService.cs"
if errorlevel 1 exit /b %errorlevel%
echo CLOUDHOSTS_WINDOWS_BUILD=PASS
exit /b 0
