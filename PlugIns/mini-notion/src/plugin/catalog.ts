import { commands } from '../core/catalog';
/** Shared by packaging and the CLI contract-test gate. */
export const pluginCommands = commands.filter(command => !command.method.startsWith('agent.') && !['workspace.replace', 'backup.restore', 'backup.export'].includes(command.method));
