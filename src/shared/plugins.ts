export type PluginManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  runtime: string;
  renderer: string;
  cli: string;
  documentation: string;
  schema: string;
  autoAttach?: boolean;
  workspaceDirectory?: string;
  /** User default view: isolated default folder or the plugin's workspace collection. */
  defaultWorkspace?: 'default'|'collection';
  scope?: 'workspace'|'application';
  license?: string;
};
export type PluginDescriptor = PluginManifest & { directory: string };
export type PluginRequest = { jsonrpc:'2.0';id:string|number;method:string;params?:Record<string,unknown>;stateMode?:'full'|'delta'|'none' };
export type PluginResponse = { jsonrpc:'2.0';id:string|number;result?:any;error?:{code:number;message:string;data?:unknown};[key:string]:unknown };
export type PluginRuntime = {
  request(request:PluginRequest):Promise<PluginResponse>;
  subscribe?(listener:(event:unknown)=>void,options?:{stateMode?:'full'|'delta';initialState?:boolean}):Promise<()=>void>;
  readAsset?(path:string):Promise<{bytes:Uint8Array;mimeType:string}>;
  close?():void|Promise<void>;
};
export type PluginFactory = {createPlugin(context:{workspace:string;workspaceBase?:string;pluginRoot:string;executable:string;requestHost?:(request:{cmd:string;args?:Record<string,unknown>})=>Promise<unknown>}):PluginRuntime|Promise<PluginRuntime>};
