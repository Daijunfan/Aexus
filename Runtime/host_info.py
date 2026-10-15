import ipaddress
import json
import os
import platform
import re
import shutil
import subprocess
import time
from pathlib import Path


def command(args):
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=5).strip()
    except subprocess.CalledProcessError as error:
        return (error.output or '').strip() if args[0] == 'systemd-detect-virt' else ''
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ''


def read(path):
    try:
        return Path(path).read_text().strip()
    except OSError:
        return ''


def address(value, prefix, family):
    return dict(address=value, prefix=prefix, family=family, cidr=str(ipaddress.ip_interface(value + '/' + str(prefix)).network))


system = dict(hostname=platform.node(), os=platform.system(), version=platform.release(), kernel=platform.version())
interfaces, routes, gpus, storage = [], [], [], []
performance = dict(load=list(os.getloadavg()))
if platform.system() == 'Linux':
    pairs = [line.split(':', 1) for line in read('/proc/cpuinfo').splitlines() if ':' in line]
    cpu = next((value.strip() for name, value in pairs if name.strip() == 'model name'), platform.machine())
    mem = {line.split(':')[0]: int(line.split()[1]) / 1024 for line in read('/proc/meminfo').splitlines() if line.endswith('kB')}
    memory = dict(totalMB=round(mem['MemTotal']), availableMB=round(mem.get('MemAvailable', mem.get('MemFree', 0))))
    topology = json.loads(command(['lscpu', '-J']) or '{"lscpu":[]}')
    details = {row['field'].rstrip(':'): row['data'] for row in topology['lscpu']}
    sockets = int(details.get('Socket(s)', 1))
    cpu_details = dict(models=[cpu], sockets=sockets, physicalCores=int(details.get('Core(s) per socket', os.cpu_count())) * sockets, logicalCores=os.cpu_count())
    system.update(manufacturer=read('/sys/class/dmi/id/sys_vendor'), model=read('/sys/class/dmi/id/product_name'), uptimeSeconds=float(read('/proc/uptime').split()[0]))
    os_release = dict(line.split('=', 1) for line in read('/etc/os-release').splitlines() if '=' in line)
    system['version'] = os_release.get('PRETTY_NAME', platform.release()).strip('"')
    signals = dict(manufacturer=system['manufacturer'], model=system['model'], bios=read('/sys/class/dmi/id/bios_vendor'), hypervisor=command(['systemd-detect-virt', '--vm']), container=command(['systemd-detect-virt', '--container']), hypervisorPresent=bool(re.search(r'\bhypervisor\b', read('/proc/cpuinfo'))))
    dns = re.findall(r'^nameserver\s+(\S+)', read('/etc/resolv.conf'), re.M)
    for link in json.loads(command(['ip', '-j', 'address', 'show']) or '[]'):
        if link['ifname'] == 'lo':
            continue
        addresses = [address(a['local'], a['prefixlen'], a['family']) for a in link.get('addr_info', []) if a.get('scope') == 'global']
        speed = read('/sys/class/net/' + link['ifname'] + '/speed')
        interfaces.append(dict(name=link['ifname'], status=link.get('operstate'), mac=link.get('address'), mtu=link.get('mtu'), speedMbps=int(speed) if speed.isdigit() else None, addresses=addresses, dns=dns))
    for family in ['-4', '-6']:
        for route in json.loads(command(['ip', '-j', family, 'route', 'show', 'default']) or '[]'):
            routes.append(dict(interface=route.get('dev'), gateway=route.get('gateway'), family='IPv4' if family == '-4' else 'IPv6', metric=route.get('metric')))
    def ticks():
        values = list(map(int, read('/proc/stat').splitlines()[0].split()[1:9]))
        return sum(values), values[3] + values[4]
    total, idle = ticks()
    time.sleep(0.2)
    end_total, end_idle = ticks()
    performance['cpuPercent'] = round(100 * (1 - (end_idle - idle) / max(1, end_total - total)), 1)
    for line in command(['nvidia-smi', '--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits']).splitlines():
        name, total, used, utilization, temperature = [v.strip() for v in line.split(',')]
        number = lambda v: float(v) if re.fullmatch(r'[0-9.]+', v) else None
        gpus.append(dict(name=name, memoryMB=number(total), usedMB=number(used), utilization=number(utilization), temperature=number(temperature)))
    for drive in json.loads(command(['findmnt', '-J', '-o', 'TARGET,FSTYPE', '--list']) or '{"filesystems":[]}')['filesystems']:
        if drive.get('fstype') in ['ext4', 'xfs', 'btrfs', 'zfs', 'vfat', 'ntfs', 'fuseblk']:
            usage = shutil.disk_usage(drive['target'])
            storage.append(dict(mount=drive['target'], filesystem=drive['fstype'], totalGB=round(usage.total / 1024**3, 1), freeGB=round(usage.free / 1024**3, 1)))
