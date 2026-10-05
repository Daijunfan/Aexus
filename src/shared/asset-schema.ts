import {objectSchema,nonemptySchema,booleanSchema,textSchema} from './api-schema.ts'
import type {AvatarKind} from './office'
import type {FileLocation} from './transfers'

export type AssetView='Company'|'Messages'|'Plan'
export type AssetHost={id:string;name:string;os?:'linux'|'macos'|'windows';distribution?:string;kind:'local'|'remote'}
export type AssetOwner={avatar?:AvatarKind;color?:string;view:AssetView;label:string;team?:string;employee?:string;employeeName?:string;conversation?:string;conversationName?:string}
export type AssetFilters={host?:string;view?:AssetView;team?:string;employee?:string;conversation?:string;kind?:string;storage?:'local'|'remote'|'cloud';sort?:'name'|'modified'|'size'}
export type AssetFacets={hosts?:AssetHost[];teams:string[];employees:{id:string;name:string;team:string}[];conversations:{id:string;name:string;kind:'group'|'channel'}[]}
export type AssetTree=AssetNode&{facets:AssetFacets}
export type AssetLocation={node:AssetNode;workspace:AssetNode;parent:AssetNode;breadcrumbs:{id:string;name:string}[];canReveal:boolean}

export type AssetInfo={node:AssetNode;host?:AssetHost;physicalPath?:string;workspacePath?:string;address?:string;port?:number;verified:'local'|'remote'|'metadata'|'virtual';exists?:boolean;createdAt?:number;modifiedAt?:number;bytes?:number;fileCount?:number;readOnly:boolean;logicalLocation:string[];note?:string}
export type AssetPreview={kind:'image'|'fallback';mimeType?:string;data?:string;width?:number;height?:number;pageCount?:number;reason?:string;version?:string}
export type AssetBrowse={entries:AssetNode[];total:number;nextOffset:number|null;indexing:boolean;errors:string[];breadcrumbs:{id:string;name:string}[];parent:AssetNode}
export type AssetNode={host?:AssetHost;id:string;name:string;label?:string;directory:boolean;locked:boolean;kind?:string;storage?:'local'|'remote'|'cloud';available?:boolean;external?:boolean;readOnly?:boolean;owner?:AssetOwner;location?:FileLocation;document?:{postId:string;fileId:string};children?:AssetNode[];nonemptyFolders?:number;fileCount?:number;indexing?:boolean;errors?:string[];bytes?:number;modifiedAt?:number;symlink?:boolean}
export type AssetPage={entries:AssetNode[];total:number;offset:number;indexing:boolean;errors:string[]}
const root=nonemptySchema,path=textSchema
const filters={host:nonemptySchema,view:{enum:['Company','Messages','Plan']},team:nonemptySchema,employee:nonemptySchema,conversation:nonemptySchema}
const searchFilters={...filters,kind:{enum:['folder','all','document','image','audio','video','code','archive','other']},storage:{enum:['local','remote','cloud']},sort:{enum:['name','modified','size']}}

export const ASSET_COMMANDS=[
 {cli:{},name:'assets.browse',args:'[--root ID --query TEXT --view Company|Messages|Plan --team NAME --employee ID --conversation REF --host ID --kind TYPE --storage local|remote|cloud --sort name|modified|size --offset N --limit N --hidden]',summary:'User-only: page real workspace shelves, one folder or recursive file/folder search with stable IDs and ownership; no implicit cloud download',gui:'File library',inputSchema:objectSchema({...searchFilters,root,query:textSchema,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:200},hidden:booleanSchema})},
 {cli:{positionals:['id']},name:'assets.info',args:'ID',summary:'User-only: explicitly inspect a file/folder physical path, storage host, metadata and logical ownership. Cloud-only items return metadata without downloading originals.',gui:'Get Info',inputSchema:objectSchema({id:root},['id'])},
 {cli:{positionals:['id']},name:'assets.preview',args:'ID',summary:'User-only: derive a bounded local PDF, article or image cover with the installed Reader renderer; never fetch remote originals or mutate files',gui:'Document cover',inputSchema:objectSchema({id:root},['id'])},
 {cli:{},name:'assets.naming',args:'[--id PREVIEW_ID --apply]',summary:'User-only: preview or apply English directory names across managed and externally bound workspaces, retaining identities and legacy references',gui:'English folder names',inputSchema:objectSchema({id:nonemptySchema,apply:booleanSchema})},
 {cli:{},name:'assets.tree',args:'[--view Company|Messages|Plan] [--team NAME] [--employee ID] [--conversation REF]',summary:'User-only: read the fixed Company, Messages and Plan workspace tree',gui:'Files and assets',inputSchema:objectSchema(filters)},
 {cli:{positionals:['id']},name:'assets.children',args:'ID [--hidden] [--offset N] [--limit N]',summary:'User-only: lazily page one real directory and its direct nonempty-folder count',gui:'Files and assets tree',inputSchema:objectSchema({...filters,sort:{enum:['name','modified','size']},id:root,hidden:booleanSchema,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:1000}},['id'])},
 {cli:{},name:'assets.search',args:'[--query TEXT] [--root ID] [--offset N] [--limit N] [--hidden] [--refresh] [--view Company|Messages|Plan] [--team NAME] [--employee ID] [--conversation REF] [--kind TYPE] [--storage local|remote|cloud] [--sort name|modified|size]',summary:'User-only: page background-indexed files with their Team, employee, group or channel ownership',gui:'Asset list',inputSchema:objectSchema({...searchFilters,query:textSchema,root,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:500},hidden:booleanSchema,refresh:booleanSchema,folders:booleanSchema})},
 {cli:{positionals:['id']},name:'assets.locate',args:'ID',summary:'User-only: resolve a current asset, its parent workspace and human-readable breadcrumbs without opening Finder or downloading cloud documents',gui:'Show in folder',inputSchema:objectSchema({id:root},['id'])},
 {cli:{positionals:['id'],required:['operation']},name:'assets.file',args:'ID --operation list|read|image|info|chunk|write|mkdir|move|trash|restore [--path PATH] [--to PATH] [--content TEXT] [--hash HASH] [--create] [--hidden] [--offset N] [--trash-id ID]',summary:'User-only: use existing workspace operations without changing scope or member permissions',gui:'Asset file editor',inputSchema:objectSchema({id:root,operation:{enum:['list','read','image','info','chunk','write','mkdir','move','trash','restore']},path,to:textSchema,content:{type:'string',maxLength:4194304},hash:textSchema,create:booleanSchema,hidden:booleanSchema,offset:{type:'integer',minimum:0},trashId:textSchema},['id','operation'])}
]
