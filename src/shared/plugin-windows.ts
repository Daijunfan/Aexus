export type WindowBounds = {x:number;y:number;width:number;height:number}
export type PluginWindowState = {
  clientId?:string
  id:string
  plugin:string
  name:string
  workspace:string
  url:string
  bounds?:WindowBounds
  mode: 'normal'|'minimized'|'maximized'|'fullscreen'
  attached:boolean
  error?:string
}
