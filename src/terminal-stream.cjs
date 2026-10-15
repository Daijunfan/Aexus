const {WebSocketServer, WebSocket} = require('ws');

const FRAME_CHARS = 32768;
const OUTPUT_WINDOW = 4 * FRAME_CHARS;
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
function attach(server, prefix, dispatch) {
  const wss = new WebSocketServer({noServer: true, maxPayload: 8 * 1024 * 1024, perMessageDeflate: false});
  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const origin = request.headers.origin;
    if (url.pathname !== prefix + 'terminal-stream' ||
        origin && origin !== 'null' && origin !== `http://127.0.0.1:${server.address().port}`) {
      socket.destroy(); return;
    }
    const params = {id: url.searchParams.get('host'), terminal: url.searchParams.get('terminal')};
    const flow = url.searchParams.get('flow') === '1';
    let cursor = Number(url.searchParams.get('cursor') || 0);
    try {await dispatch('hosts.terminal-read', {...params, cursor, waitMs: 0});}
    catch {socket.destroy(); return;}
    if (socket.destroyed) return;
    wss.handleUpgrade(request, socket, head, ws => {
      const controller = new AbortController();
      let sequence = 0, outputChars = 0, outputResume, queuedInput = 0;
      const outstanding = new Map();
      const stop = () => {controller.abort(); outputResume?.(); outputResume = undefined; outstanding.clear();};
      const fail = error => {
        stop();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({error: error.message})); ws.close(1011);
        }
      };
      ws.on('close', stop); ws.on('error', stop);
      // ACKs bypass the serialized input queue. A slow PTY write must never
      // prevent output consumption, which would deadlock a large paste.
      let input = Promise.resolve(), inputFailed = false;
      ws.on('message', raw => {
        let event;
        try {
          event = JSON.parse(raw);
          if (event.op === 'ack') {
            if (!flow || !outstanding.has(event.seq)) throw Error('Invalid terminal output acknowledgement');
            outputChars -= outstanding.get(event.seq);outstanding.delete(event.seq);
            if (outputChars < OUTPUT_WINDOW) {outputResume?.();outputResume=undefined;}
            return;
          }
          if (!['input', 'resize'].includes(event.op)) throw Error('Unknown terminal event');
          if (event.op === 'input' && typeof event.data !== 'string') throw Error('Terminal input must be text');
          const bytes = event.op === 'input' ? Buffer.byteLength(event.data) : 0;
          if (queuedInput + bytes > MAX_INPUT_BYTES) throw Error('Terminal input queue is full; remaining input was not accepted');
          queuedInput += bytes;
          // Received input is drained even when the viewer switches away.
          input = input.then(async () => {
            try {
              if (inputFailed) return;
              if (event.op === 'input') {
                await dispatch('hosts.terminal-input', {...params, data: event.data});
                if (flow && ws.readyState === WebSocket.OPEN && event.seq !== undefined)
                  ws.send(JSON.stringify({inputAck: event.seq}));
              } else await dispatch('hosts.terminal-resize', {...params, cols: event.cols, rows: event.rows});
            } finally {queuedInput -= bytes;}
          }).catch(error => {inputFailed = true; fail(error);});
        } catch (error) {inputFailed = true; fail(error);}
      });
      const send = async reply => {
        if (flow) {
          reply = {...reply, seq: ++sequence};
          outstanding.set(sequence,reply.output.length);outputChars+=reply.output.length;
        }
        await new Promise((resolve, reject) => ws.send(JSON.stringify(reply), error => error ? reject(error) : resolve()));
        // Pipeline frames while keeping the browser's pending output bounded.
        if (flow && outputChars >= OUTPUT_WINDOW && !controller.signal.aborted)
          await new Promise(resolve => {outputResume=resolve;});
      };
      if (flow) ws.send(JSON.stringify({type: 'ready', protocol: 2}));
      void (async () => {
        while (!controller.signal.aborted && ws.readyState === WebSocket.OPEN) {
          const reply = await dispatch('hosts.terminal-read', {...params, cursor, waitMs: 15000, ...(flow?{maxChars:FRAME_CHARS}:{})}, controller.signal);
          if (controller.signal.aborted || ws.readyState !== WebSocket.OPEN) return;
          if (flow && reply.running && !reply.output) continue;
          if (flow && reply.output.length > FRAME_CHARS) {
            let end = FRAME_CHARS;
            const last = reply.output.charCodeAt(end - 1);
            if (last >= 0xD800 && last <= 0xDBFF) end--;
            const next = reply.cursor - reply.output.length + end;
            await send({...reply, output: reply.output.slice(0, end), cursor: next, running: true});
            cursor = next;
          } else {
            await send(reply); cursor = reply.cursor;
            if (!reply.running) {ws.close(1000); return;}
          }
        }
      })().catch(error => {if (!controller.signal.aborted) fail(error);});
    });
  });
  server.on('close', () => {for (const client of wss.clients) client.terminate(); wss.close();});
  return wss;
}
module.exports = {attach, FRAME_CHARS, OUTPUT_WINDOW};
