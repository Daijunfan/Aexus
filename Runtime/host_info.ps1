$system=Get-CimInstance Win32_ComputerSystem
$os=Get-CimInstance Win32_OperatingSystem
$bios=Get-CimInstance Win32_BIOS
$cpus=@(Get-CimInstance Win32_Processor)
$interfaces=@(Get-NetAdapter | ForEach-Object {
 $adapter=$_
 $ips=@(Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress -notmatch '^(127\.|169\.254\.|fe80:|::1$)'} | ForEach-Object {
  $ip=[Net.IPAddress]::Parse($_.IPAddress);$bytes=$ip.GetAddressBytes();$remaining=$_.PrefixLength
  for($i=0;$i -lt $bytes.Length;$i++){$bits=[Math]::Min(8,[Math]::Max(0,$remaining));$bytes[$i]=$bytes[$i] -band (256-[Math]::Pow(2,8-$bits));$remaining-=8}
  [pscustomobject]@{address=$_.IPAddress;prefix=$_.PrefixLength;family=if($_.AddressFamily -eq 'IPv4'){'inet'}else{'inet6'};cidr=([Net.IPAddress]::new([byte[]]$bytes)).ToString()+'/'+$_.PrefixLength}
 })
 $dns=@(Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue | ForEach-Object {$_.ServerAddresses})
 $ipv4=Get-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
 [pscustomobject]@{name=$adapter.Name;description=$adapter.InterfaceDescription;status=[string]$adapter.Status;mac=$adapter.MacAddress;speed=$adapter.LinkSpeed;mtu=$ipv4.NlMtu;dhcp=[string]$ipv4.Dhcp;addresses=$ips;dns=$dns}
})
$routes=@(Get-NetRoute -ErrorAction SilentlyContinue | Where-Object {$_.DestinationPrefix -in @('0.0.0.0/0','::/0')} | ForEach-Object {[pscustomobject]@{interface=$_.InterfaceAlias;gateway=$_.NextHop;metric=$_.RouteMetric;family=[string]$_.AddressFamily}})
$networks=@(foreach($interface in $interfaces){foreach($ip in $interface.addresses){[pscustomobject]@{name=$interface.name;address=$ip.address;prefix=$ip.prefix;cidr=$ip.cidr;family=$ip.family}}})
$edition=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').EditionID
$rdp=(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server').fDenyTSConnections -eq 0
$total=[math]::Round($system.TotalPhysicalMemory/1MB)
$available=[math]::Round($os.FreePhysicalMemory/1024)
[pscustomobject]@{
 cpu=($cpus.Name -join ' / ');cores=$system.NumberOfLogicalProcessors;memoryMB=$total;model=$system.Model
 cpuDetails=[pscustomobject]@{models=@($cpus.Name);sockets=$cpus.Count;physicalCores=($cpus|Measure-Object NumberOfCores -Sum).Sum;logicalCores=$system.NumberOfLogicalProcessors}
 memory=[pscustomobject]@{totalMB=$total;availableMB=$available;usedPercent=[math]::Round(100*(1-$available/$total),1)}
 performance=[pscustomobject]@{cpuPercent=($cpus|Measure-Object LoadPercentage -Average).Average}
 system=[pscustomobject]@{hostname=$system.Name;os=$os.Caption;version=$os.Version;kernel=$os.BuildNumber;manufacturer=$system.Manufacturer;model=$system.Model;uptimeSeconds=[math]::Round(((Get-Date)-$os.LastBootUpTime).TotalSeconds)}
 interfaces=$interfaces;networks=$networks;routes=$routes
 gpus=@(Get-CimInstance Win32_VideoController | ForEach-Object {[pscustomobject]@{name=$_.Name;memoryMB=[math]::Round($_.AdapterRAM/1MB)}})
 storage=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {[pscustomobject]@{mount=$_.DeviceID;filesystem=$_.FileSystem;totalGB=[math]::Round($_.Size/1GB,1);freeGB=[math]::Round($_.FreeSpace/1GB,1)}})
 virtualSignals=[pscustomobject]@{manufacturer=$system.Manufacturer;model=$system.Model;bios=($bios.Manufacturer+' '+$bios.SMBIOSBIOSVersion);hypervisorPresent=$system.HypervisorPresent;hypervisor='';container=''}
 remoteDesktop=[pscustomobject]@{supported=$edition -notmatch '^Core';enabled=$rdp;edition=$edition;service=[string](Get-Service TermService -ErrorAction SilentlyContinue).Status}
}|ConvertTo-Json -Depth 8 -Compress
