# Run once from an elevated PowerShell. Bundle: openssh.zip, python.zip,
# codex.tgz and authorized_key.pub beside this script. Contains no passwords.
$ErrorActionPreference = 'Stop'
$root = 'C:\ProgramData\AgentsCompany'
$report = @{ stage = 'starting' }
function Publish-Report {
    $json = $report | ConvertTo-Json -Compress -Depth 5
    Set-Content -LiteralPath "$root\bootstrap-result.json" -Value $json -Encoding UTF8
    try {
        $serial = New-Object System.IO.Ports.SerialPort COM1,115200,None,8,one
        $serial.Open(); $serial.WriteLine('AGENTS_COMPANY_BOOTSTRAP ' + $json); $serial.Close()
    } catch {}
}
New-Item -ItemType Directory -Force -Path $root | Out-Null
try {
    $ssh = "$env:ProgramFiles\OpenSSH"
    if (!(Test-Path "$ssh\sshd.exe")) {
        Expand-Archive -LiteralPath "$PSScriptRoot\openssh.zip" -DestinationPath "$root\stage" -Force
        Move-Item -LiteralPath "$root\stage\OpenSSH-Win64" -Destination $ssh
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$ssh\install-sshd.ps1"
        if ($LASTEXITCODE -ne 0) { throw 'OpenSSH service installation failed' }
    }
    $python = "$root\python"
    Expand-Archive -LiteralPath "$PSScriptRoot\python.zip" -DestinationPath $python -Force
    $codex = "$root\codex"
    New-Item -ItemType Directory -Force -Path $codex | Out-Null
    & tar.exe -xzf "$PSScriptRoot\codex.tgz" -C $codex
    if ($LASTEXITCODE -ne 0) { throw 'Codex extraction failed' }
    $vendor = "$codex\package\vendor\x86_64-pc-windows-msvc"
    $bin = "$vendor\bin"
    $machinePath = [Environment]::GetEnvironmentVariable('Path','Machine')
    foreach ($entry in @($python,$bin,"$vendor\codex-path")) { if ($machinePath.Split(';') -notcontains $entry) { $machinePath += ';' + $entry } }
    [Environment]::SetEnvironmentVariable('Path',$machinePath,'Machine')
    $env:Path = $machinePath + ';' + [Environment]::GetEnvironmentVariable('Path','User')
    New-Item -ItemType Directory -Force -Path "$env:ProgramData\ssh" | Out-Null
    $keys = "$env:ProgramData\ssh\administrators_authorized_keys"
    $key = (Get-Content -LiteralPath "$PSScriptRoot\authorized_key.pub" -Raw).Trim()
    if (!(Test-Path $keys) -or (Get-Content -LiteralPath $keys) -notcontains $key) { Add-Content -LiteralPath $keys -Value $key -Encoding ASCII }
    & icacls.exe $keys /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F' | Out-Null
    New-Item -Path HKLM:\SOFTWARE\OpenSSH -Force | Out-Null
    New-ItemProperty -Path HKLM:\SOFTWARE\OpenSSH -Name DefaultShell -Value "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null
    if (!(Get-NetFirewallRule -Name AgentsCompany-SSH -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name AgentsCompany-SSH -DisplayName 'Agents Company SSH via VM gateway' -Direction Inbound -Protocol TCP -LocalPort 22 -RemoteAddress 10.0.2.2 -Action Allow | Out-Null
    }
    Set-Service sshd -StartupType Automatic
    Start-Service sshd
    New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE AgentsCompany) | Out-Null
    $report = @{ stage='ready'; host=$env:COMPUTERNAME; shell=$PSVersionTable.PSVersion.ToString(); python=(& "$python\python.exe" --version); codex=(& "$bin\codex.exe" --version); hostKey=(Get-Content "$env:ProgramData\ssh\ssh_host_ed25519_key.pub" -Raw).Trim() }
} catch { $report = @{ stage='failed'; error=$_.Exception.Message; position=$_.InvocationInfo.PositionMessage } }
Publish-Report
