using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

// Windows 10+ ConPTY-based SSH terminal, JSONL interface shared with Runtime/terminal.py.
class ConPtyTerminal {
 [StructLayout(LayoutKind.Sequential)] struct Coord {public short x,y; public Coord(int c,int r){x=(short)c;y=(short)r;}}
 [StructLayout(LayoutKind.Sequential)] struct Security {public int size;public IntPtr descriptor;[MarshalAs(UnmanagedType.Bool)]public bool inherit;}
 [StructLayout(LayoutKind.Sequential)] struct Startup {
  public int cb;public IntPtr reserved,desktop,title;
  public int x,y,w,h,charsX,charsY,attr,flags;public short show,reservedCount;
  public IntPtr reserved2,input,output,error;
 }
 [StructLayout(LayoutKind.Sequential)] struct StartupEx {public Startup startup;public IntPtr attributes;}
 [StructLayout(LayoutKind.Sequential)] struct ProcInfo {public IntPtr process,thread;public uint pid,tid;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr r,out IntPtr w,ref Security a,int n);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")] static extern int CreatePseudoConsole(Coord size,IntPtr input,IntPtr output,int flags,out IntPtr pc);
 [DllImport("kernel32.dll")] static extern int ResizePseudoConsole(IntPtr pc,Coord size);
 [DllImport("kernel32.dll")] static extern void ClosePseudoConsole(IntPtr pc);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr bytes);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,int flags,IntPtr key,IntPtr value,IntPtr size,IntPtr previous,IntPtr result);
 [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)]
 static extern bool CreateProcessW(string file,StringBuilder command,IntPtr psecurity,IntPtr tsecurity,
  bool inherit,uint flags,IntPtr environment,string directory,ref StartupEx startup,out ProcInfo result);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadFile(IntPtr file,byte[] bytes,int length,out int read,IntPtr overlap);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteFile(IntPtr file,byte[] bytes,int length,out int written,IntPtr overlap);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint millis);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr handle,uint code);
 static JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=64*1024*1024};
 static object outputLock=new object();
 static void Emit(object data){lock(outputLock){Console.Out.WriteLine(json.Serialize(data));Console.Out.Flush();}}
 static void Check(bool ok,string what){if(!ok)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),what);}
 static string Str(Dictionary<string,object> d,string key,string fallback=""){return d.ContainsKey(key)&&d[key]!=null?Convert.ToString(d[key]):fallback;}
 static int Num(Dictionary<string,object> d,string key,int fallback){return d.ContainsKey(key)?Convert.ToInt32(d[key]):fallback;}
 static string Arg(string value){
  if(value.Length>0 && value.IndexOfAny(new[]{' ','\t','\"'})<0)return value;
  var b=new StringBuilder("\"");int slashes=0;
  foreach(char c in value){
   if(c=='\\'){slashes++;continue;}
   if(c=='"'){b.Append('\\',slashes*2+1).Append('\"');slashes=0;continue;}
   b.Append('\\',slashes).Append(c);slashes=0;
  }b.Append('\\',slashes*2).Append('\"');return b.ToString();
 }
 static List<string> AgentArgs(Dictionary<string,object> config){
  var result=new List<string>();
  if(!config.ContainsKey("commandArgs")||config["commandArgs"]==null)return result;
  var collection=config["commandArgs"] as System.Collections.IEnumerable;
  if(collection==null||config["commandArgs"] is string)throw new Exception("Invalid Agent arguments");
  foreach(var raw in collection){
   var arg=raw as string;
   if(arg==null||arg.Length>4096||arg.Contains("\n")||arg.Contains("\r")||result.Count>=24)throw new Exception("Invalid Agent argument");
   result.Add(arg);
  }
  return result;
 }
 static Dictionary<string,string> ConfigEnvironment(Dictionary<string,object> config){
  var result=new Dictionary<string,string>();
  if(!config.ContainsKey("environment")||config["environment"]==null)return result;
  var env=config["environment"] as Dictionary<string,object>;
  if(env==null)throw new Exception("Invalid terminal environment");
  foreach(var pair in env){
   var key=Convert.ToString(pair.Key);var value=pair.Value==null?null:Convert.ToString(pair.Value);
   if(key==null||value==null||key.Length==0||!char.IsUpper(key[0]))throw new Exception("Invalid terminal environment");
   foreach(char c in key)if(!(char.IsUpper(c)||char.IsDigit(c)||c=='_'))throw new Exception("Invalid terminal environment");
   if(value.Contains("\n")||value.Contains("\r")||value.Contains("\0"))throw new Exception("Invalid terminal environment");
   result[key]=value;
  }
  return result;
 }
 static string PSArg(string value){return "'"+value.Replace("'","''")+"'";}
 static string POSIXArg(string text){return "'"+text.Replace("'","'\\''")+"'";}
 static string Remote(Dictionary<string,object> config){
  if(!config.ContainsKey("remote")||config["remote"]==null){
   string localAgent=Str(config,"command");
   if(localAgent=="")return "powershell.exe -NoLogo";
   if(localAgent!="codex"&&localAgent!="claude"&&localAgent!="cline"&&localAgent!="pi"&&localAgent!="opencode")throw new Exception("Invalid agent executable");
   string executable=Str(config,"executable",localAgent);
   // Native .exe engines should own the ConPTY session directly. Routing them
   // through PowerShell can leave a shell alive after Ctrl+C exits the Agent,
   // making a stopped role appear to be running and preventing auto-resume.
   if(String.Equals(Path.GetExtension(executable),".exe",StringComparison.OrdinalIgnoreCase)) {
    var argv=new List<string>{executable};argv.AddRange(AgentArgs(config));
    return String.Join(" ",argv.ConvertAll(Arg));
   }
   string script="& "+PSArg(executable)+" "+String.Join(" ",AgentArgs(config).ConvertAll(PSArg))+"; exit $LASTEXITCODE";
   return "powershell.exe -NoLogo -NoProfile -EncodedCommand "+Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
  }
  var t=(Dictionary<string,object>)config["remote"];
  var args=new List<string>{"ssh.exe","-tt","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=10","-o","ServerAliveInterval=15","-o","ServerAliveCountMax=2"};
  foreach(var p in new[]{new[]{"port","-p"},new[]{"proxy_jump","-J"},new[]{"identity_file","-i"},new[]{"ssh_config","-F"}}){
   if(!String.IsNullOrEmpty(Str(t,p[0]))){args.Add(p[1]);args.Add(Str(t,p[0]));}
  }
  if(!String.IsNullOrEmpty(Str(t,"identity_file"))){args.Add("-o");args.Add("IdentitiesOnly=yes");}
  if(!String.IsNullOrEmpty(Str(t,"known_hosts"))){args.Add("-o");args.Add("UserKnownHostsFile="+Str(t,"known_hosts"));}
  string host=Str(t,"host"),directory=Str(t,"directory");
  string agent=Str(config,"command");
  string tokenFile=Str(config,"tuiTokenFile");
  if(tokenFile!=""&&(agent!="codex"||tokenFile.Contains("\0")||tokenFile.Contains("\n")||tokenFile.Contains("\r")))throw new Exception("Invalid native TUI token file");
  if(agent!="" && agent!="codex" && agent!="claude" && agent!="cline" && agent!="pi" && agent!="opencode")throw new Exception("Invalid agent executable");
  if(String.IsNullOrWhiteSpace(host)||host.StartsWith("-"))throw new Exception("Invalid remote SSH host");
  args.Add(host);
  if(Str(t,"os")=="windows"){
   string script="try { Set-Location -LiteralPath '"+directory.Replace("'","''")+"' -ErrorAction Stop } catch { Write-Error $_; exit 1 }; if (Get-Module -ListAvailable PSReadLine) { Import-Module PSReadLine -ErrorAction SilentlyContinue }";
   if(tokenFile!="")script+="; $env:CLOUD_HOSTS_TUI_AUTH_TOKEN=([IO.File]::ReadAllText("+PSArg(tokenFile)+")).Trim(); Remove-Item -LiteralPath "+PSArg(tokenFile)+" -Force";
   foreach(var pair in ConfigEnvironment(config))script+="; $env:"+pair.Key+"='"+pair.Value.Replace("'","''")+"'";
   if(agent!="")script+="; $program=(Get-Command -Name "+PSArg(agent)+" -CommandType Application -ErrorAction Stop|Select-Object -First 1).Source; & $program "+String.Join(" ",AgentArgs(config).ConvertAll(PSArg))+"; exit $LASTEXITCODE";
   args.Add("powershell.exe -NoLogo "+(agent==""?"-NoExit ":"")+"-EncodedCommand "+Convert.ToBase64String(Encoding.Unicode.GetBytes(script)));
  }else{
   string dir="'"+directory.Replace("'","'\\''")+"'";
   string shellAgent="export PATH=\"$HOME/.npm-global/bin:$HOME/.local/bin:$PATH\"; ";
   foreach(var pair in ConfigEnvironment(config))shellAgent+="export "+pair.Key+"="+POSIXArg(pair.Value)+"; ";
   if(tokenFile!="")shellAgent+="IFS= read -r CLOUD_HOSTS_TUI_AUTH_TOKEN < "+POSIXArg(tokenFile)+"; export CLOUD_HOSTS_TUI_AUTH_TOKEN; rm -f -- "+POSIXArg(tokenFile)+"; ";
   shellAgent+="exec "+agent;
   foreach(string argument in AgentArgs(config))shellAgent+=" "+POSIXArg(argument);
   args.Add("cd -- "+dir+" && exec \"$"+"{SHELL:-/bin/bash}\" "+(agent==""?"-il":"-lic "+Arg(shellAgent)));
  }
  return String.Join(" ",args.ConvertAll(Arg));
 }
 static void SendInput(IntPtr h,byte[] data){
  int offset=0;
  while(offset<data.Length){
   int count=Math.Min(data.Length-offset,4096),written;
   byte[] block=new byte[count];Buffer.BlockCopy(data,offset,block,0,count);
   Check(WriteFile(h,block,block.Length,out written,IntPtr.Zero)&&written>0,"ConPTY write");
   offset+=written;
  }
 }
 static int Run(string file){
  var conf=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file,Encoding.UTF8));
  // The one-shot terminal configuration may contain a TUI bearer token.
  // Delete it immediately after parsing; the token travels in the process
  // environment and never needs to remain on disk while the TUI runs.
  File.Delete(file);
  var security=new Security{size=Marshal.SizeOf(typeof(Security)),inherit=true};
  IntPtr inRead=IntPtr.Zero,inWrite=IntPtr.Zero,outRead=IntPtr.Zero,outWrite=IntPtr.Zero,pc=IntPtr.Zero,list=IntPtr.Zero;
  var process=new ProcInfo();
  try{
   Check(CreatePipe(out inRead,out inWrite,ref security,0),"ConPTY input pipe");
   Check(CreatePipe(out outRead,out outWrite,ref security,0),"ConPTY output pipe");
   int status=CreatePseudoConsole(new Coord(Num(conf,"cols",100),Num(conf,"rows",28)),inRead,outWrite,0,out pc);
   if(status!=0)throw new Exception("CreatePseudoConsole: 0x"+status.ToString("X8"));
   CloseHandle(inRead);inRead=IntPtr.Zero;CloseHandle(outWrite);outWrite=IntPtr.Zero;
   IntPtr bytes=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref bytes);
   if(bytes==IntPtr.Zero)throw new Exception("Cannot allocate startup attributes");
   list=Marshal.AllocHGlobal(bytes);
   Check(InitializeProcThreadAttributeList(list,1,0,ref bytes),"InitializeProcThreadAttributeList");
   Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x00020016),pc,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero),"UpdateProcThreadAttribute");
   // Prevent the child from using the JSON broker's inherited stdout as a
   // console stream. ConPTY supplies its own PTY handles; without this flag,
   // raw PowerShell prompt bytes can prefix an input ACK and corrupt JSONL.
   var startup=new StartupEx{startup=new Startup{cb=Marshal.SizeOf(typeof(StartupEx)),flags=0x00000100},attributes=list};
   string tuiToken=Str(conf,"tuiToken");
   IntPtr environmentBlock=IntPtr.Zero;
   if(tuiToken!=""){
    if(Str(conf,"command")!="codex" || conf.ContainsKey("remote") || tuiToken.Length!=64)
      throw new Exception("Invalid native Codex TUI token");
    foreach(char c in tuiToken)if(!Uri.IsHexDigit(c))throw new Exception("Invalid native Codex TUI token");
    var env=new StringBuilder();
    foreach(System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables()){
     string key=Convert.ToString(entry.Key),value=Convert.ToString(entry.Value);
     if(key.Contains("\0")||value.Contains("\0")||key=="CLOUD_HOSTS_TUI_AUTH_TOKEN")continue;
     env.Append(key).Append('=').Append(value).Append('\0');
    }
    env.Append("CLOUD_HOSTS_TUI_AUTH_TOKEN=").Append(tuiToken).Append('\0').Append('\0');
    environmentBlock=Marshal.StringToHGlobalUni(env.ToString());
   }
   try {
    Check(CreateProcessW(null,new StringBuilder(Remote(conf)),IntPtr.Zero,IntPtr.Zero,false,
      (uint)(0x00080000 | (environmentBlock!=IntPtr.Zero ? 0x00000400 : 0)),environmentBlock,
      Str(conf,"cwd",Environment.CurrentDirectory),ref startup,out process),"CreateProcess(OpenSSH)");
   }finally{if(environmentBlock!=IntPtr.Zero)Marshal.FreeHGlobal(environmentBlock);}
   CloseHandle(process.thread);process.thread=IntPtr.Zero;
   var readerThread=new Thread(()=>{
    byte[] bytesOut=new byte[32768];int n;
    try{
     while(ReadFile(outRead,bytesOut,bytesOut.Length,out n,IntPtr.Zero)&&n>0){
      byte[] part=new byte[n];Buffer.BlockCopy(bytesOut,0,part,0,n);
      Emit(new Dictionary<string,object>{{"data",Convert.ToBase64String(part)}});
     }
    }catch(Exception e){Console.Error.WriteLine("ConPTY read: "+e.Message);}
   });
   readerThread.IsBackground=true;readerThread.Start();
   var exitThread=new Thread(()=>{
    WaitForSingleObject(process.process,0xFFFFFFFF);
    readerThread.Join(1500);
    uint code;GetExitCodeProcess(process.process,out code);
    Emit(new Dictionary<string,object>{{"exitCode",code}});
    Environment.Exit(0);
   });
   exitThread.IsBackground=true;exitThread.Start();
   var stdin=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false));
   string line;
   while((line=stdin.ReadLine())!=null){
    var request=json.Deserialize<Dictionary<string,object>>(line);string op=Str(request,"op");
    if(op=="input"){
     SendInput(inWrite,Encoding.UTF8.GetBytes(Str(request,"data")));
     if(request.ContainsKey("inputId"))Emit(new Dictionary<string,object>{{"inputId",request["inputId"]}});
    }else if(op=="resize"){
     int c=Math.Max(2,Math.Min(500,Num(request,"cols",100))),r=Math.Max(2,Math.Min(300,Num(request,"rows",28)));
     status=ResizePseudoConsole(pc,new Coord(c,r));
     if(status!=0)throw new Exception("ResizePseudoConsole: 0x"+status.ToString("X8"));
    }else if(op=="close"){TerminateProcess(process.process,0);break;}
    else throw new Exception("Unknown ConPTY operation");
   }
   if(WaitForSingleObject(process.process,0)==0x102)TerminateProcess(process.process,0);
   return 0;
  }finally{
   if(process.thread!=IntPtr.Zero)CloseHandle(process.thread);
   if(process.process!=IntPtr.Zero)CloseHandle(process.process);
   if(list!=IntPtr.Zero){DeleteProcThreadAttributeList(list);Marshal.FreeHGlobal(list);}
   if(pc!=IntPtr.Zero)ClosePseudoConsole(pc);
   if(inRead!=IntPtr.Zero)CloseHandle(inRead);
   if(inWrite!=IntPtr.Zero)CloseHandle(inWrite);
   if(outRead!=IntPtr.Zero)CloseHandle(outRead);
   if(outWrite!=IntPtr.Zero)CloseHandle(outWrite);
  }
 }
 public static int Main(string[] args){
  try{if(args.Length!=1)throw new Exception("Expected config path");return Run(args[0]);}
  catch(Exception e){Console.Error.WriteLine("CloudHosts ConPTY: "+e.Message);return 1;}
 }
}
