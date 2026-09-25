export const SIDEBAR_MIN = 56, SIDEBAR_MAX = 96
export const THEMES = ['white','light','space','black','midnight','sage'] as const
export type Preferences = {theme:typeof THEMES[number];zoomSensitivity:number;panSensitivity:number;sidebarWidth:number;snapEmployees:boolean;pageZoom:number;explorerWidth:number;terminalHeight:number;defaultCodexModel:string;defaultClaudeModel:string}
export const DEFAULT_PREFERENCES:Preferences = {theme:'space',zoomSensitivity:2.5,panSensitivity:1,sidebarWidth:64,snapEmployees:true,pageZoom:1,explorerWidth:230,terminalHeight:220,defaultCodexModel:'',defaultClaudeModel:''}
export const THEME_LABELS:Record<Preferences['theme'],string> = {white:'纯白',light:'浅色',space:'深空灰',black:'纯黑',midnight:'深蓝',sage:'苔绿'}

export function normalizedSidebarWidth(value: number | undefined) { return value !== undefined && Number.isFinite(value) && value >= SIDEBAR_MIN && value <= SIDEBAR_MAX ? value : DEFAULT_PREFERENCES.sidebarWidth }
