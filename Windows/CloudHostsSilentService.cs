using System;
using System.Diagnostics;
using System.IO;

// GUI-subsystem process with no window, used by the per-user Windows logon
// task. It hosts the same localhost Node service but never allocates a visible
// console at login. The worker stays alive after the main CloudHosts GUI closes.
internal static class CloudHostsSilentService {
    [STAThread]
    private static int Main() {
        try {
            var root = AppDomain.CurrentDomain.BaseDirectory;
            var node = Path.Combine(root, "node.exe");
            var cli = Path.Combine(root, "backend", "cli.cjs");
            if (!File.Exists(node) || !File.Exists(cli)) return 2;
            using (var process = new Process()) {
                process.StartInfo = new ProcessStartInfo {
                    FileName = node,
                    Arguments = "\"" + cli.Replace("\"", "\\\"") + "\" serve",
                    WorkingDirectory = root,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                // Drain both pipes; the HTTP token must never be logged.
                process.OutputDataReceived += (sender, args) => {};
                process.ErrorDataReceived += (sender, args) => {};
                if (!process.Start()) return 3;
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                process.WaitForExit();
                return process.ExitCode;
            }
        } catch (Exception error) {
            try {
                var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                                       "Toolbox", "CloudHosts");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "silent-launcher.log"),
                                   DateTime.UtcNow.ToString("o") + " " + error.GetType().Name + Environment.NewLine);
            } catch {}
            return 4;
        }
    }
}