else:
    def sysctl(name):
        return command(['sysctl', '-n', name])
    cpu = sysctl('machdep.cpu.brand_string') or platform.machine()
    cpu_details = dict(models=[cpu], physicalCores=int(sysctl('hw.physicalcpu')), logicalCores=int(sysctl('hw.logicalcpu')), sockets=1)
    total = int(sysctl('hw.memsize')) / 1024**2
    vm = command(['vm_stat'])
    page_size = int(re.search(r'page size of (\d+)', vm)[1])
    counters = dict((name, int(value)) for name, value in re.findall(r'^(.+):\s+(\d+)\.', vm, re.M))
    available = sum(counters.get(name, 0) for name in ['Pages free', 'Pages inactive', 'Pages speculative']) * page_size / 1024**2
    memory = dict(totalMB=round(total), availableMB=round(available))
    model = sysctl('hw.model')
    system.update(manufacturer='Apple', model=model, version=command(['sw_vers', '-productVersion']))
    signals = dict(manufacturer='Apple', model=model, bios='', hypervisor='apple' if model.startswith('VirtualMac') else '', container='', hypervisorPresent=False)
    for block in re.split(r'\n(?=\S)', command(['ifconfig'])):
        name = block.split(':', 1)[0]
        if name == 'lo0':
            continue
        addresses = [address(ip, int(mask, 16).bit_count(), 'inet') for ip, mask in re.findall(r'inet ([0-9.]+) netmask (0x[0-9a-f]+)', block)]
        mac = re.search(r'ether (\S+)', block)
        interfaces.append(dict(name=name, status='UP' if 'status: active' in block else 'DOWN', mac=mac[1] if mac else '', addresses=addresses, dns=[]))
    default = command(['route', '-n', 'get', 'default'])
    gateway = re.search(r'gateway:\s+(\S+)', default)
    interface = re.search(r'interface:\s+(\S+)', default)
    if gateway:
        routes.append(dict(interface=interface[1] if interface else '', gateway=gateway[1], family='IPv4'))
    dns = list(dict.fromkeys(re.findall(r'nameserver\[\d+\]\s*:\s*(\S+)', command(['scutil', '--dns']))))
    for interface in interfaces:
        interface['dns'] = dns
    usage = shutil.disk_usage('/')
    storage.append(dict(mount='/', totalGB=round(usage.total / 1024**3, 1), freeGB=round(usage.free / 1024**3, 1)))

memory['usedPercent'] = round(100 * (1 - memory['availableMB'] / memory['totalMB']), 1)
networks = [dict(name=i['name'], **a) for i in interfaces for a in i['addresses']]
print(json.dumps(dict(cpu=cpu, cores=cpu_details['logicalCores'], memoryMB=memory['totalMB'], model=system.get('model'), cpuDetails=cpu_details, memory=memory, performance=performance, system=system, interfaces=interfaces, networks=networks, routes=routes, gpus=gpus, storage=storage, virtualSignals=signals)))
