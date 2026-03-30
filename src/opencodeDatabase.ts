import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export interface OpenCodeToolPart {
  id: string;
  message_id: string;
  session_id: string;
  toolName: string;
  callID: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  input?: Record<string, unknown>;
  time_created: number;
}

export interface OpenCodeSession {
  id: string;
  project_id: string;
  directory: string;
  title: string;
  time_created: number;
  time_updated: number;
}

const OPENCODE_DB_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
const OPENCODE_DB_WAL_PATH = OPENCODE_DB_PATH + '-wal';

let lastPolledPartId: string | null = null;

export function getOpenCodeDbPath(): string {
  return OPENCODE_DB_PATH;
}

export function openCodeDbExists(): boolean {
  return fs.existsSync(OPENCODE_DB_PATH);
}

export function getOpenCodeSessions(): OpenCodeSession[] {
  if (!openCodeDbExists()) {
    return [];
  }

  try {
    const query = `SELECT id, project_id, directory, title, time_created, time_updated FROM session ORDER BY time_updated DESC LIMIT 10`;
    const result = executeSQLiteQuery(query);
    return parseSessionResults(result);
  } catch (e) {
    console.log(`[Pixel Agents] Error querying OpenCode sessions: ${e}`);
    return [];
  }
}

export function getActiveOpenCodeSession(cwd?: string): OpenCodeSession | null {
  const sessions = getOpenCodeSessions();
  if (sessions.length === 0) return null;

  if (cwd) {
    const matching = sessions.find((s) => s.directory === cwd);
    if (matching) return matching;
  }

  return sessions[0];
}

export function getRecentToolParts(sessionId?: string, sinceId?: string): OpenCodeToolPart[] {
  if (!openCodeDbExists()) {
    return [];
  }

  try {
    let query: string;
    if (sinceId) {
      query = `
        SELECT p.id, p.message_id, p.session_id, p.time_created,
               json_extract(p.data, '$.type') as part_type,
               json_extract(p.data, '$.tool') as tool,
               json_extract(p.data, '$.callID') as call_id,
               json_extract(p.data, '$.state.status') as status,
               json_extract(p.data, '$.state.input') as input
        FROM part p
        WHERE p.id > '${sinceId}'
          AND json_extract(p.data, '$.type') = 'tool'
        ORDER BY p.time_created ASC
        LIMIT 100
      `;
    } else {
      const sessionFilter = sessionId ? `AND p.session_id = '${sessionId}'` : '';
      query = `
        SELECT p.id, p.message_id, p.session_id, p.time_created,
               json_extract(p.data, '$.type') as part_type,
               json_extract(p.data, '$.tool') as tool,
               json_extract(p.data, '$.callID') as call_id,
               json_extract(p.data, '$.state.status') as status,
               json_extract(p.data, '$.state.input') as input
        FROM part p
        WHERE json_extract(p.data, '$.type') = 'tool'
        ${sessionFilter}
        ORDER BY p.time_created DESC
        LIMIT 50
      `;
    }

    const result = executeSQLiteQuery(query);
    return parseToolPartResults(result);
  } catch (e) {
    console.log(`[Pixel Agents] Error querying OpenCode tool parts: ${e}`);
    return [];
  }
}

export function getNewToolPartsSince(sessionId: string, lastTime: number): OpenCodeToolPart[] {
  if (!openCodeDbExists()) {
    return [];
  }

  try {
    const query = `
      SELECT p.id, p.message_id, p.session_id, p.time_created,
             json_extract(p.data, '$.type') as part_type,
             json_extract(p.data, '$.tool') as tool,
             json_extract(p.data, '$.callID') as call_id,
             json_extract(p.data, '$.state.status') as status,
             json_extract(p.data, '$.state.input') as input
      FROM part p
      WHERE p.session_id = '${sessionId}'
        AND p.time_created > ${lastTime}
        AND json_extract(p.data, '$.type') = 'tool'
      ORDER BY p.time_created ASC
      LIMIT 100
    `;

    const result = executeSQLiteQuery(query);
    return parseToolPartResults(result);
  } catch (e) {
    console.log(`[Pixel Agents] Error querying new OpenCode tool parts: ${e}`);
    return [];
  }
}

