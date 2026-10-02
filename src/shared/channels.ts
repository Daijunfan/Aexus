import type {PrincipalRef} from './management'
import type {ChatDelivery,ChatAcknowledgmentPolicy} from './chat-groups'
/** Channel identity and administrator membership are independent of employee company roles. */
export const CHANNEL_PLUGINS=['telegram','x','youtube'] as const
export type ChannelPlugin=typeof CHANNEL_PLUGINS[number]
export const NEWS_RETENTION_MS=48*60*60*1000
export const CHANNEL_IMAGE_LIMIT=8*1024*1024
export type ChannelSettings={enabled:boolean;host:'127.0.0.1';port:number}
export type ChannelMedia={id:string;name:string;mimeType:string;bytes:number;sha256:string}
export type ChannelRecord={id:string;name:string;kind:ChannelPlugin|'custom';createdAt:number;updatedAt:number;adminIds:string[];revision:number}
export type ChannelSource={id:string;plugin:ChannelPlugin;targetId:string;locator:string;name:string;enabled:boolean;pollSeconds:number;channelId:string;createdAt:number;updatedAt:number;avatar?:{postId:string;mediaId:string};authorUrl?:string}
export type ChannelPost={sourceAvatar?:{sourceId:string;sha256:string};id:string;sourceId:string;externalId:string;channelId:string;sourceName:string;plugin:ChannelPlugin;title:string;body:string;url?:string;authorName?:string;authorUrl?:string;avatarMediaId?:string;publishedAt:number;receivedAt:number;updatedAt:number;expiresAt:number;contentHash:string;saved:boolean;savedAt?:number;media:ChannelMedia[]}
export type ChannelReadSummary={unreadCount:number;firstUnread?:{id:string;kind:'news'|'message'}}
export type ChannelReadEntry={id:string;state:'unread'|'read'|'unknown';readAt?:number}
export type ChannelReadState=ChannelReadSummary&{id:string;entries:ChannelReadEntry[]}
export type ChannelAcknowledgment=ChannelReadSummary&{acknowledged:true;id:string;acknowledgedCount:number;entryIds?:string[];all?:true}
export type ChannelView=ChannelRecord&ChannelReadSummary&{lastMessage?:Pick<ChannelMessage,'id'|'text'|'createdAt'|'authorName'|'author'>;avatar?:{sourceId:string;sha256:string};sourceCount:number;postCount:number;savedCount:number;lastPost?:Pick<ChannelPost,'id'|'title'|'publishedAt'|'sourceName'>}
export type ChannelPostPage={posts:ChannelPost[];nextCursor:string|null;total:number}
export type ChannelSaveResult=ChannelPost|{id:string;saved:false;expired:true}
export type ChannelSourceInput={plugin:ChannelPlugin;targetId?:string;locator:string;name?:string;enabled?:boolean;pollSeconds?:number;channelId?:string}
export type ChannelSourcePatch=Partial<Pick<ChannelSource,'name'|'locator'|'enabled'|'pollSeconds'|'channelId'>>
export type ChannelPublishInput={sourceId:string;externalId:string;publishedAt:number;title:string;body:string;url?:string;authorName?:string;authorUrl?:string;avatarMediaId?:string;mediaIds?:string[];contentHash?:string}
export type ChannelPublishResult={id:string;channelId:string;status:'created'|'updated'|'duplicate'|'deleted'|'expired';contentHash:string;expiresAt:number}
export type ChannelMediaInput={sourceId:string;externalId:string;publishedAt:number;mediaKey:string;name:string;mimeType:string;data:string}
export type CollectorTarget={sourceId:string;targetId:string;plugin:ChannelPlugin;locator:string;name:string;enabled:boolean;pollSeconds:number}
export type CollectorConfig={revision:number;changed:boolean;targets?:CollectorTarget[]}
export type ChannelCollector={id:string;name:string;sourceIds:'all'|string[];createdAt:number;revokedAt?:number}
export type ChannelEvent={kind:'settings'|'sources'|'posts'|'channels'|'messages'|'reads';revision:number;channelIds?:string[];postIds?:string[];messageIds?:string[];entryIds?:string[]}
export type ChannelFileRef={channelId:string;postId?:string;mediaId?:string;path?:string}

export type ChannelTaskContext={channelId:string;entryId:string}
export type ChannelMessage={id:string;channelId:string;sequence:number;createdAt:number;author:PrincipalRef;authorName:string;text:string;kind:'message'|'summary'|'decision'|'blocker'|'question'|'result';mentions:string[];replyTo?:string;requestId?:string;acknowledgmentOf?:string;deliveries:ChatDelivery[];clientMessageId:string;fingerprint:string}
export type ChannelHistory={messages:ChannelMessage[];nextBefore:number|null}
export type ChannelTimelineEntry={kind:'news';id:string;time:number;post:Omit<ChannelPost,'saved'|'savedAt'>}|{kind:'message';id:string;time:number;message:ChannelMessage}
export type ChannelTimeline={entries:ChannelTimelineEntry[];nextCursor:string|null;order:'chronological'}
export type ChannelContext={history:{command:'channel.timeline';args:{id:string;beforeEntry?:string};defaultLimit:number;maxLimit:number;kinds:string[]};channel:ChannelRecord;entry?:{kind:'news';post:ChannelPost}|{kind:'message';message:ChannelMessage};recentMessages:ChannelMessage[];deliveries?:ChatDelivery[];policy:{guidance:string;maxCharacters:number};acknowledgment?:ChatAcknowledgmentPolicy}
export type ChannelSourceAvatarInput={sourceId:string;name:string;mimeType:string;data:string}
