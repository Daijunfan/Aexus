"""Session-only configuration for the original local CLI processes."""
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys
import uuid

from commands import ROOT
from remote import TOOLS

NAMES = [tool['name'] for tool in TOOLS]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)


def guard(event):
    name = event.get('tool_name') or event.get('tool_call', {}).get('name', '')
    allowed = (any(name == 'mcp__tunnel__' + tool for tool in NAMES)
               or bool(re.fullmatch(r'(?:mcp[_:.]+)?tunnel[_:.]+(' + '|'.join(NAMES) + ')', name))
               or name in ['update_plan', 'request_user_input', 'ask_question', 'submit_and_exit'])
    if event.get('hookName') == 'agent_start':
        return {'context': 'All workspace tools are connected to the configured working environment. Use tunnel tools for every command and file operation. Use only these workspace tools; do not start other agents.'}
    if 'hookName' in event:
        return {} if allowed else {'cancel': True, 'errorMessage': 'Use the configured workspace tools for this operation.'}
    return {'hookSpecificOutput': {'hookEventName': 'PreToolUse',
            'permissionDecision': 'allow' if allowed else 'deny',
            'permissionDecisionReason': 'Only the connected workspace tools are enabled in Tunnel mode.'}}


def prepare(agent, cfg, native, session=None):
    # Reject arguments that explicitly disable the route or replace its tool configuration.
    forbidden = {'--safe-mode', '--tools', '--settings', '--setting-sources', '--mcp-config',
                 '--plugin-dir', '--hooks-dir', '--worktree', '-w', '--zen', '-z', '--remote', '--cwd', '--cd', '-C'}
    for index, arg in enumerate(native):
        if arg.split('=', 1)[0] in forbidden or 'features.hooks=false' in arg or 'disableAllHooks' in arg:
            raise ValueError('Option conflicts with Tunnel routing: ' + arg)
        option, _, value = arg.partition('=')
        if not value and index + 1 < len(native):
            value = native[index + 1]
        if agent == 'cline' and option in ['--config', '--data-dir', '-c']:
            raise ValueError('Use the profile cline_config field; Tunnel owns the local session directory')
        if option == '--disable' and value == 'hooks':
            raise ValueError('Tunnel requires its routing Hooks')
        if agent == 'codex' and option in ['-c', '--config'] and any(
                key in value for key in ['hooks', 'mcp_servers', 'features.shell_tool']):
            raise ValueError('Do not replace Tunnel tool configuration')
    if '--disable' in native and any(flag in native for flag in ['hooks', 'shell_tool']):
        raise ValueError('Do not override Tunnel tool controls')
    session = Path(session) if session else ROOT / '.tunnel/sessions' / uuid.uuid4().hex
    session.mkdir(parents=True, mode=0o700, exist_ok=True)
    config_path = session / 'target.json'
    write_json(config_path, cfg)
    server = {'command': sys.executable, 'args': [str(ROOT/'tunnel.py'), '_serve', str(config_path)]}
    os_name = {'linux': 'Linux', 'macos': 'macOS', 'windows': 'Windows'}[cfg['os']]
    environment = ("Your work runs on a cloud host. "
                   "Use the provided tunnel MCP APIs for all commands and file operations. "
                   f"Cloud operating system: {os_name}.")
    (session/'AGENTS.md').write_text(environment+'\n')
    (session/'CLAUDE.md').write_text(environment+'\n')
    hook = shlex.join([sys.executable, str(ROOT/'tunnel.py'), '_guard'])
    hooks = {'PreToolUse': [{'matcher': '', 'hooks': [{'type': 'command', 'command': hook, 'timeout': 10}]}]}
    env = os.environ.copy()
    if agent == 'claude':
        settings = session/'settings.json'
        write_json(settings, {'hooks': hooks})
        mcp = session/'mcp.json'
        write_json(mcp, {'mcpServers': {'tunnel': server}})
        args = ['--tools', '', '--strict-mcp-config', '--mcp-config', str(mcp),
                '--settings', str(settings), '--allowedTools', 'mcp__tunnel__*']
    elif agent == 'codex':
        write_json(session/'.codex/hooks.json', {'hooks': hooks})
        # Set the MCP connection via per-invocation config; keep model/auth settings unchanged.
        args = ['--dangerously-bypass-hook-trust', '--enable', 'hooks', '--disable', 'shell_tool', '-c', 'web_search="disabled"',
                '-c', 'developer_instructions='+json.dumps(environment),
                '-c', 'mcp_servers.tunnel.command='+json.dumps(server['command']),
                '-c', 'mcp_servers.tunnel.args='+json.dumps(server['args']),
                '-c', 'mcp_servers.tunnel.required=true',
                '-c', 'mcp_servers.tunnel.default_tools_approval_mode="approve"',
                '-c', 'mcp_servers.tunnel.enabled_tools='+json.dumps(NAMES)]
    else:
        # Cline's --config and --data-dir isolate settings/state without changing ~/.cline.
        home = session/'cline-home'
        settings = home/'data/settings'
        settings.mkdir(parents=True)
        original = Path(cfg.get('cline_config', str(Path.home()/'.cline')))/'data/settings'
        for name in ['providers.json', 'models.json']:
            if (original/name).exists():
                shutil.copy2(original/name, settings/name)
                (settings/name).chmod(0o600)
        write_json(settings/'global-settings.json', {
            'autoUpdateEnabled': False, 'telemetryOptOut': True,
            'disabledTools': ['read_files', 'search_codebase', 'run_commands', 'fetch_web_content',
                              'apply_patch', 'editor', 'skills'], 'tools': {'web_search': {'enabled': False}}})
        write_json(settings/'cline_mcp_settings.json', {'mcpServers': {'tunnel': server}})
        directory = session/'.cline/hooks'
        directory.mkdir(parents=True)
        for event in ['PreToolUse']:
            path = directory/event
            path.write_text('#!/bin/sh\nexec ' + hook + '\n')
            path.chmod(0o755)
        args = ['--config', str(home), '--data-dir', str(home/'data'), '--hooks-dir', str(directory)]
        env['CLINE_SESSION_BACKEND_MODE'] = 'local'
    return session, args + native, env
