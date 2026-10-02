// Source for the local Windows OpenSSH password helper. No credential is embedded.
using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Web.Script.Serialization;
using System.Collections.Generic;
class AgentsCompanyAskpass {
  static int Main() {
    try {
      var json = new JavaScriptSerializer();
      var executable = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName;
      var config = json.Deserialize<Dictionary<string,string>>(File.ReadAllText(executable + ".json"));
      var token = File.ReadAllText(config["tokenFile"]).Trim();
      var pipeName = config["endpoint"].Substring(@"\\.\pipe\".Length);
      using (var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut)) {
        pipe.Connect(8000);
        var bytes = Encoding.UTF8.GetBytes(json.Serialize(new { auth=token, cmd="host.credentials", args=new { id=config["hostId"], files=false } }) + "\n");
        pipe.Write(bytes,0,bytes.Length); pipe.Flush();
        using (var reader = new StreamReader(pipe, new UTF8Encoding(false))) {
          var read = reader.ReadLineAsync();
          if (!read.Wait(8000)) return 1;
          var result = json.Deserialize<Dictionary<string,object>>(read.Result);
          if (!result.ContainsKey("ok") || !(bool)result["ok"]) return 1;
          var data = (Dictionary<string,object>)result["data"];
          Console.OutputEncoding = new UTF8Encoding(false);
          Console.WriteLine((string)data["password"]);
        }
      }
      return 0;
    } catch { return 1; }
  }
}
