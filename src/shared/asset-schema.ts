import {objectSchema,nonemptySchema,booleanSchema,textSchema} from './api-schema.ts'
import type {FileLocation} from './transfers'

export type AssetView='Company'|'Messages'|'Plan'
export type AssetOwner={view:AssetView;label:string;team?:string;employee?:string;employeeName?:string;conversation?:string;conversationName?:string}
export type AssetFilters={view?:AssetView;team?:string;employee?:string;conversation?:string;kind?:string;storage?:'local'|'remote'|'cloud';sort?:'name'|'modified'|'size'}
export type AssetFacets={teams:string[];employees:{id:string;name:string;team:string}[];conversations:{id:string;name:string;kind:'group'|'channel'}[]}
export type AssetTree=AssetNode&{facets:AssetFacets}
export type AssetLocation={node:AssetNode;workspace:AssetNode;parent:AssetNode;breadcrumbs:{id:string;name:string}[];canReveal:boolean}

export type AssetNode={id:string;name:string;label?:string;directory:boolean;locked:boolean;kind?:string;storage?:'local'|'remote'|'cloud';available?:boolean;external?:boolean;readOnly?:boolean;owner?:AssetOwner;location?:FileLocation;document?:{postId:string;fileId:string};children?:AssetNode[];nonemptyFolders?:number;fileCount?:number;indexing?:boolean;errors?:string[];bytes?:number;modifiedAt?:number;symlink?:boolean}
export type AssetPage={entries:AssetNode[];total:number;offset:number;indexing:boolean;errors:string[]}
const root=nonemptySchema,path=textSchema
const filters={view:{enum:['Company','Messages','Plan']},team:nonemptySchema,employee:nonemptySchema,conversation:nonemptySchema}
const searchFilters={...filters,kind:{enum:['all','document','image','audio','video','code','archive','other']},storage:{enum:['local','remote','cloud']},sort:{enum:['name','modified','size']}}

export const ASSET_COMMANDS=[
 {cli:{},name:'assets.naming',args:'[--id PREVIEW_ID --apply]',summary:'User-only: preview or apply English directory names across managed and externally bound workspaces, retaining identities and legacy references',gui:'English folder names',inputSchema:objectSchema({id:nonemptySchema,apply:booleanSchema})},
 {cli:{},name:'assets.tree',args:'[--view Company|Messages|Plan] [--team NAME] [--employee ID] [--conversation REF]',summary:'User-only: read the fixed Company, Messages and Plan workspace tree',gui:'Files and assets',inputSchema:objectSchema(filters)},
 {cli:{positionals:['id']},name:'assets.children',args:'ID [--hidden] [--offset N] [--limit N]',summary:'User-only: lazily page one real directory and its direct nonempty-folder count',gui:'Files and assets tree',inputSchema:objectSchema({...filters,id:root,hidden:booleanSchema,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:1000}},['id'])},
 {cli:{},name:'assets.search',args:'[--query TEXT] [--root ID] [--offset N] [--limit N] [--hidden] [--refresh] [--view Company|Messages|Plan] [--team NAME] [--employee ID] [--conversation REF] [--kind TYPE] [--storage local|remote|cloud] [--sort name|modified|size]',summary:'User-only: page background-indexed files with their Team, employee, group or channel ownership',gui:'Asset list',inputSchema:objectSchema({...searchFilters,query:textSchema,root,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:500},hidden:booleanSchema,refresh:booleanSchema})},
 {cli:{positionals:['id']},name:'assets.locate',args:'ID',summary:'User-only: resolve a current asset, its parent workspace and human-readable breadcrumbs without opening Finder or downloading cloud documents',gui:'Show in folder',inputSchema:objectSchema({id:root},['id'])},
 {cli:{positionals:['id'],required:['operation']},name:'assets.file',args:'ID --operation list|read|image|info|chunk|write|mkdir|move|trash|restore [--path PATH] [--to PATH] [--content TEXT] [--hash HASH] [--create] [--hidden] [--offset N] [--trash-id ID]',summary:'User-only: use existing workspace operations without changing scope or member permissions',gui:'Asset file editor',inputSchema:objectSchema({id:root,operation:{enum:['list','read','image','info','chunk','write','mkdir','move','trash','restore']},path,to:textSchema,content:{type:'string',maxLength:4194304},hash:textSchema,create:booleanSchema,hidden:booleanSchema,offset:{type:'integer',minimum:0},trashId:textSchema},['id','operation'])}
]
