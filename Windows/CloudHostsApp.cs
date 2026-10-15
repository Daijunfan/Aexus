using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Windows front-end for the same CloudHosts HTTP API and browser UI as macOS.
// The Node service is intentionally retained when the window closes, matching
// the Mac implementation's persistent terminal lifetime.
internal static class CloudHostsWindows {
    [STAThread]
    private static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new CloudHostsWindow());
    }
}

internal sealed partial class CloudHostsWindow : Form {
    private readonly WebView2 browser = new WebView2();
    private readonly JavaScriptSerializer serializer = new JavaScriptSerializer { MaxJsonLength = 64 * 1024 * 1024 };
    private readonly string home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Toolbox", "CloudHosts");
    private string serverUrl = "";
    private string origin = "";
    private bool loaded;
    private string preferredLanguage = "en";

    public CloudHostsWindow() {
        Text = "Aexus";
        MinimumSize = new Size(850, 560);
        Size = new Size(1440, 930);
        StartPosition = FormStartPosition.CenterScreen;
        var icon = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Aexus.ico");
        if (File.Exists(icon)) Icon = new Icon(icon);
        browser.Dock = DockStyle.Fill;
        Controls.Add(browser);
        Shown += async (sender, args) => await InitializeAsync();
    }

    private async Task InitializeAsync() {
        if (loaded) return;
        loaded = true;
        try {
            serverUrl = await Task.Run(() => StartServer());
            var uri = new Uri(serverUrl);
            if (uri.Scheme != "http" || uri.Host != "127.0.0.1" || uri.AbsolutePath == "/")
                throw new InvalidOperationException("CloudHosts service returned an invalid local URL.");
            origin = uri.GetLeftPart(UriPartial.Authority);
            Directory.CreateDirectory(Path.Combine(home, "WebView"));
            browser.CreationProperties = new CoreWebView2CreationProperties {
                UserDataFolder = Path.Combine(home, "WebView")
            };
            await browser.EnsureCoreWebView2Async(null);
            browser.CoreWebView2.Settings.IsScriptEnabled = true;
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            browser.CoreWebView2.Settings.IsWebMessageEnabled = true;
            browser.CoreWebView2.NewWindowRequested += (sender, e) => {
                e.Handled = true;
                if (!e.Uri.StartsWith(origin + "/", StringComparison.OrdinalIgnoreCase)) {
                    try { Process.Start(e.Uri); } catch { }
                } else browser.CoreWebView2.Navigate(e.Uri);
            };
            browser.CoreWebView2.NavigationStarting += (sender, e) => {
                Uri next;
                if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out next)
                    || !e.Uri.StartsWith(serverUrl, StringComparison.Ordinal))
                    e.Cancel = true;
            };
            browser.CoreWebView2.WebMessageReceived += NativeMessage;
            browser.CoreWebView2.Navigate(serverUrl);
        } catch (Exception error) {
            MessageBox.Show(this, "Cloud Hosts could not start:\n" + error.Message, "Cloud Hosts", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private string StartServer() {
        var root = AppDomain.CurrentDomain.BaseDirectory;
        var node = Path.Combine(root, "node.exe");
        var cli = Path.Combine(root, "backend", "cli.cjs");
        if (!File.Exists(node) || !File.Exists(cli)) throw new FileNotFoundException("Node.js runtime or CloudHosts backend was not packaged.");
        var process = new Process {
            StartInfo = new ProcessStartInfo {
                FileName = node,
                Arguments = Quote(cli) + " start",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };
        if (!process.Start()) throw new InvalidOperationException("Unable to start local CloudHosts service.");
        string output = process.StandardOutput.ReadToEnd();
        string errors = process.StandardError.ReadToEnd();
        if (!process.WaitForExit(20000) || process.ExitCode != 0)
            throw new InvalidOperationException("CloudHosts service start failed. " + Truncate(errors, 350));
        Dictionary<string, object> result = serializer.Deserialize<Dictionary<string, object>>(output.Trim());
        if (result == null || !result.ContainsKey("url")) throw new InvalidOperationException("Missing service URL.");
        return Convert.ToString(result["url"]);
    }

    private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    private static string Truncate(string value, int count) { return value.Length > count ? value.Substring(0, count) : value; }

    private async void NativeMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args) {
        try {
            Uri from, allowed;
            if (!Uri.TryCreate(args.Source, UriKind.Absolute, out from)
                || !Uri.TryCreate(serverUrl, UriKind.Absolute, out allowed)
                || from.Scheme != allowed.Scheme || from.Host != allowed.Host || from.Port != allowed.Port
                || !from.AbsolutePath.StartsWith(allowed.AbsolutePath, StringComparison.Ordinal)) return;
            var message = serializer.Deserialize<Dictionary<string, object>>(args.WebMessageAsJson);
            if (message == null || !message.ContainsKey("type")) return;
            switch (Convert.ToString(message["type"])) {
                case "language":
                    var requestedLanguage = Convert.ToString(message.ContainsKey("value") ? message["value"] : "en");
                    if (requestedLanguage == "en" || requestedLanguage == "zh") {
                        preferredLanguage = requestedLanguage;
                        Text = preferredLanguage == "zh" ? "云主机" : "Cloud Hosts";
                    }
                    break;
                case "rdp-open":
                    try { await OpenNativeRdpAsync(message); }
                    catch (Exception error) { NotifyNativeRdp("error", Convert.ToString(message.ContainsKey("session") ? message["session"] : ""), error.Message); }
                    break;
                case "rdp-close":
                    var rdpSession = Convert.ToString(message.ContainsKey("session") ? message["session"] : "");
                    CloudHostsRdpSession rdpWindow;
                    Guid parsedRdpSession;
                    if (Guid.TryParse(rdpSession, out parsedRdpSession) && rdpWindows.TryGetValue(rdpSession, out rdpWindow)) rdpWindow.Close();
                    break;
                case "save":
                    var id = Convert.ToString(message["id"]);
                    var source = StationSource(id);
                    if (Directory.Exists(source)) {
                        // A directory cannot be downloaded as a browser file. The backend
                        // creates a ZIP (Windows .NET ZipFile, macOS ditto); save it as one
                        // atomic file rather than recursively copying a live station tree.
                        using (var dialog = new SaveFileDialog {
                            FileName = Path.GetFileName(source) + ".zip",
                            Title = preferredLanguage == "zh" ? "下载文件夹为 ZIP" : "Save Folder as ZIP",
                            DefaultExt = "zip", AddExtension = true,
                            Filter = preferredLanguage == "zh" ? "ZIP 压缩包 (*.zip)|*.zip" : "ZIP Archive (*.zip)|*.zip", OverwritePrompt = true
                        }) {
                            if (dialog.ShowDialog(this) != DialogResult.OK) return;
                            var temporary = dialog.FileName + ".cloudhosts-" + Guid.NewGuid().ToString("N") + ".partial";
                            try {
                                using (var client = new WebClient()) {
                                    client.Proxy = null;
                                    await client.DownloadFileTaskAsync(
                                        new Uri(serverUrl + "station/download/" + Uri.EscapeDataString(id)), temporary);
                                }
                                if (File.Exists(dialog.FileName)) File.Replace(temporary, dialog.FileName, null);
                                else File.Move(temporary, dialog.FileName);
                            } finally {
                                if (File.Exists(temporary)) File.Delete(temporary);
                            }
                            Notify("文件夹已保存为 ZIP：" + Path.GetFileName(dialog.FileName), null);
                        }
                    } else {
                        using (var dialog = new SaveFileDialog { FileName = Path.GetFileName(source), OverwritePrompt = true }) {
                            if (dialog.ShowDialog(this) != DialogResult.OK) return;
                            File.Copy(source, dialog.FileName, true);
                        }
                        Notify("文件已保存", null);
                    }
                    break;
                case "drag":
                    var list = message["ids"] as System.Collections.ArrayList;
                    if (list == null || list.Count == 0) return;
                    var paths = new List<string>();
                    foreach (object item in list) paths.Add(StationSource(Convert.ToString(item)));
                    var data = new DataObject(DataFormats.FileDrop, paths.ToArray());
                    DoDragDrop(data, DragDropEffects.Copy);
                    break;
            }
        } catch (Exception error) { Notify(null, error.Message); }
    }

    private string StationSource(string id) {
        Guid parsed;
        if (!Guid.TryParse(id, out parsed)) throw new InvalidDataException("Invalid station item ID.");
        var file = Path.Combine(home, "station", "index.json");
        var entries = serializer.Deserialize<List<Dictionary<string, object>>>(File.ReadAllText(file, Encoding.UTF8));
        var records = new Dictionary<string, Dictionary<string, object>>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in entries) {
            if (entry.ContainsKey("id")) records[Convert.ToString(entry["id"])] = entry;
        }
        var names = new List<string>();
        string next = id;
        var visited = new HashSet<string>();
        while (next != null && records.ContainsKey(next)) {
            if (!visited.Add(next)) throw new InvalidDataException("Station folder cycle detected.");
            var row = records[next];
            string name = Convert.ToString(row["name"]);
            if (string.IsNullOrWhiteSpace(name) || name != Path.GetFileName(name) || name == "." || name == "..")
                throw new InvalidDataException("Invalid station filename.");
            names.Insert(0, name);
            object parent;
            next = row.TryGetValue("parent", out parent) && parent != null ? Convert.ToString(parent) : null;
        }
        if (names.Count == 0 || next != null) throw new FileNotFoundException("Station item does not exist.");
        var content = Path.GetFullPath(Path.Combine(home, "station", "content"));
        var location = Path.GetFullPath(Path.Combine(new [] { content, Path.Combine(names.ToArray()) }));
        if (!location.StartsWith(content + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Station path escapes its storage directory.");
        if (!File.Exists(location) && !Directory.Exists(location)) throw new FileNotFoundException("Station data not found.");
        return location;
    }

    private void Notify(string message, string error) {
        var obj = new Dictionary<string, object>();
        if (message != null) obj["message"] = message;
        if (error != null) obj["error"] = error;
        if (browser.CoreWebView2 != null)
            browser.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('station-native-result',{detail:" + serializer.Serialize(obj) + "}))");
    }
}
