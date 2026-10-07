// Shared by the Node CLI and bundled Core; no Electron dependency.
const path = require('node:path');
const {createHash} = require('node:crypto');
exports.controlEndpoint = (home, platform = process.platform) => platform === 'win32'
  ? '\\\\.\\pipe\\agents-company-' + createHash('sha256').update(path.resolve(home).toLowerCase()).digest('hex').slice(0, 24)
  : path.join(home, 'agents.sock');
