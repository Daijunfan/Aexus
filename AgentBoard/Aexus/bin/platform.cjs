// Shared by the Node CLI and bundled Core; no Electron dependency.
const path = require('node:path');
const {createHash} = require('node:crypto');
exports.controlEndpoint = (home, platform = process.platform) => {
  const resolved=path.resolve(home);
  if(platform==='win32')return '\\\\.\\pipe\\agents-company-' + createHash('sha256').update(resolved.toLowerCase()).digest('hex').slice(0, 24);
  const socket=path.join(home,'agents.sock');
  // macOS rejects Unix socket paths over 103 bytes, including private test
  // homes and long account names. CLI and Core derive the same stable endpoint.
  return Buffer.byteLength(socket)<=95?socket:path.join('/tmp','aexus-'+process.getuid()+'-'+createHash('sha256').update(resolved).digest('hex').slice(0,24)+'.sock');
};