export function getLatestPartId(sessionId: string): string | null {
  if (!openCodeDbExists()) {
    return null;
  }

  try {
    const query = `
      SELECT p.id FROM part p
      WHERE p.session_id = '${sessionId}'
        AND json_extract(p.data, '$.type') = 'tool'
      ORDER BY p.time_created DESC
      LIMIT 1
    `;
    const result = executeSQLiteQuery(query);
    const lines = result
      .trim()
      .split('\n')
      .filter((l) => l);
    return lines.length > 0 ? lines[0] : null;
  } catch {
    return null;
  }
}

function executeSQLiteQuery(query: string): string {
  const escapedQuery = query.replace(/'/g, "'\\''");
  const cmd = `sqlite3 "${OPENCODE_DB_PATH}" "${escapedQuery}"`;
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 5000, maxBuffer: 1024 * 1024 });
  } catch (e) {
    throw e;
  }
}

function parseSessionResults(result: string): OpenCodeSession[] {
  const sessions: OpenCodeSession[] = [];
  const lines = result
    .trim()
    .split('\n')
    .filter((l) => l);

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 6) {
      sessions.push({
        id: parts[0],
        project_id: parts[1],
        directory: parts[2],
        title: parts[3],
        time_created: parseInt(parts[4], 10),
        time_updated: parseInt(parts[5], 10),
      });
    }
  }

  return sessions;
}

function parseToolPartResults(result: string): OpenCodeToolPart[] {
  const parts: OpenCodeToolPart[] = [];
  const lines = result
    .trim()
    .split('\n')
    .filter((l) => l);

  for (const line of lines) {
    const cols = line.split('|');
    if (cols.length >= 8) {
      const toolName = cols[5] || '';
      const callID = cols[6] || '';
      const status = (cols[7] || 'pending') as OpenCodeToolPart['status'];

      let input: Record<string, unknown> | undefined;
      try {
        if (cols[8] && cols[8] !== 'null') {
          input = JSON.parse(cols[8]);
        }
      } catch {
        input = undefined;
      }

      parts.push({
        id: cols[0],
        message_id: cols[1],
        session_id: cols[2],
        time_created: parseInt(cols[3], 10),
        toolName,
        callID,
        status,
        input,
      });
    }
  }

  return parts;
}

export function formatOpenCodeToolStatus(
  toolName: string,
  input?: Record<string, unknown>,
): string {
  const getInputPath = (key: string): string => {
    const val = input?.[key];
    return typeof val === 'string' ? path.basename(val) : '';
  };

  switch (toolName) {
    case 'read':
      return `Reading ${getInputPath('filePath')}`;
    case 'write':
      return `Writing ${getInputPath('path')}`;
    case 'edit':
      return `Editing ${getInputPath('path')}`;
    case 'bash':
      const cmd = (input?.['command'] as string) || '';
      return cmd.length > 30 ? `Running: ${cmd.slice(0, 30)}…` : `Running: ${cmd}`;
    case 'glob':
      return 'Searching files';
    case 'grep':
      return 'Searching code';
    case 'webfetch':
      return 'Fetching web content';
    case 'task':
      const desc = (input?.['description'] as string) || '';
      return desc ? `Task: ${desc.slice(0, 40)}` : 'Running task';
    case 'skill':
      return `Loading skill: ${(input?.['name'] as string) || 'unknown'}`;
    case 'todowrite':
      return 'Updating tasks';
    default:
      return `Using ${toolName}`;
  }
}

export function getLastPolledPartId(): string | null {
  return lastPolledPartId;
}

export function setLastPolledPartId(id: string | null): void {
  lastPolledPartId = id;
}
