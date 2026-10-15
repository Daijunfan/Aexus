// Migrated from Aexus, GPL-3.0-only; independent host and terminal services.
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
__export(stdin_exports, {
  assertHostIdle: () => assertHostIdle,
  closeHostConnections: () => closeHostConnections,
  closeHostDesktop: () => closeHostDesktop,
  closeHostTerminals: () => closeHostTerminals,
  connectHostDesktop: () => connectHostDesktop,
  hostTerminals: () => hostTerminals,
  launchHostDesktop: () => launchHostDesktop,
  listHostDesktops: () => listHostDesktops,
  openHostDesktop: () => openHostDesktop,
  openHostTerminal: () => openHostTerminal,
  requireHostTerminal: () => requireHostTerminal
});
module.exports = __toCommonJS(stdin_exports);
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
var import_node_net = __toESM(require("node:net"));
var import_node_http = __toESM(require("node:http"));
var import_node_crypto = require("node:crypto");
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");
var import_ws = require("ws");
const { home: APP_HOME } = require("./registry.cjs");
const { target: cloudHostTarget, get: getCloudHost } = require("./registry.cjs");
const { config: tunnelConfig, env: sshEnv } = require("./ssh.cjs");
const childEnv = () => ({ ...process.env });
const { openTerminal, listTerminals, closeEmployeeTerminals, terminalOwner } = require("./terminals.cjs");
const owner = (id) => "host:" + id;
function hostTerminals(id) {
  getCloudHost(id);
  return listTerminals(owner(id));
}
function openHostTerminal(id, directory, cols = 100, rows = 28) {
  return openTerminal({ id: owner(id), cwd: APP_HOME, remote: cloudHostTarget(id, directory) }, cols, rows);
}
function requireHostTerminal(id, terminal) {
  if (terminalOwner(terminal) !== owner(id)) throw Error("\u7EC8\u7AEF\u4E0D\u5C5E\u4E8E\u6B64\u4E91\u4E3B\u673A");
  return terminal;
}
const desktops = /* @__PURE__ */ new Map();
const info = ({ child, server, wss, sockets, file, cancelled, closing, ...value }) => value;
const listHostDesktops = (hostId) => [...desktops.values()].filter((d) => !hostId || d.hostId === hostId).map(info);
function desktop(id, session) {
  const value = desktops.get(session);
  if (!value || value.hostId !== id) throw Error("\u684C\u9762\u8FDE\u63A5\u4E0D\u5B58\u5728\u6216\u4E0D\u5C5E\u4E8E\u6B64\u4E3B\u673A");
  return value;
}
const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});
const reachable = (address, port) => new Promise((resolve, reject) => {
  const socket = import_node_net.default.connect({ host: address, port });
  socket.setTimeout(2e3, () => socket.destroy(Error("\u684C\u9762\u7AEF\u53E3\u8FDE\u63A5\u8D85\u65F6")));
  socket.once("error", reject);
  socket.once("connect", () => {
    socket.destroy();
    resolve();
  });
});
function rdpProfile(address, port, username = "") {
  const endpoint = address.includes(":") && !address.startsWith("[") ? "[" + address + "]" : address;
  return [`full address:s:${endpoint}:${port}`, `username:s:${username}`, "screen mode id:i:2", "session bpp:i:32", "use multimon:i:0", "dynamic resolution:i:1", "smart sizing:i:1", "networkautodetect:i:1", "bandwidthautodetect:i:1", "compression:i:1", "bitmapcachepersistenable:i:1", "authentication level:i:2", "enablecredsspsupport:i:1", "redirectclipboard:i:0", "redirectprinters:i:0", "drivestoredirect:s:", "audiomode:i:0"].join("\r\n") + "\r\n";
}
async function openHostDesktop(hostId) {
  const host = getCloudHost(hostId), profile = host.desktop;
  if (!profile) throw Error("\u8BF7\u5148\u914D\u7F6E\u6B64\u4E3B\u673A\u7684\u8FDC\u7A0B\u684C\u9762");
  const existing = listHostDesktops(hostId).find((d) => d.state === "ready");
  if (existing) return existing;
  for (const item of listHostDesktops(hostId)) await closeHostDesktop(hostId, item.id);
  const value = { id: (0, import_node_crypto.randomUUID)(), hostId, protocol: profile.protocol, state: "connecting", address: profile.address, port: profile.port, createdAt: Date.now(), sockets: /* @__PURE__ */ new Set() };
  desktops.set(value.id, value);
  try {
    if (profile.viaHostId) {
      const target = cloudHostTarget(profile.viaHostId), config = tunnelConfig(target), reserve = import_node_net.default.createServer(), port = await listen(reserve);
      await new Promise((r) => reserve.close(() => r()));
      if (value.cancelled) throw Error("\u684C\u9762\u8FDE\u63A5\u5DF2\u53D6\u6D88");
      const args = ["-N", "-T", "-o", "ExitOnForwardFailure=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2"];
      for (const [field, flag] of [["port", "-p"], ["identity_file", "-i"], ["known_hosts", "-o"], ["ssh_config", "-F"], ["proxy_jump", "-J"]]) if (config[field]) args.push(flag, field === "known_hosts" ? "UserKnownHostsFile=" + JSON.stringify(config[field]) : String(config[field]));
      const remoteAddress = profile.address.includes(":") && !profile.address.startsWith("[") ? "[" + profile.address + "]" : profile.address;
      args.push("-L", `127.0.0.1:${port}:${remoteAddress}:${profile.port}`, target.host);
      const env = childEnv();
      if (config.askpass) Object.assign(env, { SSH_ASKPASS: config.askpass, SSH_ASKPASS_REQUIRE: "force", DISPLAY: "cloud-hosts" });
      const child = (0, import_node_child_process.spawn)("ssh", args, { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
      value.child = child;
      let failure = "", exited = false;
      child.stderr.on("data", (data) => failure = (failure + data).slice(-3e3));
      child.on("error", (error) => {
        failure = error.message;
        exited = true;
        value.state = "disconnected";
        value.error = failure;
      });
      child.on("exit", () => {
        exited = true;
        value.state = "disconnected";
        value.error = failure.trim() || "SSH \u684C\u9762\u901A\u9053\u5DF2\u65AD\u5F00";
        for (const socket of value.sockets) socket.destroy();
        for (const client of value.wss?.clients ?? []) client.close(1011, "SSH disconnected");
      });
      let ready = false;
      for (let i = 0; i < 100 && !exited && !value.cancelled; i++) {
        try {
          await reachable("127.0.0.1", port);
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      if (value.cancelled) throw Error("\u684C\u9762\u8FDE\u63A5\u5DF2\u53D6\u6D88");
      if (!ready || exited) throw Error(failure.trim() || "SSH \u684C\u9762\u901A\u9053\u672A\u80FD\u5EFA\u7ACB");
      value.address = "127.0.0.1";
      value.port = port;
    } else await reachable(value.address.replace(/^\[|\]$/g, ""), value.port);
    if (value.cancelled) throw Error("\u684C\u9762\u8FDE\u63A5\u5DF2\u53D6\u6D88");
    if (profile.protocol === "rdp") {
      value.profile = rdpProfile(value.address, value.port, profile.username);
      const dir = import_node_path.default.join(APP_HOME, "cloud-hosts", "desktops");
      import_node_fs.default.mkdirSync(dir, { recursive: true, mode: 448 });
      value.file = import_node_path.default.join(dir, value.id + ".rdp");
      import_node_fs.default.writeFileSync(value.file, value.profile, { mode: 384 });
    } else {
      const ticket = (0, import_node_crypto.randomUUID)(), server = import_node_http.default.createServer((_req, res) => {
        res.writeHead(404);
        res.end();
      }), wss = new import_ws.WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false });
      value.server = server;
      value.wss = wss;
      server.on("connection", (socket) => {
        value.sockets.add(socket);
        socket.on("close", () => value.sockets.delete(socket));
      });
      server.on("upgrade", (req, socket, head) => {
        const origin = req.headers.origin;
        let allowed = !origin || origin === "null";
        try {
          if (origin) {
            const url = new URL(origin);
            allowed = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
          }
        } catch {
        }
        if (req.url !== "/" + ticket || !allowed) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          const tcp = import_node_net.default.connect({ host: value.address.replace(/^\[|\]$/g, ""), port: value.port }), stream = (0, import_ws.createWebSocketStream)(ws);
          value.sockets.add(tcp);
          tcp.setNoDelay(true);
          tcp.on("close", () => {
            value.sockets.delete(tcp);
            stream.destroy();
          });
          tcp.on("error", () => stream.destroy());
          stream.on("error", () => tcp.destroy());
          stream.on("close", () => tcp.destroy());
          stream.pipe(tcp).pipe(stream);
        });
      });
      value.wsUrl = `ws://127.0.0.1:${await listen(server)}/${ticket}`;
    }
    if (value.cancelled) throw Error("\u684C\u9762\u8FDE\u63A5\u5DF2\u53D6\u6D88");
    if (value.state === "disconnected") throw Error(value.error || "SSH \u684C\u9762\u901A\u9053\u5DF2\u65AD\u5F00");
    value.state = "ready";
    return info(value);
  } catch (error) {
    await disposeDesktop(value);
    throw error;
  }
}
const opening = /* @__PURE__ */ new Map();
async function connectHostDesktop(id) {
  let pending = opening.get(id);
  if (!pending) {
    pending = openHostDesktop(id);
    opening.set(id, pending);
  }
  try {
    return await pending;
  } finally {
    opening.delete(id);
  }
}
async function launchHostDesktop(id, session) {
  const value = desktop(id, session);
  if (value.protocol !== "rdp" || value.state !== "ready" || !value.file) throw Error("\u8BF7\u5148\u5EFA\u7ACB RDP \u8FDE\u63A5");
  const run = (0, import_node_util.promisify)(import_node_child_process.execFile);
  if (process.platform === "darwin") await run("/usr/bin/open", ["-b", "com.microsoft.rdc.macos", value.file], { timeout: 1e4 });
  else if (process.platform === "win32") {
    const child = (0, import_node_child_process.spawn)("mstsc.exe", [value.file], { detached: true, stdio: "ignore" });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
  } else await run("xdg-open", [value.file], { timeout: 1e4 });
  return { launched: true, id: value.id, authenticated: false };
}
function disposeDesktop(value) {
  if (value.closing) return value.closing;
  value.cancelled = true;
  value.state = "disconnected";
  value.closing = (async () => {
    for (const socket of value.sockets) socket.destroy();
    for (const client of value.wss?.clients ?? []) client.terminate();
    value.wss?.close();
    if (value.server) await new Promise((resolve) => value.server.close(() => resolve()));
    if (value.child && value.child.exitCode === null && value.child.signalCode === null) {
      const child = value.child;
      await new Promise((resolve) => {
        const timer = setTimeout(() => child.kill("SIGKILL"), 2e3);
        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill("SIGTERM");
      });
    }
    if (value.file) import_node_fs.default.rmSync(value.file, { force: true });
    desktops.delete(value.id);
  })();
  return value.closing;
}
async function closeHostDesktop(id, session) {
  const value = desktops.get(session);
  if (!value) return { closed: true, alreadyClosed: true };
  if (value.hostId !== id) throw Error('桌面连接不属于此云主机');
  value.cancelled = true;
  value.state = "disconnected";
  value.child?.kill("SIGTERM");
  const pending = opening.get(id);
  if (pending) try {
    await pending;
  } catch {
  }
  await disposeDesktop(value);
  return { closed: true };
}
function assertHostIdle(id) {
  if (hostTerminals(id).some((t) => t.running) || listHostDesktops().some((d) => d.state !== "disconnected" && (d.hostId === id || getCloudHost(d.hostId).desktop?.viaHostId === id)) || opening.has(id)) throw Error("\u6B64\u4E3B\u673A\u4ECD\u6709\u4EA4\u4E92\u8FDE\u63A5\uFF0C\u8BF7\u5148\u5173\u95ED\u7EC8\u7AEF\u4E0E\u8FDC\u7A0B\u684C\u9762\u518D\u4FEE\u6539\u6216\u5220\u9664");
}
async function closeHostConnections(hostId) {
  await Promise.all(listHostDesktops(hostId).map((item) => closeHostDesktop(item.hostId, item.id)));
}
const closeHostTerminals = (id) => closeEmployeeTerminals(owner(id));
