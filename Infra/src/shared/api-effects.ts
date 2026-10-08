/** Native approval classification only. Unknown commands require write approval; Core authorization is independent. */
export const READ_ONLY_APIS=new Set(`
contract.info contract.describe contract.engines infra.api infra.scope workflow.list workflow.get workflow.events workflow.file workflow.prepare workflow.export
workspace.catalog conversation.entry conversation.download-status channel.post-trigger-list channel.post-trigger-history channel.post-trigger-batch
conversation.policy conversation.audit conversation.notice-list conversation.notice-get conversation.notice-preview conversation.notice-history
assets.browse assets.info assets.preview assets.tree assets.children assets.locate assets.search
status auth.whoami api.list api.describe api.docs avatar.list management.roles management.topology management.activity
system.info system.directories settings.get engine.list engine.check engine.capabilities engine.models engine.inspect engine.install-plan engine.install-status engine.login-status
session.list session.status session.info session.snapshot session.activity session.transcript session.inbox session.queue session.background session.search commands.list commands.complete
card.profile group.list office.layout room.layout canvas.view team-view.list connector.get
plan.schema plan.query plan.views plan.calendar plan.timeline plan.analytics plan.feed
schedule.schema schedule.status schedule.list schedule.get schedule.preview schedule.history
chat.list chat.get chat.history chat.context chat.file
channel.list channel.get channel.sources channel.history channel.context channel.timeline channel.read-state channel.posts channel.post channel.image channel.avatar-image channel.source-image channel.connection channel.collectors channel.collector-config channel.file-status
messenger.directory messenger.state messenger.search messenger.gallery messenger.reference messenger.forward-status messenger.social messenger.profile-image
workspace.list workspace.read workspace.image workspace.suggest conversation.workspace conversation.workspaces
plugin.list plugin.describe plugin.windows host.list host.get host.fingerprints host.terminal-list host.terminal-read host.desktop-list host.directories terminal.list terminal.read transfer.list transfer.get shared.info view.get view.list
`.trim().split(/\s+/))
export function apiReadOnly(command:string,args:Record<string,unknown>={}):boolean{
 if(command==='contract.call')return typeof args.command==='string'&&!args.command.startsWith('contract.')&&apiReadOnly(args.command,(args.args??{}) as Record<string,unknown>)
 if(command==='assets.naming')return !args.apply
 if(command==='conversation.file')return ['list','read','image','info','chunk'].includes(String(args.operation))
 if(command==='conversation.download-status')return !args.cancel
 if(command==='conversation.transfer')return !args.cancel
 if(command==='channel.settings')return args.patch===undefined
 return READ_ONLY_APIS.has(command)
}
export const RETIRED_APIS:Record<string,string>={
 'management.request':'management.bind','management.decide':'management.bind','management.team':'management.roles',
 'management.global':'card.management-role','config.engine':'card.create (new employee; existing engine stays fixed)'
}
