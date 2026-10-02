export const SIDEBAR_MIN = 56, SIDEBAR_MAX = 96
export const LANGUAGES=['en','zh-CN'] as const
export type InterfaceLanguage=typeof LANGUAGES[number]
export const COLOR_THEMES = ['violet','blue','mint','teal','cyan','rose','coral','amber','indigo','graphite','custom'] as const
export const THEMES = [...COLOR_THEMES,'white','light','space','black','midnight','sage'] as const
export const PRESENTATION_VIEWS=['company','messages','plan'] as const
export type PresentationView=typeof PRESENTATION_VIEWS[number]
export type ViewAppearance={theme:typeof THEMES[number];themeColor:string}
export type ViewAppearanceMap=Record<PresentationView,ViewAppearance>
export const DEFAULT_VIEW_APPEARANCE:ViewAppearanceMap={company:{theme:'white',themeColor:'#526dc3'},messages:{theme:'violet',themeColor:'#7953ce'},plan:{theme:'white',themeColor:'#526dc3'}}
export type Preferences = {language:InterfaceLanguage;defaultPermissionMode:'default'|'acceptEdits'|'bypassPermissions';theme:typeof THEMES[number];themeColor:string;viewAppearance:ViewAppearanceMap;zoomSensitivity:number;panSensitivity:number;sidebarWidth:number;snapEmployees:boolean;showTeamOverview:boolean;pageZoom:number;explorerWidth:number;terminalHeight:number;defaultCodexModel:string;defaultClaudeModel:string;defaultClineModel:string;defaultPiModel:string}
export type PreferencesPatch=Omit<Partial<Preferences>,'viewAppearance'>&{viewAppearance?:Partial<Record<PresentationView,Partial<ViewAppearance>>>}
export const DEFAULT_PREFERENCES:Preferences = {language:'en',defaultPermissionMode:'default',theme:'violet',themeColor:'#7953ce',viewAppearance:DEFAULT_VIEW_APPEARANCE,zoomSensitivity:2.5,panSensitivity:1,sidebarWidth:64,snapEmployees:true,showTeamOverview:false,pageZoom:1,explorerWidth:230,terminalHeight:220,defaultCodexModel:'',defaultClaudeModel:'',defaultClineModel:'deepseek-flash',defaultPiModel:'deepseek-flash'}
export const THEME_LABELS:Record<Preferences['theme'],string> = {violet:'Violet',blue:'Blue',mint:'Green',teal:'Teal',cyan:'Cyan',rose:'Rose',coral:'Coral',amber:'Amber',indigo:'Indigo',graphite:'Graphite',custom:'Custom color',white:'White',light:'Light',space:'Space gray',black:'Black',midnight:'Midnight blue',sage:'Sage'}

/** Legacy color fields remain Messages aliases; a partial edit never recolors another view. */
export function mergePreferences(current:Partial<Preferences>={},patch:PreferencesPatch={}):Preferences{
  const viewAppearance=Object.fromEntries(PRESENTATION_VIEWS.map(view=>[view,{
    ...DEFAULT_VIEW_APPEARANCE[view],
    ...(view==='messages'?{theme:current.theme??DEFAULT_PREFERENCES.theme,themeColor:current.themeColor??DEFAULT_PREFERENCES.themeColor}:{}),
    ...current.viewAppearance?.[view],
    ...(view==='messages'?{...(patch.theme!==undefined?{theme:patch.theme}:{}),...(patch.themeColor!==undefined?{themeColor:patch.themeColor}:{})}:{}),
    ...patch.viewAppearance?.[view]
  }])) as ViewAppearanceMap
  return {...DEFAULT_PREFERENCES,...current,...patch,viewAppearance,theme:viewAppearance.messages.theme,themeColor:viewAppearance.messages.themeColor}
}
export const resolveViewAppearance=(preferences?:Partial<Preferences>)=>mergePreferences(preferences).viewAppearance
export function presentationForView(view:{kind:string;returnTo?:{kind:string}}):PresentationView{
  const kind=view.kind==='messages'||view.kind==='plan'?view.kind:view.returnTo?.kind
  return kind==='messages'||kind==='plan'?kind:'company'
}

const appearanceSchema={type:'object',additionalProperties:false,properties:{theme:{enum:THEMES},themeColor:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}}}
export const PREFERENCES_PATCH_SCHEMA={type:'object',additionalProperties:false,properties:{
  language:{enum:LANGUAGES},defaultPermissionMode:{enum:['default','acceptEdits','bypassPermissions']},
  theme:{enum:THEMES,description:'Legacy alias for Messages appearance only'},themeColor:appearanceSchema.properties.themeColor,
  viewAppearance:{type:'object',additionalProperties:false,properties:Object.fromEntries(PRESENTATION_VIEWS.map(view=>[view,appearanceSchema])),description:'Partial per-view changes; omitted views and fields are retained'},
  zoomSensitivity:{type:'number',minimum:.25,maximum:8},panSensitivity:{type:'number',minimum:.25,maximum:4},sidebarWidth:{type:'number',minimum:SIDEBAR_MIN,maximum:SIDEBAR_MAX},
  snapEmployees:{type:'boolean'},showTeamOverview:{type:'boolean'},pageZoom:{type:'number',minimum:.75,maximum:1.5},explorerWidth:{type:'number',minimum:140,maximum:520},terminalHeight:{type:'number',minimum:120,maximum:600},
  ...Object.fromEntries(['defaultCodexModel','defaultClaudeModel','defaultClineModel','defaultPiModel'].map(key=>[key,{type:'string'}]))
}}

/** Preserve the chosen hue while keeping accent text readable on white cards. */
export function readableThemeAccent(color:string){
  const channels=[1,3,5].map(at=>parseInt(color.slice(at,at+2),16)),limit=1.05/4.5-.05
  const luminance=(scale:number)=>channels.reduce((sum,value,index)=>{const channel=value*scale/255;return sum+(channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4)*[.2126,.7152,.0722][index]},0)
  if(luminance(1)<=limit)return color
  let low=0,high=1
  for(let i=0;i<12;i++){const middle=(low+high)/2;if(luminance(middle)>limit)high=middle;else low=middle}
  return '#'+channels.map(value=>Math.floor(value*low).toString(16).padStart(2,'0')).join('')
}

export function normalizedSidebarWidth(value: number | undefined) { return value !== undefined && Number.isFinite(value) && value >= SIDEBAR_MIN && value <= SIDEBAR_MAX ? value : DEFAULT_PREFERENCES.sidebarWidth }
