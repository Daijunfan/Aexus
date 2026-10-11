import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { Transform } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import type { SDKControlRequest, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';

/** Multiplex public SDK control frames; ordinary messages and SDK-owned replies stay with the SDK. */
export class ClaudeControl {
  private child?: ChildProcess;
  private pending = new Map<string, { resolve(value: any): void; reject(error: Error): void }>();
  attach(child: ChildProcess): SpawnedProcess {
    this.child = child;
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    const dispatch = (line: string) => {
      if (line.includes('control_response')) {
        let data: any;
        try { data = JSON.parse(line); } catch { /* The SDK reports invalid frames. */ }
        const response = data?.type === 'control_response' && data.response;
        const pending = response && this.pending.get(response.request_id);
        if (pending) {
          this.pending.delete(response.request_id);
          if (response.subtype === 'error') pending.reject(new Error(response.error));
          else pending.resolve(response.response ?? null);
          return;
        }
      }
      output.push(line + '\n');
    };
    const output = new Transform({
      transform(chunk, _encoding, done) {
        buffer += decoder.write(chunk);
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          dispatch(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
        done();
      },
      flush(done) { buffer += decoder.end(); if (buffer) dispatch(buffer); done(); },
    });
    child.stdout!.pipe(output);
    child.once('exit', () => this.close());
    child.once('error', (error) => this.close(error));
    return {
      stdin: child.stdin!, stdout: output,
      get killed() { return child.killed; },
      get exitCode() { return child.exitCode; },
      get signalCode() { return child.signalCode; },
      kill: child.kill.bind(child), on: child.on.bind(child), once: child.once.bind(child), off: child.off.bind(child),
    };
  }
  request(request: SDKControlRequest['request']): Promise<any> {
    if (!this.child?.stdin?.writable) return Promise.reject(new Error('Claude 控制连接未就绪'));
    const request_id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(request_id, { resolve, reject });
      this.child!.stdin!.write(JSON.stringify({ type: 'control_request', request_id, request }) + '\n', (error) => {
        if (error) { this.pending.delete(request_id); reject(error); }
      });
    });
  }
  close(error = new Error('Claude 控制连接已关闭')) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
