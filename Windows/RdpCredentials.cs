using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

// Runs as the logged-in user; credentials are stored in Windows Credential Manager.
// The JSON protocol is through stdin/stdout only. No password appears in argv, logs,
// a user settings file or the Windows application bundle.
internal static class CloudHostsRdpCredentials {
    private const uint CRED_TYPE_GENERIC = 1;
    private const uint CRED_PERSIST_LOCAL_MACHINE = 2;
    private const int ERROR_NOT_FOUND = 1168;
    private const string Prefix = "Toolbox/CloudHosts/RDP/";

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Credential {
        public uint Flags;
        public uint Type;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
        [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
        [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredReadW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredWriteW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredWrite(ref Credential credential, uint flags);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern void CredFree(IntPtr credential);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CredDeleteW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredDelete(string target, uint type, uint flags);

    private static string Get(Dictionary<string, object> request, string field) {
        object value;
        return request.TryGetValue(field, out value) && value != null ? Convert.ToString(value) : "";
    }

    private static object Execute(Dictionary<string, object> request) {
        Guid hostId;
        if (!Guid.TryParse(Get(request, "account"), out hostId)) throw new ArgumentException("Invalid RDP host ID");
        string target = Prefix + hostId.ToString("D");
        string action = Get(request, "action");
        if (action == "get") {
            IntPtr pointer;
            if (!CredRead(target, CRED_TYPE_GENERIC, 0, out pointer)) {
                int error = Marshal.GetLastWin32Error();
                if (error == ERROR_NOT_FOUND) return new { found = false };
                throw new Win32Exception(error);
            }
            try {
                var entry = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
                if (entry.CredentialBlobSize > 5120 || entry.CredentialBlobSize % 2 != 0)
                    throw new InvalidOperationException("Invalid RDP credential data");
                byte[] buffer = new byte[entry.CredentialBlobSize];
                try {
                    if (buffer.Length != 0) Marshal.Copy(entry.CredentialBlob, buffer, 0, buffer.Length);
                    return new { found = true, username = entry.UserName ?? "",
                                 password = Encoding.Unicode.GetString(buffer), source = "Windows Credential Manager" };
                } finally { Array.Clear(buffer, 0, buffer.Length); }
            } finally { CredFree(pointer); }
        }
        if (action == "set") {
            string username = Get(request, "username");
            string password = Get(request, "password");
            if (username.Length == 0 || username.Length > 512 || password.Length == 0)
                throw new ArgumentException("Invalid RDP username or password");
            byte[] buffer = Encoding.Unicode.GetBytes(password);
            if (buffer.Length > 5120) throw new ArgumentException("RDP password is too long");
            IntPtr pointer = IntPtr.Zero;
            try {
                pointer = Marshal.AllocHGlobal(buffer.Length);
                Marshal.Copy(buffer, 0, pointer, buffer.Length);
                var entry = new Credential {
                    Type = CRED_TYPE_GENERIC, TargetName = target,
                    CredentialBlob = pointer, CredentialBlobSize = (uint)buffer.Length,
                    Persist = CRED_PERSIST_LOCAL_MACHINE, UserName = username
                };
                if (!CredWrite(ref entry, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
                return new { saved = true };
            } finally {
                if (pointer != IntPtr.Zero) {
                    byte[] zero = new byte[buffer.Length];
                    Marshal.Copy(zero, 0, pointer, zero.Length);
                    Marshal.FreeHGlobal(pointer);
                }
                Array.Clear(buffer, 0, buffer.Length);
            }
        }
        if (action == "delete") {
            if (!CredDelete(target, CRED_TYPE_GENERIC, 0)) {
                int error = Marshal.GetLastWin32Error();
                if (error != ERROR_NOT_FOUND) throw new Win32Exception(error);
            }
            return new { deleted = true };
        }
        throw new ArgumentException("Unsupported credential operation");
    }

    private static int Main() {
        var json = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 };
        try {
            string input = Console.In.ReadToEnd();
            if (input.Length > 16384) throw new ArgumentException("Credential request too large");
            var request = json.Deserialize<Dictionary<string, object>>(input);
            if (request == null) throw new ArgumentException("Invalid credential request");
            Console.Out.Write(json.Serialize(Execute(request)));
            return 0;
        } catch (Exception error) {
            // Never echo the incoming JSON or sensitive credential values.
            Console.Out.Write(json.Serialize(new { error = error is Win32Exception
                ? "Windows Credential Manager error " + ((Win32Exception)error).NativeErrorCode
                : error.Message }));
            return 1;
        }
    }
}
