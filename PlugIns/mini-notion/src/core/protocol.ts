import type { Workspace } from '../types.ts';

export const API_VERSION = 1;
export type CommandParams = Record<string, any>;
export type CommandDefinition = {
  method: string;
  description: string;
  mutates?: boolean;
  examples?: CommandParams[];
  arguments?: { name: string; description: string; required?: boolean }[];
  options?: Record<string, { type: 'string' | 'number' | 'boolean' | 'json' | 'list'; description: string; required?: boolean }>;
};
export type ApiRequest = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: CommandParams;
  client?: string;
  agentToken?: string;
  stateMode?: 'full' | 'delta' | 'none';
};
export type ApiResponse = {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: string; message: string; details?: any };
  revision: number;
  workspace?: Workspace | null;
  delta?: import('./stateDelta').WorkspaceDelta;
};
export type StateEvent = {
  type: 'state';
  workspace: Workspace | null;
  revision: number;
  requestId?: string;
  method?: string;
  resolution?: { id: string; patchId: string; strategy: 'local' | 'remote' };
};
export type UiEvent = { type: 'ui'; command: string; params?: CommandParams; requestId?: string };
export type AgentEventMessage = {
  type: 'agent';
  pageId: string;
  conversationId?: string;
  event:
    | {
        kind: 'status';
        status: import('../types').AgentConfig['status'];
        engine: import('../types').SpaceEngine;
        error?: string;
      }
    | { kind: 'message'; message: import('../types').AgentMessage }
    | { kind: 'usage'; usage: import('../types').AgentConfig['usage'] }
    | { kind: 'session'; sessionId: string };
};
export type ServiceEvent =
  | StateEvent
  | { type: 'delta'; delta: import('./stateDelta').WorkspaceDelta; revision: number; requestId?: string; method?: string; resolution?: StateEvent['resolution'] }
  | UiEvent
  | AgentEventMessage
  | { type: 'notification'; item: import('../scheduling/types').InboxItem }
  | { type: 'shutdown' };

export function toWireResponse(response: ApiResponse | (Omit<ApiResponse, 'id'> & { id: null })) {
  if (!response.error) return response;
  const error = response.error;
  const codes: Record<string, number> = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_ARGUMENT: -32602,
  };
  return {
    ...response,
    error: {
      code: codes[error.code] || -32000,
      message: error.message,
      data: { code: error.code, ...(error.details === undefined ? {} : { details: error.details }) },
    },
  };
}
export function fromWireResponse(response: any): ApiResponse {
  if (typeof response.error?.code !== 'number') return response;
  return {
    ...response,
    error: {
      code: response.error.data?.code || 'RPC_ERROR',
      message: response.error.message,
      details: response.error.data?.details,
    },
  };
}
