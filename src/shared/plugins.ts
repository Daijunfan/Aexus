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
  scope?: 'workspace'|'application';
  license?: string;
};
export type PluginDescriptor = PluginManifest & { directory: string };
export type PluginRequest = { jsonrpc:'2.0';id:string|number;method:string;params?:Record<string,unknown> };
export type PluginResponse = { jsonrpc:'2.0';id:string|number;result?:any;error?:{code:number;message:string;data?:unknown};[key:string]:unknown };
export type PluginRuntime = {
  request(request:PluginRequest):Promise<PluginResponse>;
  subscribe?(listener:(event:unknown)=>void):Promise<()=>void>;
  readAsset?(path:string):Promise<{bytes:Uint8Array;mimeType:string}>;
  close?():void|Promise<void>;
};
export type PluginFactory = {createPlugin(context:{workspace:string;pluginRoot:string;executable:string;requestHost?:(request:{cmd:string;args?:Record<string,unknown>})=>Promise<unknown>}):PluginRuntime|Promise<PluginRuntime>};
