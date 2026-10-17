#!/usr/bin/env python3
from pathlib import Path
import json, plistlib, shutil, subprocess, os

root=Path(__file__).resolve().parent
artifacts=root/'artifacts';artifacts.mkdir(exist_ok=True)
subprocess.run(['npm','run','build'],cwd=root,check=True)
bundle=artifacts/'Aexus.app'
if bundle.exists():shutil.rmtree(bundle)
macos=bundle/'Contents/MacOS';resources=bundle/'Contents/Resources'
macos.mkdir(parents=True);resources.mkdir()
subprocess.run(['swiftc','-swift-version','5','-parse-as-library','-O',str(root/'Engine/App.swift'),str(root/'Shared/ToolWindow.swift'),str(root/'Shared/ToolDock.swift'),'-framework','AppKit','-framework','SwiftUI','-framework','WebKit','-o',str(macos/'Aexus')],check=True)
node=(Path.home()/'.local/node-current/bin/node')
if not node.exists():node=Path(shutil.which('node'))
shutil.copy2(node.resolve(),resources/'node')
subprocess.run([str(resources/'node'),'--version'],check=True)
backend=resources/'backend';backend.mkdir()
for name in ['cli.cjs','schema.json','package.json','release.json','LICENSE','upstream.json']:
    shutil.copy2(root/name,backend/name)
for name in ['src','Runtime','dist','docs']:
    shutil.copytree(root/name,backend/name,ignore=shutil.ignore_patterns('__pycache__'))
# One internally owned Aexus Core under the backend, never a separate installed Aexus App.
aexus_source=root/'AgentBoard/Aexus'
if not (aexus_source/'out/main/daemon.js').is_file() or not (aexus_source/'out/renderer/index.html').is_file():
    raise RuntimeError('Aexus Node/Core/Web must build before packaging CloudHosts')
aexus_package=backend/'AgentBoard/Aexus'
aexus_package.parent.mkdir(parents=True,exist_ok=True)
def ignored(directory,names):
    excluded=shutil.ignore_patterns('node_modules','test','artifacts','release','.dist','dist','test-results','*.app','out-tsc','__pycache__','.DS_Store','*.tsbuildinfo','.git')(directory,names)
    if Path(directory)==aexus_source:excluded.add('PlugIns')
    if Path(directory)==aexus_source/'build':excluded.add('plugins')
    return excluded
shutil.copytree(aexus_source,aexus_package,ignore=ignored,symlinks=False)
# The same frozen npm lock drives the production dependency graph. No upgrades.
prod_dependencies=artifacts/'aexus-production-dependencies'
if prod_dependencies.exists():shutil.rmtree(prod_dependencies)
prod_dependencies.mkdir(parents=True)
for filename in ('package.json','package-lock.json'):
    shutil.copy2(aexus_source/filename,prod_dependencies/filename)
subprocess.run(['npm','ci','--omit=dev','--no-audit','--no-fund'],cwd=prod_dependencies,check=True,
    env={**os.environ,'npm_config_update_notifier':'false'})
shutil.move(str(prod_dependencies/'node_modules'),str(aexus_package/'node_modules'))
shutil.rmtree(prod_dependencies)
# node-pty 1.1.0 ships pinned Mach-O N-API prebuilds. npm optional-dependency
# installers can suppress postinstall, leaving the supplied spawn-helper mode
# 0644. The Core appears healthy until opening its first real terminal.
native_pty=aexus_package/'node_modules/node-pty/prebuilds'
if not native_pty.is_dir():raise RuntimeError('Required Aexus native terminal module is missing')
native_helpers=sorted(native_pty.glob('darwin-*/spawn-helper'))
if not native_helpers:raise RuntimeError('Required node-pty macOS spawn-helper prebuild missing')
for helper in native_helpers:
    if not helper.is_file() or helper.is_symlink():raise RuntimeError('Unsafe native PTY helper')
    helper.chmod(helper.stat().st_mode|0o111)
