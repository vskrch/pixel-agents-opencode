import * as os from 'os';
import * as path from 'path';

export type AgentType = 'claude' | 'opencode' | 'antigravity' | 'cursor' | 'aider' | 'unknown';

export interface AgentTypeConfig {
  type: AgentType;
  displayName: string;
  sessionFilePattern: RegExp;
  sessionDirPattern: RegExp;
  sessionRootDir: string;
  terminalNamePattern: RegExp;
  launchCommand: string[];
  color: string;
}

export const AGENT_TYPE_CONFIGS: Record<AgentType, AgentTypeConfig> = {
  claude: {
    type: 'claude',
    displayName: 'Claude Code',
    sessionFilePattern: /^[a-f0-9-]{36}\.jsonl$/,
    sessionDirPattern: /\.claude[\/\\]projects/,
    sessionRootDir: path.join(os.homedir(), '.claude', 'projects'),
    terminalNamePattern: /claude/i,
    launchCommand: ['claude', '--session-id'],
    color: '#D97706',
  },
  opencode: {
    type: 'opencode',
    displayName: 'OpenCode',
    sessionFilePattern: /^msg_[a-z0-9]+\.json$/,
    sessionDirPattern: /\.opencode[\/\\]messages/,
    sessionRootDir: path.join(os.homedir(), '.opencode', 'messages'),
    terminalNamePattern: /opencode/i,
    launchCommand: ['opencode'],
    color: '#10B981',
  },
  antigravity: {
    type: 'antigravity',
    displayName: 'Antigravity',
    sessionFilePattern: /^(cloudcode|editSessions|artifacts|main)\.log$/,
    sessionDirPattern: /Antigravity[\/\\]logs/,
    sessionRootDir: path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Antigravity',
      'logs',
    ),
    terminalNamePattern: /antigravity/i,
    launchCommand: ['antigravity'],
    color: '#8B5CF6',
  },
  cursor: {
    type: 'cursor',
    displayName: 'Cursor',
    sessionFilePattern: /^cursor-[a-f0-9-]{36}\.json$/,
    sessionDirPattern: /\.cursor[\/\\]conversations/,
    sessionRootDir: path.join(os.homedir(), '.cursor', 'conversations'),
    terminalNamePattern: /cursor/i,
    launchCommand: ['cursor-agent'],
    color: '#3B82F6',
  },
  aider: {
    type: 'aider',
    displayName: 'Aider',
    sessionFilePattern: /^aider-[a-f0-9-]{8}\.jsonl$/,
    sessionDirPattern: /\.aider[\/\\]history/,
    sessionRootDir: path.join(os.homedir(), '.aider', 'history'),
    terminalNamePattern: /aider/i,
    launchCommand: ['aider'],
    color: '#EC4899',
  },
  unknown: {
    type: 'unknown',
    displayName: 'Unknown Agent',
    sessionFilePattern: /.*/,
    sessionDirPattern: /.*/,
    sessionRootDir: path.join(os.homedir(), '.agents', 'sessions'),
    terminalNamePattern: /.*/,
    launchCommand: [],
    color: '#6B7280',
  },
};

export function detectAgentTypeFromTerminal(terminalName: string): AgentType {
  for (const [type, config] of Object.entries(AGENT_TYPE_CONFIGS)) {
    if (config.terminalNamePattern.test(terminalName)) {
      return type as AgentType;
    }
  }
  return 'unknown';
}

export const GLOBAL_AGENT_ROOTS = Object.values(AGENT_TYPE_CONFIGS)
  .filter((config) => config.type !== 'unknown')
  .map((config) => ({ type: config.type, root: config.sessionRootDir }));

export function detectAgentTypeFromPath(filePath: string): AgentType {
  for (const [type, config] of Object.entries(AGENT_TYPE_CONFIGS)) {
    if (config.sessionDirPattern.test(filePath)) {
      return type as AgentType;
    }
  }
  return 'unknown';
}

export function detectAgentTypeFromFile(filename: string): AgentType {
  for (const [type, config] of Object.entries(AGENT_TYPE_CONFIGS)) {
    if (config.sessionFilePattern.test(filename)) {
      return type as AgentType;
    }
  }
  return 'unknown';
}

export function getSessionDir(agentType: AgentType, cwd: string): string {
  const home = os.homedir();

  switch (agentType) {
    case 'claude':
      const dirName = cwd.replace(/[^a-zA-Z0-9-]/g, '-');
      return path.join(home, '.claude', 'projects', dirName);
    case 'opencode':
      return path.join(home, '.opencode', 'messages');
    case 'antigravity':
      return path.join(home, '.antigravity', 'logs');
    case 'cursor':
      return path.join(home, '.cursor', 'conversations');
    case 'aider':
      return path.join(home, '.aider', 'history');
    default:
      return path.join(home, '.agents', 'sessions');
  }
}

export function getOpenCodeSessionIdFromDir(sessionDir: string): string | null {
  const match = sessionDir.match(/ses_[a-z0-9]+$/i);
  return match ? match[0] : null;
}
