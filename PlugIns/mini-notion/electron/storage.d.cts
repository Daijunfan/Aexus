import type { AgentMessage, Page, Version, Workspace } from '../src/types';
export function validateWorkspace(value: unknown): Workspace;
export function assetPath(directory: string, url: string, workspaceRoot?:string): string;
export function atomicWrite(path: string, value: unknown): void;
export class Storage {
  directory: string;
  file: string;
  assets: string;
  versionDirectory: string;
  spacesDirectory: string;
  agentsDirectory: string;
  current: Workspace | null;
  constructor(directory: string);
  load(): Workspace | null;
  save(workspace: Workspace): number;
  snapshot(page: Page): void;
  versions(id: string): Version[];
  saveAsset(name: string, bytes: ArrayBuffer | Uint8Array): string;
  assetPath(url: string): string;
  spaceRoot(pageId: string): string;
  spaceDirectory(pageId: string, folderId: string | null): string;
  saveSpaceFile(
    pageId: string,
    folderId: string | null,
    name: string,
    bytes: ArrayBuffer | Uint8Array,
  ): { filename: string; path: string; url: string };
  resolveWithinSpace(pageId: string, target: string): string;
  removeSpace(pageId: string): void;
  agentLogFile(pageId: string, conversationId?: string): string;
  appendAgentLog(pageId: string, entries: unknown, conversationId?: string): void;
  readAgentLog(pageId: string, limit?: number, conversationId?: string): AgentMessage[];
  removeAgentLog(pageId: string): void;
}
