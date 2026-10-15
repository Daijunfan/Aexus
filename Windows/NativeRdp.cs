using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// In-process Windows RDP ActiveX host, owned by CloudHosts rather than mstsc.exe.
// No RDP port is exposed publicly: the backend supplies a verified local SSH tunnel.
internal sealed class CloudHostsRdpControl : AxHost {
    // MsRdpClient10NotSafeForScripting is available on Windows 10/11.
    public CloudHostsRdpControl() : base("A0C63C30-F08D-4AB4-907C-34905D770C7D") {}
    public object Client { get { return GetOcx(); } }
}

internal sealed class CloudHostsRdpSession : Form {
    private readonly string hostId;
    private readonly int port;
    private readonly CloudHostsRdpControl rdp = new CloudHostsRdpControl();
    private readonly TextBox username = new TextBox { Width = 190 };
    private readonly TextBox password = new TextBox { Width = 190, UseSystemPasswordChar = true };
    private readonly CheckBox remember = new CheckBox { Text = "保存凭据", AutoSize = true, Checked = true };
    private readonly Button connect = new Button { Text = "连接", Width = 72, Height = 27 };
    private readonly Label status = new Label { Text = "通过 SSH 安全通道连接", AutoSize = true };
    private bool connecting;
    private readonly Timer connectionCheck = new Timer { Interval = 500 };
    private int connectionChecks;
    private string pendingUsername = "", pendingPassword = "";

