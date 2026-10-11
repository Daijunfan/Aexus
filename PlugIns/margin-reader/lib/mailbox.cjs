'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { assert, ReaderError, safePath } = require('./safety.cjs');

// The host owns identity and execution. Never replace a failed mailbox with a
// standalone runtime: that would bypass employee authorization and revocation.
async function mailboxClient(workspace, mailbox, { timeoutMs = 300000, pollMs = 60 } = {}) {
  assert(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300000, 'INVALID_PARAMS', 'Mailbox timeout must be between 0 and 300000 ms.');
  assert(Number.isFinite(pollMs) && pollMs > 0, 'INVALID_PARAMS', 'Mailbox polling interval must be positive.');
  const root = path.resolve(workspace), directory = path.resolve(mailbox);
  const boundary=await require('./mailbox-boundary.cjs').mailboxBoundary(root,directory);
  const checkedFile=boundary.checkedFile;
  async function readHost() {
    let host;
    try { host = JSON.parse(await fs.readFile(await checkedFile('host.json'), 'utf8')); }
    catch (error) { if (error.code === 'SCOPE_DENIED') throw error; throw new ReaderError('HOST_UNAVAILABLE', 'The assigned plugin mailbox is unavailable. Reopen the employee in Agents Company.'); }
    assert(typeof host?.workspace === 'string' && path.resolve(host.workspace) === root, 'SCOPE_DENIED', 'Mailbox workspace differs from the requested workspace.');
    assert(Number.isSafeInteger(host.pid) && host.pid > 0, 'HOST_UNAVAILABLE', 'Mailbox host metadata is invalid.');
    try { process.kill(host.pid, 0); }
    catch (error) {
      // EPERM also means the PID exists; restricted employee processes may not
      // be permitted to signal the host. Other failures must not silently wait.
      if (error.code !== 'EPERM') throw new ReaderError('HOST_UNAVAILABLE', 'The assigned plugin host is no longer running.');
    }
    return host;
  }
  const host = await readHost();
  let auth = boundary.token || process.env.AGENTS_COMPANY_TOKEN?.trim();
  if (!auth && process.env.AGENTS_COMPANY_TOKEN_FILE) {
    try { auth = (await fs.readFile(process.env.AGENTS_COMPANY_TOKEN_FILE, 'utf8')).trim(); }
    catch { throw new ReaderError('AUTH_REQUIRED', 'The assigned employee credential is unreadable. Reopen the employee; no global credential fallback is used.'); }
  }
  assert(auth, 'AUTH_REQUIRED', 'Assigned employee credentials are missing. No global credential fallback is used.');
  let closed = false;
  return {
    async close() { closed = true; },
    async request(request) {
      assert(!closed, 'RUNTIME_CLOSED', 'Mailbox client is closed.');
      assert(request?.jsonrpc === '2.0' && typeof request.method === 'string' && typeof request.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.id), 'INVALID_REQUEST', 'Mailbox requests require a UUID ID and JSON-RPC 2.0 method.');
      const input = path.join(directory, `${request.id}.request.json`), output = path.join(directory, `${request.id}.response.json`), temporary = input + '.tmp';
      const details = { requestId: request.id, method: request.method, mayHaveCompleted: true };
      let submitted = false;
      try {
        assert((await readHost()).pid === host.pid, 'HOST_UNAVAILABLE', 'The plugin host restarted. Reopen the employee before retrying.');
        await checkedFile(path.basename(input));
        await fs.writeFile(temporary, JSON.stringify({ ...request, auth }), { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, input); submitted = true;
        const deadline = Date.now() + timeoutMs;
        while (!closed && Date.now() < deadline) {
          let raw;
          try { raw = await fs.readFile(await checkedFile(path.basename(output)), 'utf8'); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
          if (raw !== undefined) {
            let reply;
            try { reply = JSON.parse(raw); }
            catch { throw new ReaderError('INVALID_RESPONSE', 'The host returned malformed JSON. Inspect state before retrying.', details); }
            const error = reply?.error;
            // The current host uses id:null for pre-dispatch authorization errors.
            const validError = error && typeof error === 'object' && Number.isFinite(error.code) && typeof error.message === 'string';
            assert(reply?.jsonrpc === '2.0' && (reply.id === request.id || reply.id === null && validError) &&
              (Object.hasOwn(reply, 'result') ? !Object.hasOwn(reply, 'error') : validError),
            'INVALID_RESPONSE', 'The host response does not match this request. Inspect state before retrying.', details);
            await fs.rm(output, { force: true });
            return reply;
          }
          assert((await readHost()).pid === host.pid, 'HOST_UNAVAILABLE', 'The plugin host restarted while processing the request.');
          await new Promise(resolve => setTimeout(resolve, Math.min(pollMs, Math.max(1, deadline - Date.now()))));
        }
        throw new ReaderError(closed ? 'RUNTIME_CLOSED' : 'REQUEST_TIMEOUT', 'No final host response was received. The operation may still finish; inspect its state before retrying.', details);
      } catch (error) {
        if (submitted) error.details = { ...error.details, ...details };
        throw error;
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => {});
        // Do not delete a submitted request or retry it: timeout/disconnection
        // does not establish whether a mutation already committed in the host.
      }
    }
  };
}
module.exports = { mailboxClient };
