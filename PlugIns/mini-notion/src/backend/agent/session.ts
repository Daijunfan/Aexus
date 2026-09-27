import type { AgentConfig } from '../../types';
import type { AgentEnvironment } from './environment';

export type EngineHost = {
  environment: AgentEnvironment;
  options: NonNullable<AgentConfig['options']>;
  sessionId?: string;
  forkSession?: boolean;
  instructions: string;
  event(data: any): void;
  request(method: string, params: any, signal?: AbortSignal): Promise<any>;
};
export interface EngineSession {
  protocol(): Promise<any>;
  send(text: string, images?: string[], userMessageId?: string): Promise<void>;
  interrupt(): Promise<void>;
  control(method: string, params: any): Promise<any>;
  configure(options: NonNullable<AgentConfig['options']>): Promise<void>;
  reloadMcp?(serverName?: string): Promise<any>;
  close(): void;
}