    public CloudHostsRdpSession(string hostId, int port, string defaultUser) {
        if (port < 1 || port > 65535) throw new ArgumentOutOfRangeException("port");
        this.hostId = hostId;
        this.port = port;
        Text = "Aexus · 内嵌远程桌面";
        MinimumSize = new Size(880, 620);
        Size = new Size(1280, 850);
        StartPosition = FormStartPosition.CenterParent;
        ShowInTaskbar = false;

        username.Text = defaultUser;
        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(8), WrapContents = true };
        toolbar.Controls.Add(new Label { Text = "Windows 用户名", AutoSize = true, Padding = new Padding(0, 7, 0, 0) });
        toolbar.Controls.Add(username);
        toolbar.Controls.Add(new Label { Text = "密码", AutoSize = true, Padding = new Padding(7, 7, 0, 0) });
        toolbar.Controls.Add(password);
        toolbar.Controls.Add(remember);
        toolbar.Controls.Add(connect);
        toolbar.Controls.Add(status);
        Controls.Add(rdp);
        Controls.Add(toolbar);
        rdp.Dock = DockStyle.Fill;
        rdp.BringToFront();
        toolbar.BringToFront();
        connect.Click += (sender, args) => ConnectDesktop();
        connectionCheck.Tick += (sender, args) => PollConnection();
        Shown += async (sender, args) => await LoadCredentialsAsync();
        FormClosing += (sender, args) => DisconnectDesktop();
    }

    private static object Get(object obj, string name) {
        return obj.GetType().InvokeMember(name, BindingFlags.GetProperty, null, obj, null);
    }
    private static void Set(object obj, string name, object value) {
        obj.GetType().InvokeMember(name, BindingFlags.SetProperty, null, obj, new[] { value });
    }
    private static object Call(object obj, string method) {
        return obj.GetType().InvokeMember(method, BindingFlags.InvokeMethod, null, obj, new object[0]);
    }

    private async Task LoadCredentialsAsync() {
        try {
            var saved = await Task.Run(() => CredentialRequest(new Dictionary<string, object> {
                { "action", "get" }, { "account", hostId }
            }));
            if (IsDisposed || connecting || !saved.ContainsKey("found") || !Convert.ToBoolean(saved["found"])) return;
            username.Text = Convert.ToString(saved["username"]);
            password.Text = Convert.ToString(saved["password"]);
            status.Text = "已加载 Windows 凭据管理器";
        } catch (Exception) {
            if (!IsDisposed) status.Text = "凭据不可读取，可手动登录";
        }
    }

    private void ConnectDesktop() {
        if (connecting) return;
        try {
            connecting = true;
            connect.Enabled = false;
            var client = rdp.Client;
            if (client == null) throw new InvalidOperationException("Windows RDP ActiveX not ready");
            Set(client, "Server", "127.0.0.1");
            Set(client, "UserName", username.Text.Trim());
            Set(client, "DesktopWidth", Math.Max(800, Math.Min(3840, rdp.ClientSize.Width)));
            Set(client, "DesktopHeight", Math.Max(600, Math.Min(2160, rdp.ClientSize.Height)));
            Set(client, "ColorDepth", 32);
            var advanced = Get(client, "AdvancedSettings2");
            Set(advanced, "RDPPort", port);
            if (password.TextLength > 0) Set(advanced, "ClearTextPassword", password.Text);
            pendingUsername = remember.Checked ? username.Text.Trim() : "";
            pendingPassword = remember.Checked ? password.Text : "";
            Call(client, "Connect");
            status.Text = "RDP 正在连接";
            connectionChecks = 0;
            connectionCheck.Start();
        } catch (Exception error) {
            connecting = false;
            connect.Enabled = true;
            pendingPassword = "";
            status.Text = "连接失败：" + error.Message;
        }
    }

    private void PollConnection() {
        if (IsDisposed || Disposing) { connectionCheck.Stop(); pendingPassword = ""; return; }
        connectionChecks++;
        try {
            int state = Convert.ToInt32(Get(rdp.Client, "Connected"));
            if (state == 1) {
                connectionCheck.Stop();
                status.Text = "RDP 已连接";
                password.Clear();
                if (pendingUsername.Length != 0 && pendingPassword.Length != 0) {
                    string user = pendingUsername, secret = pendingPassword;
                    Task.Run(() => CredentialRequest(new Dictionary<string, object> {
                        { "action", "set" }, { "account", hostId }, { "username", user }, { "password", secret }
                    })).ContinueWith(task => {
                        if (task.IsFaulted && !IsDisposed && !Disposing) {
                            try { BeginInvoke((Action)(() => status.Text = "RDP 已连接；凭据保存失败")); }
                            catch (InvalidOperationException) {}
                        }
                    });
                }
                pendingUsername = ""; pendingPassword = "";
                return;
            }
        } catch (Exception) {}
        if (connectionChecks >= 120) {
            connectionCheck.Stop();
            connecting = false;
            connect.Enabled = true;
            pendingUsername = ""; pendingPassword = "";
            status.Text = "RDP 未在 60 秒内完成连接，可重试";
        }
    }

    private void DisconnectDesktop() {
        connectionCheck.Stop();
        pendingUsername = ""; pendingPassword = "";
        try {
            var client = rdp.Client;
            if (client != null && Convert.ToInt32(Get(client, "Connected")) != 0) Call(client, "Disconnect");
        } catch {}
    }

    private static Dictionary<string, object> CredentialRequest(Dictionary<string, object> request) {
        string exe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "backend", "Windows", "RdpCredentials.exe");
        if (!File.Exists(exe)) throw new FileNotFoundException("Windows Credential Manager helper is missing");
        var serializer = new JavaScriptSerializer();
        using (var process = new Process {
            StartInfo = new ProcessStartInfo {
                FileName = exe, WorkingDirectory = Path.GetDirectoryName(exe),
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true
            }
        }) {
            process.Start();
            process.StandardInput.Write(serializer.Serialize(request));
            process.StandardInput.Close();
            var output = process.StandardOutput.ReadToEndAsync();
            if (!process.WaitForExit(8000)) {
                try { process.Kill(); } catch {}
                throw new TimeoutException("Windows credential helper timed out");
            }
            var value = serializer.Deserialize<Dictionary<string, object>>(output.GetAwaiter().GetResult());
            if (value == null || value.ContainsKey("error") || process.ExitCode != 0)
                throw new InvalidOperationException("Windows credential helper returned an error");
            return value;
        }
    }
}
