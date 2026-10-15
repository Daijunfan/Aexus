using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

// Native desktop bridge: every requested RDP session must be revalidated against
// the localhost backend. Browser messages cannot select an arbitrary TCP target.
internal sealed partial class CloudHostsWindow {
    private readonly Dictionary<string, CloudHostsRdpSession> rdpWindows =
        new Dictionary<string, CloudHostsRdpSession>(StringComparer.OrdinalIgnoreCase);

    private Dictionary<string, object> Rpc(string method, Dictionary<string, object> parameters) {
        if (string.IsNullOrEmpty(serverUrl)) throw new InvalidOperationException("CloudHosts backend unavailable");
        var request = (HttpWebRequest)WebRequest.Create(serverUrl + "rpc");
        request.Method = "POST";
        request.ContentType = "application/json";
        request.Proxy = null;
        request.Timeout = 10000;
        request.ReadWriteTimeout = 10000;
        var codec = new System.Web.Script.Serialization.JavaScriptSerializer();
        var payload = Encoding.UTF8.GetBytes(codec.Serialize(new Dictionary<string, object> {
            { "jsonrpc", "2.0" }, { "id", 1 }, { "method", method }, { "params", parameters }
        }));
        request.ContentLength = payload.Length;
        using (var stream = request.GetRequestStream()) stream.Write(payload, 0, payload.Length);
        using (var response = request.GetResponse())
        using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8)) {
            var envelope = codec.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
            if (envelope == null || envelope.ContainsKey("error") || !envelope.ContainsKey("result"))
                throw new InvalidOperationException("CloudHosts backend rejected the desktop request");
            return envelope;
        }
    }

    private static string Value(Dictionary<string, object> record, string key) {
        object result;
        return record.TryGetValue(key, out result) && result != null ? Convert.ToString(result) : "";
    }

    private static string UserFromRdpProfile(string profile) {
        if (profile == null) return "";
        foreach (string line in profile.Split('\n')) {
            if (line.StartsWith("username:s:", StringComparison.OrdinalIgnoreCase)) {
                string name = line.Substring("username:s:".Length).Trim();
                return name.Length <= 256 ? name : "";
            }
        }
        return "";
    }

    private async Task OpenNativeRdpAsync(Dictionary<string, object> message) {
        string hostId = Value(message, "id"), sessionId = Value(message, "session");
        Guid hostGuid, sessionGuid;
        if (!Guid.TryParse(hostId, out hostGuid) || !Guid.TryParse(sessionId, out sessionGuid))
            throw new InvalidDataException("Invalid RDP session identifier");
        CloudHostsRdpSession existing;
        if (rdpWindows.TryGetValue(sessionId, out existing) && !existing.IsDisposed) {
            existing.Activate();
            NotifyNativeRdp("opened", sessionId, null);
            return;
        }
        // Request validation is independent of the browser-provided data.
        var response = await Task.Run(() => Rpc("hosts.desktop-list", new Dictionary<string, object> { { "id", hostId } }));
        var rows = response["result"] as IEnumerable;
        if (rows == null) throw new InvalidDataException("Missing desktop session list");
        Dictionary<string, object> record = null;
        foreach (object item in rows) {
            var row = item as Dictionary<string, object>;
            if (row != null && Value(row, "id") == sessionId && Value(row, "hostId") == hostId) {
                record = row;
                break;
            }
        }
        if (record == null || Value(record, "state") != "ready" || Value(record, "protocol") != "rdp"
            || Value(record, "address") != "127.0.0.1")
            throw new InvalidOperationException("RDP must use an active, authenticated localhost SSH tunnel");
        int port;
        if (!int.TryParse(Value(record, "port"), out port) || port < 1 || port > 65535)
            throw new InvalidDataException("Invalid RDP tunnel port");
        if (IsDisposed || Disposing) return;
        var form = new CloudHostsRdpSession(hostId, port, UserFromRdpProfile(Value(record, "profile")));
        rdpWindows[sessionId] = form;
        form.FormClosed += async (sender, args) => {
            rdpWindows.Remove(sessionId);
            try {
                await Task.Run(() => Rpc("hosts.desktop-close", new Dictionary<string, object> {
                    { "id", hostId }, { "session", sessionId }
                }));
            } catch {}
            NotifyNativeRdp("closed", sessionId, null);
        };
        try {
            form.Show(this);
            NotifyNativeRdp("opened", sessionId, null);
        } catch {
            rdpWindows.Remove(sessionId);
            form.Dispose();
            throw;
        }
    }

    private void NotifyNativeRdp(string state, string session, string error) {
        if (IsDisposed || browser.CoreWebView2 == null) return;
        var result = new Dictionary<string, object> { { "state", state }, { "session", session } };
        if (error != null) result["error"] = error;
        try {
            browser.CoreWebView2.ExecuteScriptAsync(
                "window.dispatchEvent(new CustomEvent('rdp-native-result',{detail:" +
                serializer.Serialize(result) + "}))");
        } catch (InvalidOperationException) {}
    }
}