# Smoke the exact bundled Node ABI and executable in this candidate path.
pty_probe=r"""
const pty=require('node-pty');
const stream=pty.spawn('/bin/sh',['-c','printf AEXUS_PTY_NATIVE_OK'],{
  name:'xterm-256color',cwd:process.cwd(),cols:80,rows:24,
  env:{PATH:'/usr/bin:/bin',HOME:'/tmp',TERM:'xterm-256color'}
});
let output='',timer=setTimeout(()=>{stream.kill();process.exit(73)},5000);
stream.onData(part=>output+=part);
stream.onExit(({exitCode})=>{clearTimeout(timer);
  if(exitCode!==0||!output.includes('AEXUS_PTY_NATIVE_OK'))process.exit(74);
  console.log('AEXUS_PACKAGED_NATIVE_PTY_PASS');
});
"""
subprocess.run([str(resources/'node'),'-e',pty_probe],cwd=aexus_package,check=True,timeout=9)

for relative in ('out/main/daemon.js','out/main/asset-index-worker.js','out/main/message-index-worker.js','out/renderer/index.html'):
    if not (aexus_package/relative).is_file():raise RuntimeError('Packaged Aexus resource missing: '+relative)

for name in ['ws','jsbi']:
    shutil.copytree(root/'node_modules'/name,backend/'node_modules'/name)
(backend/'node_modules'/'@js-temporal').mkdir()
shutil.copytree(root/'node_modules'/'@js-temporal'/'polyfill',backend/'node_modules'/'@js-temporal'/'polyfill')
shutil.copy2(root/'Assets/Aexus.icns',resources/'Aexus.icns')
shutil.copy2(root/'Assets/Aexus.png',artifacts/'icon.png')
# Modern app icon: compile the approved Icon Composer source into an asset
# catalog so macOS renders it without the white backplate a plain icns gets.
# Compile into a staging dir (not Resources) so actool's generated icns never
# overwrites the legacy Assets/Aexus.icns fallback above; only Assets.car is
# installed, alongside CFBundleIconName below.
icon_stage=artifacts/'aexus-icon-stage'
if icon_stage.exists():shutil.rmtree(icon_stage)
icon_stage.mkdir(parents=True)
subprocess.run(['xcrun','actool',str(root/'Assets/Aexus.icon'),'--compile',str(icon_stage),
    '--platform','macosx','--minimum-deployment-target','13.0','--app-icon','Aexus',
    '--output-partial-info-plist',str(icon_stage/'icon-info.plist')],check=True)
shutil.copy2(icon_stage/'Assets.car',resources/'Assets.car')
release_version=json.loads((root/'package.json').read_text())['version']
release_id=json.loads((root/'release.json').read_text())['buildId']
with (bundle/'Contents/Info.plist').open('wb') as f:
    plistlib.dump({'CFBundleIdentifier':'com.agentscompany.app','CFBundleName':'Aexus','CFBundleDisplayName':'Aexus','CFBundleExecutable':'Aexus','CFBundlePackageType':'APPL','CFBundleShortVersionString':release_version.split('-')[0],'CFBundleVersion':'57','CFBundleGetInfoString':release_version+' · '+release_id[:12],'CloudHostsBuildID':release_id,'CFBundleIconFile':'Aexus','CFBundleIconName':'Aexus','NSPrincipalClass':'NSApplication','LSUIElement':True,'NSHighResolutionCapable':True,'NSAppTransportSecurity':{'NSAllowsLocalNetworking':True}},f)
# The existing CloudHosts release uses an ad-hoc signature. Keep that
# self-contained identity instead of depending on another Toolbox app's keychain.
subprocess.run(['codesign','--force','--sign','-','--identifier','com.agentscompany.app.node',str(resources/'node')],check=True)
subprocess.run(['codesign','--force','--sign','-','--identifier','com.agentscompany.app',str(bundle)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(bundle)],check=True)
print(bundle)
