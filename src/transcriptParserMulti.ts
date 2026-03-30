import type { AgentType } from './agentTypes.js';

export interface ParsedToolUse {
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface ParsedTranscriptRecord {
  type: 'tool_use' | 'tool_result' | 'thinking' | 'text' | 'turn_end' | 'progress' | 'unknown';
  toolUse?: ParsedToolUse;
  toolResultId?: string;
  isStreaming?: boolean;
  subToolUse?: ParsedToolUse;
  subToolResultId?: string;
}

export function parseClaudeTranscriptLine(line: string): ParsedTranscriptRecord | null {
  try {
    const record = JSON.parse(line);
    const assistantContent = record.message?.content ?? record.content;

    // Turn end signal
    if (record.type === 'system' && record.subtype === 'turn_duration') {
      return { type: 'turn_end' };
    }

    // Tool use from assistant message
    if (record.type === 'assistant' && Array.isArray(assistantContent)) {
      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            toolUse: {
              toolId: block.id,
              toolName: block.name,
              input: block.input as Record<string, unknown>,
            },
          };
        }
        if (block.type === 'thinking') {
          return { type: 'thinking' };
        }
      }
    }

    // Tool result from user message
    if (record.type === 'user' && Array.isArray(record.message?.content)) {
      for (const block of record.message.content) {
        if (block.type === 'tool_result') {
          return {
            type: 'tool_result',
            toolResultId: block.tool_use_id,
          };
        }
      }
    }

    // Progress (sub-agent activity)
    if (record.type === 'progress' && record.data) {
      const data = record.data;
      if (data.type === 'agent_progress') {
        if (data.kind === 'tool_use') {
          return {
            type: 'progress',
            subToolUse: {
              toolId: data.tool_id || data.tool_use_id,
              toolName: data.name || data.tool_name,
              input: data.input || {},
            },
          };
        }
        if (data.kind === 'tool_result') {
          return {
            type: 'progress',
            subToolResultId: data.tool_id || data.tool_use_id,
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function parseOpenCodeTranscriptLine(line: string): ParsedTranscriptRecord | null {
  try {
    const record = JSON.parse(line);

    if (record.role === 'user') {
      return { type: 'thinking' };
    }

    if (record.role === 'assistant') {
      return { type: 'turn_end' };
    }

    // OpenCode format: similar structure but may have different field names
    if (record.event === 'tool_start') {
      return {
        type: 'tool_use',
        toolUse: {
          toolId: record.id || record.tool_id,
          toolName: record.tool || record.tool_name,
          input: record.params || record.input || {},
        },
      };
    }

    if (record.event === 'tool_end' || record.event === 'tool_result') {
      return {
        type: 'tool_result',
        toolResultId: record.id || record.tool_id,
      };
    }

    if (record.event === 'thinking' || record.type === 'thinking') {
      return { type: 'thinking' };
    }

    if (record.event === 'turn_complete' || record.event === 'done') {
      return { type: 'turn_end' };
    }

    // Streaming progress
    if (record.event === 'streaming' || record.streaming) {
      return {
        type: 'tool_use',
        isStreaming: true,
        toolUse: {
          toolId: record.id || 'streaming',
          toolName: record.tool || 'streaming',
          input: {},
        },
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function parseAntigravityTranscriptLine(line: string): ParsedTranscriptRecord | null {
  try {
    const record = JSON.parse(line);

    // Antigravity format
    if (record.action === 'invoke_tool' || record.type === 'tool_call') {
      return {
        type: 'tool_use',
        toolUse: {
          toolId: record.call_id || record.id,
          toolName: record.tool_name || record.name,
          input: record.arguments || record.input || {},
        },
      };
    }

    if (record.action === 'tool_result' || record.type === 'tool_response') {
      return {
        type: 'tool_result',
        toolResultId: record.call_id || record.id,
      };
    }

    if (record.type === 'thinking' || record.status === 'thinking') {
      return { type: 'thinking' };
    }

    if (record.event === 'complete' || record.status === 'done') {
      return { type: 'turn_end' };
    }

    return null;
  } catch {
    if (line.includes('Requesting planner with')) {
      return {
        type: 'tool_use',
        toolUse: {
          toolId: 'planner',
          toolName: 'planner',
          input: {},
        },
      };
    }

    if (line.includes('streamGenerateContent')) {
      return { type: 'thinking' };
    }

    if (line.includes('agent executor error') || line.includes('internal error')) {
      return { type: 'turn_end' };
    }

    return null;
  }
}

export function parseGenericTranscriptLine(line: string): ParsedTranscriptRecord | null {
  try {
    const record = JSON.parse(line);

    // Try to detect common patterns
    if (record.tool_use || record.toolUse) {
      const tu = record.tool_use || record.toolUse;
      return {
        type: 'tool_use',
        toolUse: {
          toolId: tu.id || tu.tool_id || crypto.randomUUID(),
          toolName: tu.name || tu.tool_name || 'unknown',
          input: tu.input || tu.arguments || {},
        },
      };
    }

    if (record.tool_result || record.toolResult) {
      const tr = record.tool_result || record.toolResult;
      return {
        type: 'tool_result',
        toolResultId: tr.id || tr.tool_id || tr.tool_use_id,
      };
    }

    if (record.type === 'tool_use' || record.type === 'tool_call') {
      return {
        type: 'tool_use',
        toolUse: {
          toolId: record.id || crypto.randomUUID(),
          toolName: record.name || record.tool_name || 'unknown',
          input: record.input || record.arguments || {},
        },
      };
    }

    if (record.type === 'tool_result' || record.type === 'tool_response') {
      return {
        type: 'tool_result',
        toolResultId: record.id || record.tool_use_id,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function parseTranscriptLineByType(
  line: string,
  agentType: AgentType,
): ParsedTranscriptRecord | null {
  switch (agentType) {
    case 'claude':
      return parseClaudeTranscriptLine(line);
    case 'opencode':
      return parseOpenCodeTranscriptLine(line);
    case 'antigravity':
      return parseAntigravityTranscriptLine(line);
    default:
      return parseGenericTranscriptLine(line);
  }
}
